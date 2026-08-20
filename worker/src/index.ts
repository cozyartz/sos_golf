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
  const course = await env.DB.prepare('SELECT * FROM golf_courses WHERE id = ?1').bind(id).first();
  if (!course) return error('Course not found.', 404, 'NOT_FOUND');

  const holes = await env.DB.prepare('SELECT * FROM golf_holes WHERE course_id = ?1 ORDER BY hole_number').bind(id).all();
  const teeSets = await env.DB.prepare('SELECT * FROM golf_tee_sets WHERE course_id = ?1 ORDER BY yardage DESC').bind(id).all();
  return json({ course: { ...course, holes: holes.results, teeSets: teeSets.results } });
}

async function getLeague(env: Env, id: string): Promise<Response> {
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

  return {
    value: {
      courseId,
      format: input.format === 'stableford' || input.format === 'match_play' || input.format === 'skins' ? input.format : 'stroke_play',
      teeSetId: typeof input.teeSetId === 'string' ? input.teeSetId : undefined,
      stateOfStickPersonId: personId,
      stateOfStickOrganizationId: typeof input.stateOfStickOrganizationId === 'string' ? input.stateOfStickOrganizationId : undefined,
      scores: normalizedScores as RoundInput['scores'],
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
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1').bind(input.courseId).first<{ id: string }>();
  if (!course) return error('Course not found.', 404, 'NOT_FOUND');

  const roundId = `round-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const organizationId = input.stateOfStickOrganizationId ?? null;
  const batch = [
    env.DB.prepare(`INSERT INTO golf_rounds (id, course_id, format, status, state_of_stick_person_id, state_of_stick_organization_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'submitted', ?4, ?5, ?6, ?6)`)
      .bind(roundId, input.courseId, input.format, input.stateOfStickPersonId, organizationId, now),
    ...input.scores.map((score) => env.DB.prepare(`INSERT INTO golf_hole_scores (round_id, hole_number, strokes, tap_verified, witness_confirmed, proof_note, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(roundId, score.hole, score.strokes, score.tapVerified ? 1 : 0, score.witnessConfirmed ? 1 : 0, score.proofNote ?? null, now)),
  ];
  await env.DB.batch(batch);
  return json({ round: { id: roundId, status: 'submitted', courseId: input.courseId, format: input.format, scores: input.scores } }, 201);
}

async function getRound(env: Env, id: string): Promise<Response> {
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
      const courses = await env.DB.prepare('SELECT id, name, region, address, tap_points FROM golf_courses ORDER BY name').all();
      response = json({ courses: courses.results });
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
