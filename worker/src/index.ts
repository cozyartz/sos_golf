import { DurableObject } from 'cloudflare:workers';

type JsonObject = Record<string, unknown>;

type RoundInput = {
  courseId: string;
  format?: 'stroke_play' | 'stableford' | 'match_play' | 'skins';
  teeSetId?: string;
  stateOfStickPersonId: string;
  stateOfStickOrganizationId?: string;
  scores: Array<{
    hole: number;
    strokes: number;
    tapVerified?: boolean;
    witnessConfirmed?: boolean;
    proofNote?: string;
  }>;
  clientRoundId?: string;
};

type RoundRecord = {
  id: string;
  courseId: string;
  format: string;
  status: string;
  stateOfStickPersonId: string;
  stateOfStickOrganizationId: string | null;
  scores: Array<{
    hole: number;
    strokes: number;
    tapVerified: boolean;
    witnessConfirmed: boolean;
    proofNote: string | null;
  }>;
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data: JsonObject, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function error(message: string, status: number, code: string): Response {
  return json({ error: { code, message } }, status);
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowedOrigin = origin && origin === env.PUBLIC_ORIGIN ? origin : env.PUBLIC_ORIGIN;
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-headers': 'authorization, content-type, x-state-of-stick-organization-id, x-state-of-stick-person-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'Origin',
  };
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request.headers.get('origin'), env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function isValidId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,80}$/.test(value);
}

function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 12;
}

function isValidGeometryJson(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 250_000) return false;
  try {
    const parsed = JSON.parse(value) as { type?: unknown; coordinates?: unknown };
    const allowed = new Set(['Point', 'LineString', 'Polygon', 'MultiLineString', 'MultiPolygon']);
    if (!parsed || typeof parsed.type !== 'string' || !allowed.has(parsed.type) || !Array.isArray(parsed.coordinates)) return false;
    const walk = (node: unknown, depth: number): boolean => depth === 0
      ? Array.isArray(node) && node.length >= 2 && node.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part))
      : Array.isArray(node) && node.length > 0 && node.every((child) => walk(child, depth - 1));
    const depth = parsed.type === 'Point' ? 0 : parsed.type === 'LineString' ? 1 : parsed.type === 'Polygon' || parsed.type === 'MultiLineString' ? 2 : 3;
    return walk(parsed.coordinates, depth);
  } catch { return false; }
}

function getWriteToken(env: Env): string | undefined {
  const value = Reflect.get(env, 'GOLF_WRITE_TOKEN');
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireWriteAccess(request: Request, env: Env): Response | null {
  const writeToken = getWriteToken(env);
  if (!writeToken) return error('Write authentication is not configured.', 503, 'AUTH_NOT_CONFIGURED');
  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${writeToken}`) return error('A valid service authorization token is required.', 401, 'UNAUTHORIZED');
  return null;
}

async function readJson(request: Request): Promise<JsonObject | Response> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Request body must be a JSON object.', 400, 'INVALID_JSON');
    return body as JsonObject;
  } catch {
    return error('Request body must contain valid JSON.', 400, 'INVALID_JSON');
  }
}

async function getCourse(env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT * FROM golf_courses WHERE id = ?1').bind(id).first();
  if (!course) return error('Course not found.', 404, 'NOT_FOUND');

  const holes = await env.DB.prepare('SELECT * FROM golf_holes WHERE course_id = ?1 ORDER BY hole_number').bind(id).all();
  const teeSets = await env.DB.prepare('SELECT * FROM golf_tee_sets WHERE course_id = ?1 ORDER BY yardage DESC').bind(id).all();
  return json({ course: { ...course, holes: holes.results, teeSets: teeSets.results } });
}

async function getLeague(env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return error('League id is invalid.', 400, 'INVALID_INPUT');
  const league = await env.DB.prepare('SELECT * FROM golf_leagues WHERE id = ?1').bind(id).first();
  if (!league) return error('League not found.', 404, 'NOT_FOUND');

  const standings = await env.DB.prepare(`
    SELECT golfer_id, display_name, rounds, courses_played, points, trust_level, trend
    FROM golf_league_standings
    WHERE league_id = ?1
    ORDER BY points DESC, display_name ASC
  `).bind(id).all();
  return json({ league, standings: standings.results });
}

async function getMapLayers(env: Env, courseId: string): Promise<Response> {
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1').bind(courseId).first();
  if (!course) return error('Course not found.', 404, 'NOT_FOUND');
  const layers = await env.DB.prepare(`SELECT id, layer_kind, label, geometry_json, source, source_identifier, geometry_version, approved_at
    FROM golf_course_map_layers WHERE course_id = ?1 AND approved_by_operator = 1 ORDER BY layer_kind, label`).bind(courseId).all();
  const holes = await env.DB.prepare(`SELECT course_id, hole_number, geometry_json, source, source_identifier, geometry_version, approved_at
    FROM golf_course_holes_geometry WHERE course_id = ?1 AND approved_by_operator = 1 ORDER BY hole_number`).bind(courseId).all();
  return json({ courseId, layers: layers.results, holes: holes.results, dataSource: 'operator-approved course data; geometry does not alter official scoring or yardage' }, 200, { 'cache-control': 'public, max-age=60' });
}

async function getImagery(env: Env, courseId: string): Promise<Response> {
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const imagery = await env.DB.prepare(`SELECT id, provider_name, imagery_url, tile_source, capture_timestamp, resolution, cloud_cover, license, coverage_bounds_json, processing_status, source_identifier
    FROM golf_course_imagery WHERE course_id = ?1 ORDER BY capture_timestamp DESC`).bind(courseId).all();
  return json({ courseId, imagery: imagery.results, label: imagery.results.length ? 'Imagery metadata; not live unless explicitly guaranteed by the source.' : 'Imagery unavailable — course diagram shown' }, 200, { 'cache-control': 'public, max-age=300' });
}

async function getStickLinks(env: Env, courseId: string): Promise<Response> {
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const locations = await env.DB.prepare(`SELECT id, label, location_type, geometry_json, source, approved_at
    FROM golf_sticklink_locations WHERE course_id = ?1 AND approved_by_operator = 1 ORDER BY label`).bind(courseId).all();
  return json({ courseId, locations: locations.results }, 200, { 'cache-control': 'public, max-age=60' });
}

async function createMapLayer(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env);
  if (authError) return authError;
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  if (!organizationId || organizationId.length > 120) return error('An organization id is required.', 400, 'INVALID_INPUT');
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const kind = body.layerKind;
  const allowedKinds = new Set(['boundary', 'hole', 'tee', 'green', 'hazard', 'cart_path', 'sticklink', 'league_event']);
  if (typeof kind !== 'string' || !allowedKinds.has(kind)) return error('layerKind is invalid.', 400, 'INVALID_INPUT');
  if (typeof body.label !== 'string' || body.label.length < 1 || body.label.length > 160) return error('label is invalid.', 400, 'INVALID_INPUT');
  const geometryJson = typeof body.geometryJson === 'string' ? body.geometryJson : JSON.stringify(body.geometryJson ?? null);
  if (!isValidGeometryJson(geometryJson)) return error('geometryJson must be valid, bounded GeoJSON-compatible geometry.', 400, 'INVALID_GEOMETRY');
  const source = typeof body.source === 'string' && body.source.length <= 200 ? body.source : '';
  const version = typeof body.geometryVersion === 'string' && /^[a-zA-Z0-9._-]{1,50}$/.test(body.geometryVersion) ? body.geometryVersion : '';
  if (!source || !version) return error('source and geometryVersion are required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1').bind(courseId).first();
  if (!course) return error('Course not found.', 404, 'NOT_FOUND');
  const id = `map-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO golf_course_map_layers (id, course_id, layer_kind, label, geometry_json, source, source_identifier, geometry_version, organization_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(id, courseId, kind, body.label, geometryJson, source, typeof body.sourceIdentifier === 'string' ? body.sourceIdentifier.slice(0, 200) : null, version, organizationId).run();
  return json({ layer: { id, courseId, layerKind: kind, approvedByOperator: false } }, 201);
}

async function discoverCourses(env: Env, query: string): Promise<Response> {
  if (query.length > 80) return error('Search query is too long.', 400, 'INVALID_INPUT');
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const courses = await env.DB.prepare(`SELECT id, name, region, address, tap_points FROM golf_courses
    WHERE name LIKE ?1 ESCAPE '\\' OR region LIKE ?1 ESCAPE '\\' ORDER BY name LIMIT 50`).bind(pattern).all();
  return json({ courses: courses.results }, 200, { 'cache-control': 'public, max-age=60' });
}

function validateRoundInput(input: JsonObject): { value: RoundInput } | { response: Response } {
  const courseId = input.courseId;
  const personId = input.stateOfStickPersonId;
  const scores = input.scores;
  if (typeof courseId !== 'string' || !isValidId(courseId)) return { response: error('courseId is invalid.', 400, 'INVALID_INPUT') };
  if (typeof personId !== 'string' || personId.length < 2 || personId.length > 120) return { response: error('stateOfStickPersonId is required.', 400, 'INVALID_INPUT') };
  if (!Array.isArray(scores) || scores.length === 0 || scores.length > 18) return { response: error('scores must contain between 1 and 18 holes.', 400, 'INVALID_INPUT') };

  const normalizedScores = scores.map((score) => {
    if (!score || typeof score !== 'object' || Array.isArray(score)) return null;
    const item = score as Record<string, unknown>;
    if (!Number.isInteger(item.hole) || Number(item.hole) < 1 || Number(item.hole) > 18 || !isValidScore(item.strokes)) return null;
    return {
      hole: Number(item.hole),
      strokes: item.strokes,
      tapVerified: item.tapVerified === true,
      witnessConfirmed: item.witnessConfirmed === true,
      proofNote: typeof item.proofNote === 'string' ? item.proofNote.slice(0, 500) : undefined,
    };
  });
  if (normalizedScores.some((score) => score === null)) return { response: error('Each score must contain a valid hole and strokes value.', 400, 'INVALID_INPUT') };
  if (new Set(normalizedScores.map((score) => score?.hole)).size !== normalizedScores.length) return { response: error('Each hole may appear only once.', 400, 'INVALID_INPUT') };
  const clientRoundId = input.clientRoundId;
  if (clientRoundId !== undefined && (typeof clientRoundId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,120}$/.test(clientRoundId))) return { response: error('clientRoundId is invalid.', 400, 'INVALID_INPUT') };

  return {
    value: {
      courseId,
      format: input.format === 'stableford' || input.format === 'match_play' || input.format === 'skins' ? input.format : 'stroke_play',
      teeSetId: typeof input.teeSetId === 'string' ? input.teeSetId : undefined,
      stateOfStickPersonId: personId,
      stateOfStickOrganizationId: typeof input.stateOfStickOrganizationId === 'string' ? input.stateOfStickOrganizationId : undefined,
      scores: normalizedScores as RoundInput['scores'],
      clientRoundId,
    },
  };
}

async function createRound(request: Request, env: Env): Promise<Response> {
  const authError = requireWriteAccess(request, env);
  if (authError) return authError;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const validation = validateRoundInput(body);
  if ('response' in validation) return validation.response;
  const input = validation.value;
  const requestOrganizationId = request.headers.get('x-state-of-stick-organization-id');
  if (input.stateOfStickOrganizationId && requestOrganizationId !== input.stateOfStickOrganizationId) return error('Organization scope does not match the authenticated request.', 403, 'ORGANIZATION_SCOPE_MISMATCH');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1').bind(input.courseId).first<{ id: string }>();
  if (!course) return error('Course not found.', 404, 'NOT_FOUND');

  if (input.clientRoundId) {
    const existing = await env.DB.prepare('SELECT id, status, course_id, format FROM golf_rounds WHERE client_round_id = ?1').bind(input.clientRoundId).first();
    if (existing) return json({ round: { ...existing, deduplicated: true } }, 200);
  }

  const roundId = `round-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const organizationId = input.stateOfStickOrganizationId ?? null;
  const batch = [
    env.DB.prepare(`INSERT INTO golf_rounds (id, course_id, format, status, state_of_stick_person_id, state_of_stick_organization_id, client_round_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'submitted', ?4, ?5, ?6, ?7, ?7)`)
      .bind(roundId, input.courseId, input.format, input.stateOfStickPersonId, organizationId, input.clientRoundId ?? null, now),
    ...input.scores.map((score) => env.DB.prepare(`INSERT INTO golf_hole_scores (round_id, hole_number, strokes, tap_verified, witness_confirmed, proof_note, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(roundId, score.hole, score.strokes, score.tapVerified ? 1 : 0, score.witnessConfirmed ? 1 : 0, score.proofNote ?? null, now)),
  ];
  await env.DB.batch(batch);
  return json({ round: { id: roundId, status: 'submitted', courseId: input.courseId, format: input.format, scores: input.scores, clientRoundId: input.clientRoundId ?? null } }, 201);
}

async function getRound(env: Env, id: string): Promise<Response> {
  if (!/^round-[a-zA-Z0-9-]{8,100}$/.test(id)) return error('Round id is invalid.', 400, 'INVALID_INPUT');
  const round = await env.DB.prepare('SELECT * FROM golf_rounds WHERE id = ?1').bind(id).first();
  if (!round) return error('Round not found.', 404, 'NOT_FOUND');
  const scores = await env.DB.prepare('SELECT * FROM golf_hole_scores WHERE round_id = ?1 ORDER BY hole_number').bind(id).all();
  return json({ round: { ...round, scores: scores.results } });
}

export class RoundSession extends DurableObject<Env> {
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS round_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
      this.initialized = true;
    });
  }

  async snapshot(): Promise<{ events: Array<{ sequence: number; eventType: string; payload: JsonObject; createdAt: string }> }> {
    await this.ensureInitialized();
    const events = this.ctx.storage.sql.exec<{ sequence: number; event_type: string; payload: string; created_at: string }>('SELECT * FROM round_events ORDER BY sequence').toArray();
    return { events: events.map((event) => ({ sequence: event.sequence, eventType: event.event_type, payload: JSON.parse(event.payload) as JsonObject, createdAt: event.created_at })) };
  }

  async recordEvent(eventType: string, payload: JsonObject): Promise<{ sequence: number }> {
    await this.ensureInitialized();
    const createdAt = new Date().toISOString();
    const result = this.ctx.storage.sql.exec<{ sequence: number }>('INSERT INTO round_events (event_type, payload, created_at) VALUES (?, ?, ?) RETURNING sequence', eventType, JSON.stringify(payload), createdAt);
    return { sequence: result.one().sequence };
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin'), env) });
    if (url.pathname === '/health' && request.method === 'GET') return withCors(json({ ok: true, service: 'sticklink-golf-api', environment: env.ENVIRONMENT }), request, env);
    if (!url.pathname.startsWith('/api/v1/')) return withCors(error('Not found.', 404, 'NOT_FOUND'), request, env);

    let response: Response;
    if (url.pathname === '/api/v1/courses' && request.method === 'GET') {
      response = await discoverCourses(env, url.searchParams.get('q') ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/map-layers$/) && request.method === 'POST') {
      response = await createMapLayer(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/map-layers$/) && request.method === 'GET') {
      response = await getMapLayers(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/imagery$/) && request.method === 'GET') {
      response = await getImagery(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/sticklinks$/) && request.method === 'GET') {
      response = await getStickLinks(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/courses' && request.method !== 'GET') {
      response = error('Course writes are not available on the public API.', 405, 'METHOD_NOT_ALLOWED');
    } else if (url.pathname.startsWith('/api/v1/courses/') && request.method === 'GET') {
      response = await getCourse(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.startsWith('/api/v1/leagues/') && request.method === 'GET') {
      response = await getLeague(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/rounds' && request.method === 'POST') {
      response = await createRound(request, env);
    } else if (url.pathname.startsWith('/api/v1/rounds/') && request.method === 'GET') {
      response = await getRound(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.startsWith('/api/v1/live/rounds/') && request.method === 'GET') {
      const roundId = url.pathname.split('/')[5] ?? '';
      const snapshot = await env.ROUND_SESSIONS.getByName(roundId).snapshot() as { events: unknown[] };
      response = json({ roundId, ...snapshot });
    } else {
      response = error('Not found.', 404, 'NOT_FOUND');
    }
    return withCors(response, request, env);
  },
} satisfies ExportedHandler<Env>;
