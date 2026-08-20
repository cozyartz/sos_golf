import { DurableObject } from 'cloudflare:workers';
import { calculateLeaguePoints, canVerifyRound, pageWindow, trustLevelForEvents, type VerificationEvent } from '../../src/lib/network';

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

function isValidPersonId(value: string): boolean { return /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,119}$/.test(value); }

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

async function getLeague(request: Request, env: Env, id: string): Promise<Response> {
  if (!isValidId(id)) return error('League id is invalid.', 400, 'INVALID_INPUT');
  const league = await env.DB.prepare('SELECT * FROM golf_leagues WHERE id = ?1').bind(id).first<{ visibility?: string }>();
  if (!league) return error('League not found.', 404, 'NOT_FOUND');
  const personId = request.headers.get('x-state-of-stick-person-id');
  if (league.visibility === 'private') {
    if (!personId || !isValidPersonId(personId)) return error('Private league access requires a golfer identity.', 401, 'UNAUTHORIZED');
    const member = await env.DB.prepare("SELECT 1 FROM golf_league_enrollments WHERE league_id = ?1 AND person_id = ?2 AND status = 'active'").bind(id, personId).first();
    if (!member) return error('This league is private.', 403, 'FORBIDDEN');
  }
  const { page, pageSize, offset } = pageWindow(Number(new URL(request.url).searchParams.get('page')), Number(new URL(request.url).searchParams.get('pageSize')));
  const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM golf_league_standings WHERE league_id = ?1').bind(id).first<{ count: number }>();

  const standings = await env.DB.prepare(`
    SELECT golfer_id, display_name, rounds, courses_played, points, trust_level, trend
    FROM golf_league_standings
    WHERE league_id = ?1
    ORDER BY points DESC, display_name ASC
    LIMIT ?2 OFFSET ?3
  `).bind(id, pageSize, offset).all();
  return json({ league, standings: standings.results, pagination: { page, pageSize, total: total?.count ?? 0 } }, 200, { 'cache-control': league.visibility === 'public' ? 'public, max-age=30' : 'private, no-store' });
}

async function getPassport(request: Request, env: Env, personId: string): Promise<Response> {
  if (!isValidPersonId(personId)) return error('Player id is invalid.', 400, 'INVALID_INPUT');
  const profile = await env.DB.prepare('SELECT state_of_stick_person_id AS id, COUNT(*) AS rounds FROM golf_rounds WHERE state_of_stick_person_id = ?1').bind(personId).first();
  const rounds = await env.DB.prepare(`SELECT r.id, r.course_id, r.status, r.created_at, SUM(s.strokes) AS strokes, COUNT(CASE WHEN s.strokes > 0 THEN 1 END) AS holes_completed
    FROM golf_rounds r LEFT JOIN golf_hole_scores s ON s.round_id = r.id WHERE r.state_of_stick_person_id = ?1 GROUP BY r.id ORDER BY r.created_at DESC LIMIT 50`).bind(personId).all();
  const courses = await env.DB.prepare(`SELECT COUNT(DISTINCT course_id) AS count FROM golf_rounds WHERE state_of_stick_person_id = ?1 AND status IN ('submitted', 'verified')`).bind(personId).first();
  const verified = await env.DB.prepare("SELECT COUNT(*) AS count FROM golf_rounds WHERE state_of_stick_person_id = ?1 AND status = 'verified'").bind(personId).first();
  const holes = await env.DB.prepare('SELECT COUNT(*) AS count FROM golf_hole_scores s JOIN golf_rounds r ON r.id = s.round_id WHERE r.state_of_stick_person_id = ?1 AND s.strokes > 0').bind(personId).first();
  const memberships = await env.DB.prepare(`SELECT l.id, l.name, l.season FROM golf_league_enrollments e JOIN golf_leagues l ON l.id = e.league_id WHERE e.person_id = ?1 AND e.status = 'active' ORDER BY l.start_date DESC, l.name`).bind(personId).all();
  const personalBests = rounds.results.filter((round) => round.status === 'verified' && round.strokes !== null).sort((a, b) => Number(a.strokes) - Number(b.strokes)).slice(0, 5);
  return json({ profile: profile ?? { id: personId, rounds: 0 }, passport: { roundsPlayed: Number(profile?.rounds ?? 0), coursesPlayed: Number(courses?.count ?? 0), holesCompleted: Number(holes?.count ?? 0), verifiedRounds: Number(verified?.count ?? 0), personalBests, currentStreak: Math.min(personalBests.length, 3), leagueMemberships: memberships.results }, activity: rounds.results, shareUrl: `/passport/${personId}/` }, 200, { 'cache-control': request.headers.get('x-state-of-stick-person-id') === personId ? 'private, no-store' : 'public, max-age=30' });
}

async function discoverCourses(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  if (query.length > 80) return error('Search query is too long.', 400, 'INVALID_INPUT');
  const state = url.searchParams.get('state') ?? '';
  const difficulty = url.searchParams.get('difficulty') ?? '';
  const leagueActive = url.searchParams.get('leagueActive') === 'true';
  const hasStickLinks = url.searchParams.get('hasStickLinks') === 'true';
  const nearLat = Number(url.searchParams.get('nearLat'));
  const nearLon = Number(url.searchParams.get('nearLon'));
  const { page, pageSize, offset } = pageWindow(Number(url.searchParams.get('page')), Number(url.searchParams.get('pageSize')));
  const conditions = ['(c.name LIKE ?1 ESCAPE \'\\\' OR c.region LIKE ?1 ESCAPE \'\\\')'];
  const binds: unknown[] = [`%${query.replace(/[\\%_]/g, '\\$&')}%`];
  if (state) { conditions.push(`c.state_code = ?${binds.length + 1}`); binds.push(state.toUpperCase().slice(0, 2)); }
  if (difficulty && ['easy', 'moderate', 'challenging'].includes(difficulty)) { conditions.push(`c.difficulty = ?${binds.length + 1}`); binds.push(difficulty); }
  if (leagueActive) conditions.push("EXISTS (SELECT 1 FROM golf_league_courses lc JOIN golf_leagues l ON l.id = lc.league_id WHERE lc.course_id = c.id AND l.status = 'active')");
  if (hasStickLinks) conditions.push('c.tap_points > 0');
  const countBinds = [...binds];
  let orderSql = 'c.name';
  if (Number.isFinite(nearLat) && Number.isFinite(nearLon) && nearLat >= -90 && nearLat <= 90 && nearLon >= -180 && nearLon <= 180) {
    const latPlaceholder = binds.length + 1; const lonPlaceholder = binds.length + 3;
    conditions.push(`c.latitude BETWEEN ?${latPlaceholder} AND ?${latPlaceholder + 1} AND c.longitude BETWEEN ?${lonPlaceholder} AND ?${lonPlaceholder + 1}`);
    binds.push(nearLat - 2, nearLat + 2, nearLon - 2, nearLon + 2, nearLat, nearLat, nearLon, nearLon);
    orderSql = `((c.latitude - ?${binds.length - 3}) * (c.latitude - ?${binds.length - 3}) + (c.longitude - ?${binds.length - 1}) * (c.longitude - ?${binds.length - 1}))`;
  }
  const where = conditions.join(' AND ');
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM golf_courses c WHERE ${where}`).bind(...countBinds, ...(binds.length > countBinds.length ? binds.slice(countBinds.length, countBinds.length + 4) : [])).first<{ count: number }>();
  const courses = await env.DB.prepare(`SELECT c.id, c.name, c.region, c.address, c.tap_points, c.latitude, c.longitude, c.state_code, c.difficulty,
    EXISTS (SELECT 1 FROM golf_league_courses lc JOIN golf_leagues l ON l.id = lc.league_id WHERE lc.course_id = c.id AND l.status = 'active') AS has_active_league
    FROM golf_courses c WHERE ${where} ORDER BY ${orderSql} LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`).bind(...binds, pageSize, offset, ...(orderSql === 'c.name' ? [] : [])).all();
  return json({ courses: courses.results, pagination: { page, pageSize, total: count?.count ?? 0 }, locationSource: 'operator-seeded coordinates; no geocoder required' }, 200, { 'cache-control': 'public, max-age=60' });
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

async function enrollInLeague(request: Request, env: Env, leagueId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env);
  if (authError) return authError;
  if (!isValidId(leagueId)) return error('League id is invalid.', 400, 'INVALID_INPUT');
  const personId = request.headers.get('x-state-of-stick-person-id');
  if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 400, 'INVALID_INPUT');
  const league = await env.DB.prepare("SELECT id, status FROM golf_leagues WHERE id = ?1").bind(leagueId).first<{ id: string; status: string }>();
  if (!league) return error('League not found.', 404, 'NOT_FOUND');
  if (league.status !== 'active') return error('Only active leagues accept enrollment.', 409, 'LEAGUE_NOT_ACTIVE');
  await env.DB.prepare(`INSERT INTO golf_league_enrollments (league_id, person_id, status, enrolled_at) VALUES (?1, ?2, 'active', ?3)
    ON CONFLICT(league_id, person_id) DO UPDATE SET status = 'active'`).bind(leagueId, personId, new Date().toISOString()).run();
  return json({ enrollment: { leagueId, personId, status: 'active' } }, 201);
}

async function addVerificationEvent(request: Request, env: Env, roundId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env);
  if (authError) return authError;
  if (!/^round-[a-zA-Z0-9-]{8,100}$/.test(roundId)) return error('Round id is invalid.', 400, 'INVALID_INPUT');
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const eventType = body.eventType;
  const allowed = new Set(['tap_verification', 'witness_confirmation', 'operator_review', 'course_confirmation', 'round_rejected']);
  if (typeof eventType !== 'string' || !allowed.has(eventType)) return error('eventType is invalid.', 400, 'INVALID_INPUT');
  const round = await env.DB.prepare('SELECT id, status, state_of_stick_organization_id FROM golf_rounds WHERE id = ?1').bind(roundId).first<{ id: string; status: string; state_of_stick_organization_id: string | null }>();
  if (!round) return error('Round not found.', 404, 'NOT_FOUND');
  if (round.state_of_stick_organization_id && round.state_of_stick_organization_id !== organizationId) return error('Organization scope does not match the round.', 403, 'ORGANIZATION_SCOPE_MISMATCH');
  const clientEventId = typeof body.clientEventId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,120}$/.test(body.clientEventId) ? body.clientEventId : null;
  if (clientEventId) { const existing = await env.DB.prepare('SELECT id, event_type, created_at FROM golf_round_verification_events WHERE client_event_id = ?1').bind(clientEventId).first(); if (existing) return json({ event: existing, deduplicated: true }); }
  const eventId = `verify-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const hole = body.hole === undefined ? null : Number(body.hole);
  if (hole !== null && (!Number.isInteger(hole) || hole < 1 || hole > 18)) return error('hole is invalid.', 400, 'INVALID_INPUT');
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  await env.DB.prepare(`INSERT INTO golf_round_verification_events (id, round_id, event_type, actor_person_id, organization_id, hole_number, note, created_at, client_event_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(eventId, roundId, eventType, actorId, organizationId, hole, note, now, clientEventId).run();
  const events = await env.DB.prepare('SELECT event_type AS type, actor_person_id AS actorId, created_at AS createdAt FROM golf_round_verification_events WHERE round_id = ?1').bind(roundId).all();
  const typedEvents = events.results as unknown as VerificationEvent[];
  let status = round.status;
  if (eventType === 'round_rejected') status = 'rejected';
  else if (canVerifyRound('submitted', typedEvents)) status = 'verified';
  const trust = trustLevelForEvents(typedEvents);
  if (status !== round.status || trust !== 'self_reported') {
    await env.DB.batch([
      env.DB.prepare('UPDATE golf_rounds SET status = ?1, trust_level = ?2, updated_at = ?3 WHERE id = ?4').bind(status, trust, now, roundId),
      env.DB.prepare(`INSERT INTO golf_round_audit_events (id, round_id, from_status, to_status, actor_person_id, organization_id, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(`audit-${crypto.randomUUID()}`, roundId, round.status, status, actorId, organizationId, note, now),
    ]);
  }
  return json({ event: { id: eventId, roundId, eventType, createdAt: now }, round: { id: roundId, status, trustLevel: trust } }, 201);
}

async function getAnnouncements(env: Env, courseId: string): Promise<Response> {
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const announcements = await env.DB.prepare(`SELECT id, title, body, created_at, updated_at FROM golf_course_announcements WHERE course_id = ?1 AND published = 1 ORDER BY created_at DESC LIMIT 50`).bind(courseId).all();
  return json({ courseId, announcements: announcements.results }, 200, { 'cache-control': 'public, max-age=60' });
}

async function createAnnouncement(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env);
  if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const ownedCourse = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!ownedCourse) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (typeof body.title !== 'string' || body.title.length < 1 || body.title.length > 160 || typeof body.body !== 'string' || body.body.length < 1 || body.body.length > 2000) return error('Announcement title and body are required.', 400, 'INVALID_INPUT');
  const now = new Date().toISOString(); const id = `announcement-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_course_announcements (id, course_id, organization_id, title, body, published, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)`).bind(id, courseId, organizationId, body.title, body.body, now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'create', 'announcement', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, id, JSON.stringify({ published: false }), now),
  ]);
  return json({ announcement: { id, courseId, title: body.title, published: false } }, 201);
}

async function operatorCourseReview(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const ownedCourse = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!ownedCourse) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (body.entityType !== 'map_layer' || typeof body.entityId !== 'string' || !isValidId(body.entityId.replace(/^map-/, 'mapx'))) return error('Only map_layer review is available in this foundation.', 400, 'INVALID_INPUT');
  const layer = await env.DB.prepare('SELECT id FROM golf_course_map_layers WHERE id = ?1 AND course_id = ?2 AND organization_id = ?3').bind(body.entityId, courseId, organizationId).first();
  if (!layer) return error('Map layer not found in this organization.', 404, 'NOT_FOUND');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE golf_course_map_layers SET approved_by_operator = 1, approved_at = ?1 WHERE id = ?2').bind(now, body.entityId),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'approve', 'map_layer', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, body.entityId, JSON.stringify({ approvedAt: now }), now),
  ]);
  return json({ review: { entityType: 'map_layer', entityId: body.entityId, approved: true, approvedAt: now } });
}

async function getLiveLeague(request: Request, env: Env, leagueId: string): Promise<Response> {
  if (!isValidId(leagueId)) return error('League id is invalid.', 400, 'INVALID_INPUT');
  const league = await env.DB.prepare('SELECT visibility FROM golf_leagues WHERE id = ?1').bind(leagueId).first<{ visibility: string }>();
  if (!league) return error('League not found.', 404, 'NOT_FOUND');
  if (league.visibility === 'private') {
    const personId = request.headers.get('x-state-of-stick-person-id');
    if (!personId || !isValidPersonId(personId)) return error('Private league access requires a golfer identity.', 401, 'UNAUTHORIZED');
    const member = await env.DB.prepare("SELECT 1 FROM golf_league_enrollments WHERE league_id = ?1 AND person_id = ?2 AND status = 'active'").bind(leagueId, personId).first();
    if (!member) return error('This league is private.', 403, 'FORBIDDEN');
  }
  const standings = await env.DB.prepare(`SELECT golfer_id, display_name, rounds, courses_played, points, trust_level, trend FROM golf_league_standings WHERE league_id = ?1 ORDER BY points DESC, display_name LIMIT 100`).bind(leagueId).all();
  let events: unknown[] = [];
  try { events = ((await env.ROUND_SESSIONS.getByName(`league-${leagueId}`).snapshot()) as { events: unknown[] }).events; } catch { /* D1 remains authoritative when the live coordinator is cold or unavailable. */ }
  return json({ leagueId, standings: standings.results, events, source: 'd1-authoritative-with-durable-object-live-events' }, 200, { 'cache-control': league.visibility === 'public' ? 'public, max-age=5' : 'private, no-store' });
}

async function createLeague(request: Request, env: Env): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const formats = new Set(['stroke_play', 'stableford', 'match_play', 'skins']);
  if (typeof body.name !== 'string' || body.name.length < 2 || body.name.length > 160 || typeof body.season !== 'string' || body.season.length > 80 || typeof body.format !== 'string' || !formats.has(body.format)) return error('name, season, and supported format are required.', 400, 'INVALID_INPUT');
  const visibility = body.visibility === 'private' ? 'private' : 'public'; const cadence = body.cadence === 'weekly' ? 'weekly' : 'seasonal';
  const id = `league-${crypto.randomUUID()}`; const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_leagues (id, name, season, status, format, region, sponsor, visibility, cadence, organization_id, created_at) VALUES (?1, ?2, ?3, 'draft', ?4, ?5, NULL, ?6, ?7, ?8, ?9)`).bind(id, body.name, body.season, body.format, typeof body.region === 'string' ? body.region.slice(0, 120) : 'State of Stick Network', visibility, cadence, organizationId, now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, 'create', 'league', ?4, ?5, ?6)`).bind(`op-${crypto.randomUUID()}`, organizationId, actorId, id, JSON.stringify({ visibility, cadence, format: body.format }), now),
  ]);
  return json({ league: { id, name: body.name, season: body.season, status: 'draft', format: body.format, visibility, cadence } }, 201);
}

async function updateCourseProfile(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const fields: string[] = []; const values: unknown[] = [];
  if (typeof body.name === 'string' && body.name.length >= 2 && body.name.length <= 160) { fields.push(`name = ?${values.length + 1}`); values.push(body.name); }
  if (typeof body.address === 'string' && body.address.length <= 240) { fields.push(`address = ?${values.length + 1}`); values.push(body.address); }
  if (typeof body.stateCode === 'string' && /^[A-Z]{2}$/.test(body.stateCode)) { fields.push(`state_code = ?${values.length + 1}`); values.push(body.stateCode); }
  if (typeof body.latitude === 'number' && Number.isFinite(body.latitude) && body.latitude >= -90 && body.latitude <= 90) { fields.push(`latitude = ?${values.length + 1}`); values.push(body.latitude); }
  if (typeof body.longitude === 'number' && Number.isFinite(body.longitude) && body.longitude >= -180 && body.longitude <= 180) { fields.push(`longitude = ?${values.length + 1}`); values.push(body.longitude); }
  if (typeof body.difficulty === 'string' && ['easy', 'moderate', 'challenging'].includes(body.difficulty)) { fields.push(`difficulty = ?${values.length + 1}`); values.push(body.difficulty); }
  if (!fields.length) return error('No valid course profile fields supplied.', 400, 'INVALID_INPUT');
  const now = new Date().toISOString(); values.push(courseId);
  await env.DB.batch([
    env.DB.prepare(`UPDATE golf_courses SET ${fields.join(', ')} WHERE id = ?${values.length}`).bind(...values),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'update', 'course', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, courseId, JSON.stringify(body), now),
  ]);
  return json({ courseId, updated: true });
}

async function getRound(env: Env, id: string): Promise<Response> {
  if (!/^round-[a-zA-Z0-9-]{8,100}$/.test(id)) return error('Round id is invalid.', 400, 'INVALID_INPUT');
  const round = await env.DB.prepare('SELECT * FROM golf_rounds WHERE id = ?1').bind(id).first();
  if (!round) return error('Round not found.', 404, 'NOT_FOUND');
  const scores = await env.DB.prepare('SELECT * FROM golf_hole_scores WHERE round_id = ?1 ORDER BY hole_number').bind(id).all();
  const verificationEvents = await env.DB.prepare('SELECT * FROM golf_round_verification_events WHERE round_id = ?1 ORDER BY created_at').bind(id).all();
  const auditEvents = await env.DB.prepare('SELECT * FROM golf_round_audit_events WHERE round_id = ?1 ORDER BY created_at').bind(id).all();
  return json({ round: { ...round, scores: scores.results, verificationEvents: verificationEvents.results, auditEvents: auditEvents.results } });
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
      response = await discoverCourses(env, request);
    } else if (url.pathname.match(/^\/api\/v1\/players\/[^/]+\/passport$/) && request.method === 'GET') {
      response = await getPassport(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/courses/discover' && request.method === 'GET') {
      response = await discoverCourses(env, request);
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/map-layers$/) && request.method === 'POST') {
      response = await createMapLayer(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/map-layers$/) && request.method === 'GET') {
      response = await getMapLayers(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/imagery$/) && request.method === 'GET') {
      response = await getImagery(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/sticklinks$/) && request.method === 'GET') {
      response = await getStickLinks(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/announcements$/) && request.method === 'GET') {
      response = await getAnnouncements(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/announcements$/) && request.method === 'POST') {
      response = await createAnnouncement(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/operator-profile$/) && request.method === 'POST') {
      response = await updateCourseProfile(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/operator-review$/) && request.method === 'POST') {
      response = await operatorCourseReview(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/courses' && request.method !== 'GET') {
      response = error('Course writes are not available on the public API.', 405, 'METHOD_NOT_ALLOWED');
    } else if (url.pathname.startsWith('/api/v1/courses/') && request.method === 'GET') {
      response = await getCourse(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/leagues' && request.method === 'POST') {
      response = await createLeague(request, env);
    } else if (url.pathname.startsWith('/api/v1/leagues/') && request.method === 'GET') {
      if (url.pathname.endsWith('/live')) response = await getLiveLeague(request, env, url.pathname.split('/')[4] ?? '');
      else response = await getLeague(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/leagues\/[^/]+\/enroll$/) && request.method === 'POST') {
      response = await enrollInLeague(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/rounds' && request.method === 'POST') {
      response = await createRound(request, env);
    } else if (url.pathname.startsWith('/api/v1/rounds/') && request.method === 'GET') {
      response = await getRound(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/rounds\/[^/]+\/verification$/) && request.method === 'POST') {
      response = await addVerificationEvent(request, env, url.pathname.split('/')[4] ?? '');
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
