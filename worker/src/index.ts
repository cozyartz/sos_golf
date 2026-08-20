import { DurableObject } from 'cloudflare:workers';
import { calculateLeaguePoints, canVerifyRound, pageWindow, trustLevelForEvents, type VerificationEvent } from '../../src/lib/network';
import { classifyCourseQuestion, deterministicIntelligence, type IntelligenceFact } from '../../src/lib/intelligence';
import { buildGolfAgentPrompt, extractGolfAgentText } from '../../src/lib/agent';
import { calculateServiceTotal, canTransitionServiceRequest, type GolfServiceType, type ServiceRequestStatus } from '../../src/lib/services';
import { calculateHandicapStableford, calculateProvisionalCourseHandicap, resolveCompetition, type CompetitionFormat } from '../../src/lib/competition';
import { createOperatorCheckout, stripeObjectString, verifyStripeWebhook, type StripeEvent } from './stripe';
import { forwardPendingPlatformEvents, platformEventStatement } from './platform';
import { readStateOfStickAssertion } from './identity';
import type { PlatformIdentityClaims } from '../../src/lib/platform-contract';
import { golferPlans } from '../../src/lib/membership';
import { canTransitionTeeTimeStatus, isTeeTimePlayerCount, isTeeTimeSource, isTeeTimeStatus, type TeeTimeStatus } from '../../src/lib/tee-times';

type JsonObject = Record<string, unknown>;
const verifiedIdentityRequests = new WeakSet<Request>();
const verifiedIdentities = new WeakMap<Request, PlatformIdentityClaims>();

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
    'access-control-allow-headers': 'authorization, content-type, x-state-of-stick-identity-assertion, x-state-of-stick-organization-id, x-state-of-stick-person-id',
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

function getEnvString(env: Env, key: string): string | undefined {
  const value = Reflect.get(env, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function randomActivationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hashActivationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stripeEnv(env: Env): { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string } {
  return { STRIPE_SECRET_KEY: getEnvString(env, 'STRIPE_SECRET_KEY'), STRIPE_WEBHOOK_SECRET: getEnvString(env, 'STRIPE_WEBHOOK_SECRET') };
}

function requireWriteAccess(request: Request, env: Env): Response | null {
  if (verifiedIdentityRequests.has(request)) return null;
  if (env.ENVIRONMENT === 'production') return error('A verified State of Stick identity assertion is required.', 401, 'IDENTITY_REQUIRED');
  const writeToken = getWriteToken(env);
  if (!writeToken) return error('Write authentication is not configured.', 503, 'AUTH_NOT_CONFIGURED');
  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${writeToken}`) return error('A valid service authorization token is required.', 401, 'UNAUTHORIZED');
  return null;
}

function verifiedIdentityFor(request: Request): PlatformIdentityClaims | null {
  return verifiedIdentities.get(request) ?? null;
}

function hasRole(identity: PlatformIdentityClaims, ...roles: string[]): boolean {
  return roles.some((role) => identity.roles.includes(role));
}

function requireOperatorAccess(request: Request): Response | null {
  const identity = verifiedIdentityFor(request);
  if (!identity?.organizationId) return error('Organization membership is required.', 403, 'ORGANIZATION_REQUIRED');
  if (!hasRole(identity, 'operator', 'operator_admin', 'organization_admin', 'owner', 'staff')) return error('Operator permission is required.', 403, 'OPERATOR_PERMISSION_REQUIRED');
  return null;
}

async function checkIdentitySession(env: Env, identity: PlatformIdentityClaims): Promise<Response | null> {
  try {
    const session = await env.DB.prepare('SELECT person_id, expires_at, revoked_at FROM golf_platform_identity_sessions WHERE session_id = ?1').bind(identity.sessionId).first<{ person_id: string; expires_at: string; revoked_at: string | null }>();
    if (!session) return null;
    if (session.person_id !== identity.personId || Date.parse(session.expires_at) <= Date.now() || session.revoked_at) return error('The State of Stick session is no longer active.', 401, 'SESSION_REVOKED');
    return null;
  } catch (cause) {
    console.error('[golf identity session check]', cause);
    return error('Identity session verification is temporarily unavailable.', 503, 'IDENTITY_SESSION_UNAVAILABLE');
  }
}

async function readJson(request: Request): Promise<JsonObject | Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_000_000) return error('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Request body must be a JSON object.', 400, 'INVALID_JSON');
    return body as JsonObject;
  } catch {
    return error('Request body must contain valid JSON.', 400, 'INVALID_JSON');
  }
}

async function persistInsight(env: Env, insight: ReturnType<typeof deterministicIntelligence.roundSummary>, scope: { personId?: string; organizationId?: string; courseId?: string; leagueId?: string }): Promise<string> {
  const id = `insight-${crypto.randomUUID()}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_ai_insights (id, insight_kind, person_id, organization_id, course_id, league_id, interpretation, confidence, verification_status, rule_version, provider_id, generated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`).bind(id, insight.kind, scope.personId ?? null, scope.organizationId ?? null, scope.courseId ?? null, scope.leagueId ?? null, insight.interpretation, insight.confidence, insight.verificationStatus, insight.ruleVersion, insight.providerId, insight.generatedAt),
    ...insight.sourceFacts.map((source) => env.DB.prepare(`INSERT INTO golf_ai_source_references (id, insight_id, source_ref, label, value, source_verified) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(`source-${crypto.randomUUID()}`, id, source.sourceRef, source.label, source.value, source.verified ? 1 : 0)),
  ]);
  return id;
}

async function requirePlayerAccess(request: Request, env: Env, personId: string): Promise<Response | null> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const requester = request.headers.get('x-state-of-stick-person-id');
  if (!requester || requester !== personId || !isValidPersonId(requester)) return error('Player data is only available to the requesting golfer.', 403, 'FORBIDDEN');
  return null;
}

async function getPlayerIntelligence(request: Request, env: Env, personId: string): Promise<Response> {
  const accessError = await requirePlayerAccess(request, env, personId); if (accessError) return accessError;
  const roundsResult = await env.DB.prepare(`SELECT r.id, r.course_id, r.format, r.status, r.created_at, s.hole_number, s.strokes, s.tap_verified, s.witness_confirmed
    FROM golf_rounds r LEFT JOIN golf_hole_scores s ON s.round_id = r.id WHERE r.state_of_stick_person_id = ?1 ORDER BY r.created_at DESC LIMIT 500`).bind(personId).all();
  const grouped = new Map<string, any>();
  for (const row of roundsResult.results as Array<Record<string, unknown>>) { const id = String(row.id); const round = grouped.get(id) ?? { id, courseId: String(row.course_id), golferId: personId, format: String(row.format), status: String(row.status), competitionBoundary: [], scores: [] }; if (row.hole_number !== null) round.scores.push({ hole: Number(row.hole_number), strokes: Number(row.strokes), tapVerified: Boolean(row.tap_verified), witnessConfirmed: Boolean(row.witness_confirmed) }); grouped.set(id, round); }
  const rounds = [...grouped.values()];
  const facts: IntelligenceFact[] = [factFrom('player:rounds', 'Recorded rounds', String(rounds.length)), factFrom('player:verified', 'Verified rounds', String(rounds.filter((round) => round.status === 'verified').length)), ...rounds.slice(0, 5).map((round) => factFrom(`round:${round.id}`, `Round ${round.id}`, `${round.courseId} · ${round.status}`))];
  const insight = deterministicIntelligence.playerTrends(rounds, []);
  const insightId = await persistInsight(env, insight, { personId });
  return json({ playerId: personId, metrics: { rounds: rounds.length, verifiedRounds: rounds.filter((round) => round.status === 'verified').length, unverifiedRounds: rounds.filter((round) => round.status !== 'verified').length, consistency: rounds.length > 1 ? 'compare recorded totals across rounds' : 'not enough rounds' }, bestAndWeakestHoles: 'Derived from authorized recorded hole scores', insights: [insight], insightId }, 200, { 'cache-control': 'private, no-store' });
}

function factFrom(sourceRef: string, label: string, value: string, verified = true): IntelligenceFact { return { sourceRef, label, value, verified }; }

async function getLeagueIntelligence(request: Request, env: Env, leagueId: string): Promise<Response> {
  const league = await env.DB.prepare('SELECT id, visibility FROM golf_leagues WHERE id = ?1').bind(leagueId).first<{ id: string; visibility: string }>();
  if (!league) return error('League not found.', 404, 'NOT_FOUND');
  const personId = request.headers.get('x-state-of-stick-person-id') ?? undefined;
  if (league.visibility === 'private') { if (!personId || !isValidPersonId(personId)) return error('Private league access requires a golfer identity.', 401, 'UNAUTHORIZED'); const member = await env.DB.prepare("SELECT 1 FROM golf_league_enrollments WHERE league_id = ?1 AND person_id = ?2 AND status = 'active'").bind(leagueId, personId).first(); if (!member) return error('This league is private.', 403, 'FORBIDDEN'); }
  const standings = await env.DB.prepare(`SELECT golfer_id, display_name, rounds, courses_played, points, trust_level, trend FROM golf_league_standings WHERE league_id = ?1 ORDER BY points DESC, display_name`).bind(leagueId).all();
  const viewerId = personId ?? ''; const insight = deterministicIntelligence.leagueStandings(standings.results.map((row) => ({ golferId: String(row.golfer_id), name: String(row.display_name), rounds: Number(row.rounds), coursesPlayed: Number(row.courses_played), points: Number(row.points), trust: String(row.trust_level) as any, trend: String(row.trend) as any })), viewerId);
  const insightId = await persistInsight(env, insight, { personId, leagueId });
  return json({ leagueId, insight, insightId, verifiedRoundPercentage: 'Calculated from accepted league round records', tieHandling: 'Equal points share a competition rank; published standings remain authoritative' }, 200, { 'cache-control': league.visibility === 'public' ? 'public, max-age=30' : 'private, no-store' });
}

async function getOperatorIntelligence(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const volume = await env.DB.prepare('SELECT COUNT(*) AS count FROM golf_rounds WHERE course_id = ?1').bind(courseId).first<{ count: number }>(); const activePlayers = await env.DB.prepare("SELECT COUNT(DISTINCT state_of_stick_person_id) AS count FROM golf_rounds WHERE course_id = ?1 AND status IN ('in_progress', 'submitted')").bind(courseId).first<{ count: number }>(); const incomplete = await env.DB.prepare("SELECT COUNT(*) AS count FROM golf_rounds WHERE course_id = ?1 AND status IN ('draft', 'in_progress')").bind(courseId).first<{ count: number }>(); const taps = await env.DB.prepare('SELECT COUNT(*) AS count FROM golf_round_verification_events WHERE round_id IN (SELECT id FROM golf_rounds WHERE course_id = ?1) AND event_type = \'tap_verification\'').bind(courseId).first<{ count: number }>(); const geometry = await env.DB.prepare('SELECT COUNT(*) AS count FROM golf_course_map_layers WHERE course_id = ?1 AND approved_by_operator = 0').bind(courseId).first<{ count: number }>();
  const facts = [factFrom(`course:${courseId}:rounds`, 'Round volume', String(volume?.count ?? 0)), factFrom(`course:${courseId}:players`, 'Active players', String(activePlayers?.count ?? 0)), factFrom(`course:${courseId}:incomplete`, 'Incomplete rounds', String(incomplete?.count ?? 0)), factFrom(`course:${courseId}:taps`, 'StickLink tap events', String(taps?.count ?? 0)), factFrom(`course:${courseId}:geometry`, 'Unapproved geometry layers', String(geometry?.count ?? 0))];
  const insight = deterministicIntelligence.operatorSummary(facts); const insightId = await persistInsight(env, insight, { organizationId, courseId });
  return json({ courseId, metrics: { roundVolume: volume?.count ?? 0, activePlayers: activePlayers?.count ?? 0, incompleteRounds: incomplete?.count ?? 0, stickLinkTaps: taps?.count ?? 0, unapprovedGeometry: geometry?.count ?? 0 }, insight, insightId, sourceBoundary: 'Player-submitted observations remain separate from operator-confirmed facts.' }, 200, { 'cache-control': 'private, no-store' });
}

async function getOperatorMetrics(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [taps, uniqueGolfers, activeRounds, requests, serviceValue, questions, busiestTap] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM golf_tap_events WHERE course_id = ?1 AND created_at >= ?2').bind(courseId, since).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(DISTINCT person_id) AS count FROM golf_tap_events WHERE course_id = ?1 AND person_id IS NOT NULL AND created_at >= ?2').bind(courseId, since).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM golf_rounds WHERE course_id = ?1 AND status IN ('in_progress', 'submitted')").bind(courseId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed FROM golf_service_requests WHERE course_id = ?1 AND created_at >= ?2").bind(courseId, since).first<{ count: number; completed: number | null }>(),
    env.DB.prepare("SELECT COALESCE(SUM(total_cents), 0) AS cents FROM golf_service_requests WHERE course_id = ?1 AND status = 'completed' AND created_at >= ?2").bind(courseId, since).first<{ cents: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS count, SUM(CASE WHEN answered_from_approved_context = 0 THEN 1 ELSE 0 END) AS unanswered FROM golf_course_question_events WHERE course_id = ?1 AND created_at >= ?2').bind(courseId, since).first<{ count: number; unanswered: number | null }>(),
    env.DB.prepare(`SELECT s.label, s.location_type, COUNT(e.id) AS taps FROM golf_sticklink_locations s LEFT JOIN golf_tap_events e ON e.tap_point_id = s.id AND e.created_at >= ?2 WHERE s.course_id = ?1 GROUP BY s.id ORDER BY taps DESC, s.label LIMIT 1`).bind(courseId, since).first<{ label: string; location_type: string; taps: number }>(),
  ]);
  return json({ courseId, window: { since, until: new Date().toISOString() }, metrics: { tapEvents: Number(taps?.count ?? 0), uniqueGolfers: Number(uniqueGolfers?.count ?? 0), activeRounds: Number(activeRounds?.count ?? 0), serviceRequests: Number(requests?.count ?? 0), completedServiceRequests: Number(requests?.completed ?? 0), recordedCompletedServiceValueCents: Number(serviceValue?.cents ?? 0), golfAgentQuestions: Number(questions?.count ?? 0), unansweredGolfAgentQuestions: Number(questions?.unanswered ?? 0), busiestTap: busiestTap ? { label: busiestTap.label, locationType: busiestTap.location_type, taps: Number(busiestTap.taps) } : null }, sourceBoundary: 'Counts are derived from recorded D1 activity. Recorded service value is not settled revenue and does not imply payment or POS integration.' }, 200, { 'cache-control': 'private, no-store' });
}

async function createCourseClaim(request: Request, env: Env): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const requestedName = typeof body.requestedName === 'string' ? body.requestedName.trim() : '';
  const region = typeof body.region === 'string' ? body.region.trim() : '';
  const courseId = body.courseId === undefined || body.courseId === null || body.courseId === '' ? null : body.courseId;
  if (requestedName.length < 2 || requestedName.length > 160 || region.length < 2 || region.length > 120) return error('requestedName and region are required.', 400, 'INVALID_INPUT');
  if (courseId !== null && (typeof courseId !== 'string' || !isValidId(courseId))) return error('courseId is invalid.', 400, 'INVALID_INPUT');
  if (courseId) {
    const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1').bind(courseId).first();
    if (!course) return error('The selected course was not found in the network.', 404, 'NOT_FOUND');
  }
  const workflows = Array.isArray(body.requestedWorkflows) ? body.requestedWorkflows.filter((value): value is string => typeof value === 'string' && value.length <= 80).slice(0, 12) : [];
  const id = `claim-${crypto.randomUUID()}`; const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_course_claim_requests (id, course_id, requested_name, region, requested_by_person_id, organization_id, requested_workflows_json, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)`).bind(id, courseId, requestedName, region, actorId, organizationId, JSON.stringify(workflows), now),
    platformEventStatement(env.DB, { eventId: `platform-${id}`, eventName: 'golf.course_claim_requested', organizationId, courseId, aggregateType: 'course_claim', aggregateId: id, occurredAt: now, payload: { requestedName, region, workflowCount: workflows.length } }),
  ]);
  return json({ claim: { id, courseId, requestedName, region, requestedWorkflows: workflows, status: 'pending', publishing: 'requires_explicit_operator_review' } }, 201);
}

async function getCourseClaims(request: Request, env: Env): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  const claims = await env.DB.prepare(`SELECT id, course_id, requested_name, region, requested_by_person_id, requested_workflows_json, status, reviewed_by_person_id, reviewed_at, review_note, created_at, updated_at
    FROM golf_course_claim_requests WHERE organization_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(organizationId).all();
  return json({ claims: claims.results.map((claim) => ({ ...claim, requestedWorkflows: JSON.parse(String(claim.requested_workflows_json ?? '[]')) })) }, 200, { 'cache-control': 'private, no-store' });
}

async function reviewCourseClaim(request: Request, env: Env, claimId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(claimId)) return error('Claim id is invalid.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (body.status !== 'approved' && body.status !== 'rejected') return error('Review status must be approved or rejected.', 400, 'INVALID_INPUT');
  const claim = await env.DB.prepare('SELECT id, course_id, status FROM golf_course_claim_requests WHERE id = ?1 AND organization_id = ?2').bind(claimId, organizationId).first<{ id: string; course_id: string | null; status: string }>();
  if (!claim) return error('Course claim not found.', 404, 'NOT_FOUND');
  if (claim.status !== 'pending') return error('This course claim has already been reviewed.', 409, 'CLAIM_REVIEWED');
  const now = new Date().toISOString(); const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE golf_course_claim_requests SET status = ?1, reviewed_by_person_id = ?2, reviewed_at = ?3, review_note = ?4, updated_at = ?3 WHERE id = ?5 AND organization_id = ?6').bind(body.status, actorId, now, note, claimId, organizationId),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'review', 'course_claim', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, claim.course_id, actorId, claimId, JSON.stringify({ status: body.status, note }), now),
  ]);
  return json({ claim: { id: claimId, status: body.status, reviewedAt: now, publishing: 'separate_explicit_course_publication_step' } });
}

async function getOperatorPlans(env: Env): Promise<Response> {
  return json({ plans: [
    { key: 'network_course', name: 'Network Course', billing: 'free', priceDisplay: '$0', description: 'Public course presence, approved facts, league participation, and golfer discovery.' },
    { key: 'connected_course', name: 'Connected Course', billing: 'subscription', priceDisplay: '$249–$499/month proposed pilot range', implementationDisplay: '$500–$2,500 proposed setup range', checkoutConfigured: Boolean(getEnvString(env, 'GOLF_CONNECTED_COURSE_PRICE_ID')), description: 'Tap and QR touchpoints, service requests, Golf Agent, and operator analytics.' },
  ], pricingStatus: 'proposed_test_ranges', sourceBoundary: 'Stripe price and entitlement state are server-controlled. The browser never selects a price amount.' });
}

async function getOperatorTeeTimes(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id, name FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first<{ id: string; name: string }>();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error('date must use YYYY-MM-DD.', 400, 'INVALID_INPUT');
  if (status && !isTeeTimeStatus(status)) return error('status is invalid.', 400, 'INVALID_INPUT');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100), 1), 200);
  const conditions = ['r.course_id = ?1', 'r.organization_id = ?2'];
  const binds: unknown[] = [courseId, organizationId];
  if (date) { conditions.push(`r.starts_at >= ?${binds.length + 1}`, `r.starts_at < ?${binds.length + 2}`); binds.push(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`); }
  if (status) { conditions.push(`r.status = ?${binds.length + 1}`); binds.push(status); }
  const reservations = await env.DB.prepare(`SELECT r.id, r.source_system, r.external_reservation_id, r.starts_at, r.player_count, r.status, r.booking_url, r.imported_at, r.updated_at
    FROM golf_tee_time_reservations r WHERE ${conditions.join(' AND ')} ORDER BY r.starts_at ASC LIMIT ?${binds.length + 1}`).bind(...binds, limit).all();
  const ids = reservations.results.map((row) => String((row as Record<string, unknown>).id));
  const players = ids.length ? await env.DB.prepare(`SELECT p.reservation_id, p.player_index, p.state_of_stick_person_id, p.assigned_at, p.round_id
    FROM golf_tee_time_players p WHERE p.reservation_id IN (${ids.map((_, index) => `?${index + 1}`).join(',')}) ORDER BY p.reservation_id, p.player_index`).bind(...ids).all() : { results: [] };
  const playersByReservation = new Map<string, unknown[]>();
  for (const player of players.results) { const key = String((player as Record<string, unknown>).reservation_id); playersByReservation.set(key, [...(playersByReservation.get(key) ?? []), player]); }
  return json({ course, teeTimes: reservations.results.map((row) => ({ ...row, players: playersByReservation.get(String((row as Record<string, unknown>).id)) ?? [] })), sourceBoundary: 'Operator-only view. Availability, price, payment, and reservation validity remain owned by the external tee sheet.' }, 200, { 'cache-control': 'private, no-store' });
}

async function updateTeeTimeStatus(request: Request, env: Env, teeTimeId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!/^tee-[a-zA-Z0-9-]{8,100}$/.test(teeTimeId)) return error('Tee-time id is invalid.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (!isTeeTimeStatus(body.status)) return error('A valid tee-time status is required.', 400, 'INVALID_INPUT');
  const current = await env.DB.prepare('SELECT id, course_id, organization_id, status FROM golf_tee_time_reservations WHERE id = ?1 AND organization_id = ?2').bind(teeTimeId, organizationId).first<{ id: string; course_id: string; organization_id: string; status: TeeTimeStatus }>();
  if (!current) return error('Tee time not found in this organization.', 404, 'NOT_FOUND');
  if (!canTransitionTeeTimeStatus(current.status, body.status)) return error(`Tee-time status cannot move from ${current.status} to ${body.status}.`, 409, 'INVALID_STATUS_TRANSITION');
  const now = new Date().toISOString();
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE golf_tee_time_reservations SET status = ?1, updated_at = ?2 WHERE id = ?3 AND organization_id = ?4').bind(body.status, now, teeTimeId, organizationId),
    env.DB.prepare(`INSERT INTO golf_tee_time_events (id, reservation_id, organization_id, actor_person_id, event_type, details_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(`tee-event-${crypto.randomUUID()}`, teeTimeId, organizationId, actorId, body.status === 'activated' ? 'activated' : body.status, JSON.stringify({ from: current.status, to: body.status, note }), now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'status_change', 'tee_time', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, current.course_id, actorId, teeTimeId, JSON.stringify({ from: current.status, to: body.status, note }), now),
    platformEventStatement(env.DB, { eventId: `platform-${teeTimeId}-${now}`, eventName: 'golf.tee_time_status_changed', organizationId, courseId: current.course_id, aggregateType: 'tee_time', aggregateId: teeTimeId, occurredAt: now, payload: { from: current.status, to: body.status, hasNote: Boolean(note) } }),
  ]);
  return json({ teeTime: { id: teeTimeId, courseId: current.course_id, status: body.status, updatedAt: now } });
}

async function importTeeTimes(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (!isTeeTimeSource(body.sourceSystem) || !Array.isArray(body.reservations) || body.reservations.length < 1 || body.reservations.length > 100) return error('sourceSystem and 1 to 100 reservations are required.', 400, 'INVALID_INPUT');
  const sourceSystem = body.sourceSystem.trim();
  const importedAt = new Date().toISOString();
  const imported: Array<Record<string, unknown>> = [];
  for (const candidate of body.reservations) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return error('Each reservation must be an object.', 400, 'INVALID_INPUT');
    const reservation = candidate as Record<string, unknown>;
    const externalId = typeof reservation.externalReservationId === 'string' ? reservation.externalReservationId.trim() : '';
    const startsAt = typeof reservation.startsAt === 'string' ? reservation.startsAt.trim() : '';
    const playerCount = reservation.playerCount;
    const status = reservation.status ?? 'reserved';
    const bookingUrl = reservation.bookingUrl;
    if (!externalId || externalId.length > 160 || !startsAt || Number.isNaN(Date.parse(startsAt)) || !isTeeTimePlayerCount(playerCount) || !isTeeTimeStatus(status)) return error('Each reservation requires a valid externalReservationId, startsAt, playerCount, and status.', 400, 'INVALID_INPUT');
    if (bookingUrl !== undefined && (typeof bookingUrl !== 'string' || bookingUrl.length > 500 || !/^https:\/\//i.test(bookingUrl))) return error('bookingUrl must be an HTTPS URL.', 400, 'INVALID_INPUT');
    const existing = await env.DB.prepare('SELECT id, activation_token_hash FROM golf_tee_time_reservations WHERE course_id = ?1 AND source_system = ?2 AND external_reservation_id = ?3').bind(courseId, sourceSystem, externalId).first<{ id: string; activation_token_hash: string }>();
    const id = existing?.id ?? `tee-${crypto.randomUUID()}`;
    const token = existing ? undefined : randomActivationToken();
    const tokenHash = existing?.activation_token_hash ?? await hashActivationToken(token as string);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO golf_tee_time_reservations (id, course_id, organization_id, source_system, external_reservation_id, starts_at, player_count, status, booking_url, activation_token_hash, activation_expires_at, imported_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
        ON CONFLICT(course_id, source_system, external_reservation_id) DO UPDATE SET starts_at = excluded.starts_at, player_count = excluded.player_count, status = excluded.status, booking_url = excluded.booking_url, imported_at = excluded.imported_at, updated_at = excluded.updated_at`).bind(id, courseId, organizationId, sourceSystem, externalId, new Date(startsAt).toISOString(), playerCount, status, typeof bookingUrl === 'string' ? bookingUrl : null, tokenHash, new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(), importedAt),
      env.DB.prepare(`INSERT INTO golf_tee_time_events (id, reservation_id, organization_id, actor_person_id, event_type, details_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(`tee-event-${crypto.randomUUID()}`, id, organizationId, actorId, existing ? 'updated' : 'imported', JSON.stringify({ sourceSystem, externalReservationId: externalId, status }), importedAt),
    ]);
    imported.push({ id, externalReservationId: externalId, startsAt: new Date(startsAt).toISOString(), playerCount, status, activationUrl: token ? `${env.PUBLIC_ORIGIN}/tee-time/activate/?token=${encodeURIComponent(token)}` : undefined, activationUrlIssued: Boolean(token) });
  }
  return json({ teeTimes: imported, sourceBoundary: 'Imported reservation references only. The external tee sheet remains authoritative for availability, price, payment, and reservation validity.' }, 201);
}

async function getTeeTimeActivation(env: Env, token: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return error('Activation token is invalid.', 400, 'INVALID_INPUT');
  const tokenHash = await hashActivationToken(token);
  const reservation = await env.DB.prepare(`SELECT r.id, r.course_id, r.starts_at, r.player_count, r.status, r.booking_url, r.activation_expires_at, c.name AS course_name, c.region AS course_region
    FROM golf_tee_time_reservations r JOIN golf_courses c ON c.id = r.course_id
    WHERE r.activation_token_hash = ?1`).bind(tokenHash).first<{ id: string; course_id: string; starts_at: string; player_count: number; status: TeeTimeStatus; booking_url: string | null; activation_expires_at: string | null; course_name: string; course_region: string | null }>();
  if (!reservation) return error('Tee-time activation was not found.', 404, 'NOT_FOUND');
  if (reservation.activation_expires_at && Date.parse(reservation.activation_expires_at) < Date.now()) return error('Tee-time activation has expired.', 410, 'ACTIVATION_EXPIRED');
  if (reservation.status === 'cancelled' || reservation.status === 'no_show') return error('This tee time is no longer active.', 410, 'TEE_TIME_INACTIVE');
  return json({ activation: { reservationId: reservation.id, course: { id: reservation.course_id, name: reservation.course_name, region: reservation.course_region }, startsAt: reservation.starts_at, playerCount: reservation.player_count, status: reservation.status, bookingUrl: reservation.booking_url, nextStep: 'authenticated_golfer_claim_required' }, privacy: 'No golfer names, contact details, payment details, or external reservation identifiers are exposed.' }, 200, { 'cache-control': 'private, no-store' });
}

type TeeTimeReservation = {
  id: string;
  course_id: string;
  organization_id: string;
  starts_at: string;
  player_count: number;
  status: TeeTimeStatus;
  activation_expires_at: string | null;
};

async function findActiveTeeTime(env: Env, token: string): Promise<TeeTimeReservation | null> {
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return null;
  const tokenHash = await hashActivationToken(token);
  const reservation = await env.DB.prepare(`SELECT id, course_id, organization_id, starts_at, player_count, status, activation_expires_at
    FROM golf_tee_time_reservations WHERE activation_token_hash = ?1`).bind(tokenHash).first<TeeTimeReservation>();
  if (!reservation || (reservation.activation_expires_at && Date.parse(reservation.activation_expires_at) < Date.now()) || reservation.status === 'cancelled' || reservation.status === 'no_show') return null;
  return reservation;
}

async function claimTeeTimeSlot(request: Request, env: Env, token: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const personId = request.headers.get('x-state-of-stick-person-id');
  if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 401, 'UNAUTHORIZED');
  const reservation = await findActiveTeeTime(env, token);
  if (!reservation) return error('Tee-time activation was not found or is no longer active.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  const playerIndex = Number(body.playerIndex ?? 1);
  if (!Number.isInteger(playerIndex) || playerIndex < 1 || playerIndex > reservation.player_count) return error('playerIndex is outside the reservation player count.', 400, 'INVALID_INPUT');
  const existing = await env.DB.prepare('SELECT id, state_of_stick_person_id FROM golf_tee_time_players WHERE reservation_id = ?1 AND player_index = ?2').bind(reservation.id, playerIndex).first<{ id: string; state_of_stick_person_id: string | null }>();
  if (existing?.state_of_stick_person_id && existing.state_of_stick_person_id !== personId) return error('That player slot has already been claimed.', 409, 'PLAYER_SLOT_TAKEN');
  const otherSlot = await env.DB.prepare('SELECT player_index FROM golf_tee_time_players WHERE reservation_id = ?1 AND state_of_stick_person_id = ?2').bind(reservation.id, personId).first<{ player_index: number }>();
  if (otherSlot && Number(otherSlot.player_index) !== playerIndex) return error('This golfer already claimed a slot in this tee time.', 409, 'PLAYER_ALREADY_ASSIGNED');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_tee_time_players (id, reservation_id, player_index, state_of_stick_person_id, assigned_at) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(reservation_id, player_index) DO UPDATE SET state_of_stick_person_id = excluded.state_of_stick_person_id, assigned_at = excluded.assigned_at`).bind(existing?.id ?? `tee-player-${crypto.randomUUID()}`, reservation.id, playerIndex, personId, now),
    env.DB.prepare("UPDATE golf_tee_time_reservations SET status = CASE WHEN status = 'reserved' THEN 'activated' ELSE status END, updated_at = ?1 WHERE id = ?2").bind(now, reservation.id),
    env.DB.prepare(`INSERT INTO golf_tee_time_events (id, reservation_id, organization_id, actor_person_id, event_type, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'activated', ?5, ?6)`).bind(`tee-event-${crypto.randomUUID()}`, reservation.id, reservation.organization_id, personId, JSON.stringify({ playerIndex }), now),
  ]);
  return json({ reservation: { id: reservation.id, courseId: reservation.course_id, startsAt: reservation.starts_at, playerIndex, status: 'activated', nextStep: 'start_round' } }, 200, { 'cache-control': 'private, no-store' });
}

async function startTeeTimeRound(request: Request, env: Env, token: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const personId = request.headers.get('x-state-of-stick-person-id');
  if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 401, 'UNAUTHORIZED');
  const reservation = await findActiveTeeTime(env, token);
  if (!reservation) return error('Tee-time activation was not found or is no longer active.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  const playerIndex = Number(body.playerIndex ?? 1);
  if (!Number.isInteger(playerIndex) || playerIndex < 1 || playerIndex > reservation.player_count) return error('playerIndex is outside the reservation player count.', 400, 'INVALID_INPUT');
  const player = await env.DB.prepare('SELECT id, round_id FROM golf_tee_time_players WHERE reservation_id = ?1 AND player_index = ?2 AND state_of_stick_person_id = ?3').bind(reservation.id, playerIndex, personId).first<{ id: string; round_id: string | null }>();
  if (!player) return error('Claim this tee-time player slot before starting a round.', 409, 'PLAYER_SLOT_REQUIRED');
  if (player.round_id) return json({ round: { id: player.round_id, status: 'in_progress', deduplicated: true } }, 200, { 'cache-control': 'private, no-store' });
  const format = body.format === 'stableford' || body.format === 'match_play' || body.format === 'skins' ? body.format : 'stroke_play';
  const teeSetId = typeof body.teeSetId === 'string' ? body.teeSetId : null;
  if (teeSetId) { const teeSet = await env.DB.prepare('SELECT id FROM golf_tee_sets WHERE id = ?1 AND course_id = ?2').bind(teeSetId, reservation.course_id).first(); if (!teeSet) return error('Tee set is not available for this course.', 400, 'INVALID_INPUT'); }
  const clientRoundId = typeof body.clientRoundId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,120}$/.test(body.clientRoundId) ? body.clientRoundId : null;
  if (clientRoundId) { const existing = await env.DB.prepare('SELECT id, status FROM golf_rounds WHERE client_round_id = ?1').bind(clientRoundId).first(); if (existing) return json({ round: { ...existing, deduplicated: true } }, 200); }
  const roundId = `round-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_rounds (id, course_id, format, status, state_of_stick_person_id, state_of_stick_organization_id, client_round_id, tee_time_reservation_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'in_progress', ?4, ?5, ?6, ?7, ?8, ?8)`).bind(roundId, reservation.course_id, format, personId, reservation.organization_id, clientRoundId, reservation.id, now),
    env.DB.prepare('UPDATE golf_tee_time_players SET round_id = ?1 WHERE id = ?2').bind(roundId, player.id),
    env.DB.prepare("UPDATE golf_tee_time_reservations SET status = 'checked_in', updated_at = ?1 WHERE id = ?2").bind(now, reservation.id),
    env.DB.prepare(`INSERT INTO golf_tee_time_events (id, reservation_id, organization_id, actor_person_id, event_type, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'checked_in', ?5, ?6)`).bind(`tee-event-${crypto.randomUUID()}`, reservation.id, reservation.organization_id, personId, JSON.stringify({ playerIndex, roundId, format, teeSetId }), now),
  ]);
  return json({ round: { id: roundId, status: 'in_progress', courseId: reservation.course_id, teeTimeReservationId: reservation.id, format, teeSetId, createdAt: now } }, 201, { 'cache-control': 'private, no-store' });
}

async function getGolferMembershipPlans(): Promise<Response> {
  return json({
    plans: golferPlans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      priceDisplay: plan.priceDisplay,
      billingDisplay: plan.billingDisplay,
      aiQuestionsPerMonth: plan.aiQuestionsPerMonth,
      features: plan.features,
      proposed: plan.proposed,
    })),
    pricingStatus: 'proposed_test_ranges',
    billingBoundary: 'State of Stick owns live golfer subscriptions, Stripe customers, entitlements, usage, and cancellations. This endpoint is catalog metadata only.',
  }, 200, { 'cache-control': 'public, max-age=300' });
}

async function createOperatorBillingCheckout(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const priceId = getEnvString(env, 'GOLF_CONNECTED_COURSE_PRICE_ID');
  if (!priceId) return error('Connected Course billing is not configured yet.', 503, 'BILLING_NOT_CONFIGURED');
  const body = await readJson(request); if (body instanceof Response) return body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('A valid billing email is required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const existing = await env.DB.prepare("SELECT id, status FROM golf_billing_accounts WHERE course_id = ?1 AND plan_key = 'connected_course'").bind(courseId).first<{ id: string; status: string }>();
  if (existing?.status === 'active') return error('Connected Course is already active for this course.', 409, 'BILLING_ACTIVE');
  const billingId = existing?.id ?? `billing-${courseId}-connected-course`; const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO golf_billing_accounts (id, course_id, organization_id, plan_key, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'connected_course', 'pending', ?4, ?4)
    ON CONFLICT(course_id, plan_key) DO UPDATE SET organization_id = excluded.organization_id, status = 'pending', updated_at = excluded.updated_at`).bind(billingId, courseId, organizationId, now).run();
  try {
    const origin = env.PUBLIC_ORIGIN;
    const session = await createOperatorCheckout(stripeEnv(env), { priceId, courseId, organizationId, customerEmail: email || undefined, successUrl: `${origin}/operator/onboard/?billing=success&course=${encodeURIComponent(courseId)}`, cancelUrl: `${origin}/operator/onboard/?billing=cancelled&course=${encodeURIComponent(courseId)}`, idempotencyKey: `golf-connected-course-${billingId}` });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return json({ checkoutUrl: session.url, billing: { id: billingId, planKey: 'connected_course', status: 'pending', paymentSystem: 'stripe' } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to create Stripe checkout.';
    await env.DB.prepare("UPDATE golf_billing_accounts SET status = 'incomplete', updated_at = ?1 WHERE id = ?2").bind(new Date().toISOString(), billingId).run();
    console.error('[golf stripe checkout]', cause);
    return error(message, 502, 'BILLING_CHECKOUT_FAILED');
  }
}

async function applyGolfSubscriptionEvent(env: Env, event: StripeEvent): Promise<void> {
  const object = event.data.object;
  const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata as Record<string, unknown> : {};
  const purpose = typeof metadata.purpose === 'string' ? metadata.purpose : '';
  const courseId = typeof metadata.course_id === 'string' ? metadata.course_id : null;
  const organizationId = typeof metadata.organization_id === 'string' ? metadata.organization_id : null;
  const subscriptionId = event.type === 'checkout.session.completed' ? stripeObjectString(object, 'subscription') : stripeObjectString(object, 'id');
  if (purpose !== 'golf_connected_course' && !subscriptionId) return;
  if (event.type === 'checkout.session.completed') {
    if (!courseId || !organizationId || !subscriptionId) return;
    const customerId = stripeObjectString(object, 'customer'); const now = new Date().toISOString(); const billingId = `billing-${courseId}-connected-course`;
    await env.DB.prepare(`INSERT INTO golf_billing_accounts (id, course_id, organization_id, stripe_customer_id, stripe_subscription_id, plan_key, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 'connected_course', 'active', ?6, ?6)
      ON CONFLICT(course_id, plan_key) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, status = 'active', updated_at = excluded.updated_at`).bind(billingId, courseId, organizationId, customerId, subscriptionId, now).run();
    await env.DB.prepare(`INSERT INTO golf_entitlements (id, organization_id, course_id, entitlement_key, status, source_billing_account_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'connected_course', 'active', ?4, ?5, ?5)
      ON CONFLICT(course_id, entitlement_key) DO UPDATE SET organization_id = excluded.organization_id, status = 'active', source_billing_account_id = excluded.source_billing_account_id, updated_at = excluded.updated_at`).bind(`entitlement-${courseId}-connected-course`, organizationId, courseId, billingId, now).run();
    return;
  }
  if (!subscriptionId) return;
  const status = event.type === 'customer.subscription.deleted' ? 'cancelled' : (typeof object.status === 'string' && ['active', 'past_due', 'incomplete', 'cancelled'].includes(object.status) ? object.status : 'incomplete');
  const now = new Date().toISOString();
  const account = await env.DB.prepare('SELECT id, course_id, organization_id FROM golf_billing_accounts WHERE stripe_subscription_id = ?1').bind(subscriptionId).first<{ id: string; course_id: string; organization_id: string }>();
  if (!account) return;
  await env.DB.batch([
    env.DB.prepare('UPDATE golf_billing_accounts SET status = ?1, updated_at = ?2 WHERE stripe_subscription_id = ?3').bind(status, now, subscriptionId),
    env.DB.prepare("UPDATE golf_entitlements SET status = ?1, updated_at = ?2 WHERE course_id = ?3 AND entitlement_key = 'connected_course'").bind(status === 'active' ? 'active' : 'inactive', now, account.course_id),
  ]);
}

async function handleGolfStripeWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  let event: StripeEvent;
  try { event = await verifyStripeWebhook(stripeEnv(env), rawBody, request.headers.get('stripe-signature')); } catch (cause) { console.error('[golf stripe webhook verification]', cause); return error('Invalid Stripe webhook.', 400, 'INVALID_WEBHOOK'); }
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO golf_billing_events (event_id, event_type, subscription_id, payload_json, processing_status, received_at) VALUES (?1, ?2, ?3, ?4, 'received', ?5)`).bind(event.id, event.type, stripeObjectString(event.data.object, 'subscription') ?? stripeObjectString(event.data.object, 'id'), rawBody, new Date().toISOString()).run();
  if (!inserted.meta.changes) return json({ ok: true, duplicate: true });
  try {
    await applyGolfSubscriptionEvent(env, event);
    await env.DB.prepare("UPDATE golf_billing_events SET processing_status = 'processed', processed_at = ?1 WHERE event_id = ?2").bind(new Date().toISOString(), event.id).run();
    return json({ ok: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Stripe event processing failed.';
    await env.DB.prepare("UPDATE golf_billing_events SET processing_status = 'failed', last_error = ?1 WHERE event_id = ?2").bind(message.slice(0, 1000), event.id).run();
    console.error('[golf stripe webhook]', cause);
    return error('Stripe event processing failed.', 500, 'WEBHOOK_PROCESSING_FAILED');
  }
}

async function answerAssistant(request: Request, env: Env): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const personId = request.headers.get('x-state-of-stick-person-id'); if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body; if (typeof body.question !== 'string' || body.question.length < 1 || body.question.length > 500) return error('question must be 1 to 500 characters.', 400, 'INVALID_INPUT');
  const rounds = await env.DB.prepare(`SELECT r.id, r.course_id, r.status, COUNT(s.hole_number) AS holes, COALESCE(SUM(s.strokes), 0) AS strokes FROM golf_rounds r LEFT JOIN golf_hole_scores s ON s.round_id = r.id WHERE r.state_of_stick_person_id = ?1 GROUP BY r.id ORDER BY r.created_at DESC LIMIT 20`).bind(personId).all();
  const facts = rounds.results.map((row) => factFrom(`round:${row.id}`, `Round at ${row.course_id}`, `${row.holes} holes, ${row.strokes} strokes, ${row.status}`)); const insight = deterministicIntelligence.answerOwnRounds(body.question, facts); const insightId = await persistInsight(env, insight, { personId });
  return json({ answer: insight, insightId }, 200, { 'cache-control': 'private, no-store' });
}

async function recordInsightFeedback(request: Request, env: Env, insightId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError; const personId = request.headers.get('x-state-of-stick-person-id'); if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 400, 'INVALID_INPUT'); const body = await readJson(request); if (body instanceof Response) return body; const allowed = new Set(['useful', 'not_useful', 'incorrect', 'dismissed']); if (typeof body.feedback !== 'string' || !allowed.has(body.feedback)) return error('feedback is invalid.', 400, 'INVALID_INPUT'); const insight = await env.DB.prepare('SELECT id FROM golf_ai_insights WHERE id = ?1 AND person_id = ?2').bind(insightId, personId).first(); if (!insight) return error('Insight not found for this player.', 404, 'NOT_FOUND'); await env.DB.prepare(`INSERT INTO golf_ai_feedback (id, insight_id, person_id, feedback, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(`feedback-${crypto.randomUUID()}`, insightId, personId, body.feedback, typeof body.note === 'string' ? body.note.slice(0, 500) : null, new Date().toISOString()).run(); return json({ recorded: true });
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
  const locations = await env.DB.prepare(`SELECT id, label, location_type, geometry_json, source, status, approved_at
    FROM golf_sticklink_locations WHERE course_id = ?1 AND approved_by_operator = 1 AND status != 'retired' ORDER BY label`).bind(courseId).all();
  return json({ courseId, locations: locations.results }, 200, { 'cache-control': 'public, max-age=60' });
}

async function resolveTap(env: Env, hardwareId: string): Promise<Response> {
  if (!/^[a-zA-Z0-9._-]{2,120}$/.test(hardwareId)) return error('Tap hardware id is invalid.', 400, 'INVALID_INPUT');
  const tap = await env.DB.prepare(`SELECT s.id, s.course_id, s.label, s.location_type, s.geometry_json, c.name AS course_name, c.region, c.address
    FROM golf_sticklink_locations s JOIN golf_courses c ON c.id = s.course_id
    WHERE s.hardware_id = ?1 AND s.approved_by_operator = 1 AND s.status = 'active'`).bind(hardwareId).first<Record<string, unknown>>();
  if (!tap) return error('This tap point is not active or has not been approved.', 404, 'NOT_FOUND');
  const knowledge = await env.DB.prepare("SELECT id, content_type, title, body, source FROM golf_course_knowledge WHERE course_id = ?1 AND status = 'published' AND content_type IN ('faq', 'local_rule', 'service_info', 'event_info') ORDER BY updated_at DESC LIMIT 20").bind(tap.course_id).all();
  const services = await env.DB.prepare(`SELECT id, service_type, name, description, price_cents, currency, fulfillment_modes
    FROM golf_service_catalog WHERE course_id = ?1 AND active = 1 AND published = 1 ORDER BY service_type, name`).bind(tap.course_id).all();
  const announcements = await env.DB.prepare(`SELECT id, title, body, created_at FROM golf_course_announcements
    WHERE course_id = ?1 AND published = 1 ORDER BY created_at DESC LIMIT 5`).bind(tap.course_id).all();
  return json({ tap: { id: tap.id, label: tap.label, locationType: tap.location_type, geometryJson: tap.geometry_json }, course: { id: tap.course_id, name: tap.course_name, region: tap.region, address: tap.address }, knowledge: knowledge.results, services: services.results, announcements: announcements.results, actionBoundary: 'This tap resolves approved context. Identity, scoring writes, service requests, and consequential actions require the golfer or operator authorization boundary.' }, 200, { 'cache-control': 'public, max-age=30' });
}

async function getCourseKnowledge(env: Env, courseId: string, operator = false): Promise<Response> {
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const query = operator
    ? 'SELECT id, content_type, title, body, source, source_identifier, status, approved_by_person_id, approved_at, created_at, updated_at FROM golf_course_knowledge WHERE course_id = ?1 ORDER BY updated_at DESC'
    : "SELECT id, content_type, title, body, source, source_identifier, approved_at, updated_at FROM golf_course_knowledge WHERE course_id = ?1 AND status = 'published' ORDER BY content_type, title";
  const records = await env.DB.prepare(query).bind(courseId).all();
  return json({ courseId, knowledge: records.results, sourceBoundary: operator ? 'Operator-managed records; unpublished content is not used for public guidance.' : 'Published course records only; the Golf Agent must refuse unsupported questions.' }, 200, { 'cache-control': operator ? 'private, no-store' : 'public, max-age=60' });
}

async function getOperatorKnowledge(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  return getCourseKnowledge(env, courseId, true);
}

async function getOperatorTapPoints(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const points = await env.DB.prepare(`SELECT s.id, s.label, s.location_type, s.geometry_json, s.source, s.hardware_id, s.status, s.approved_by_operator, s.approved_at, s.installed_at, s.last_seen_at, COUNT(e.id) AS tap_count
    FROM golf_sticklink_locations s LEFT JOIN golf_tap_events e ON e.tap_point_id = s.id
    WHERE s.course_id = ?1 AND s.organization_id = ?2 GROUP BY s.id ORDER BY s.status, s.label`).bind(courseId, organizationId).all();
  return json({ courseId, tapPoints: points.results, sourceBoundary: 'Operator-only hardware and health view. Public responses never expose hardware ids.' }, 200, { 'cache-control': 'private, no-store' });
}

async function createCourseKnowledge(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  const types = new Set(['faq', 'local_rule', 'condition', 'service_info', 'event_info']);
  if (typeof body.contentType !== 'string' || !types.has(body.contentType) || typeof body.title !== 'string' || body.title.length < 2 || body.title.length > 160 || typeof body.body !== 'string' || body.body.length < 2 || body.body.length > 4000 || typeof body.source !== 'string' || body.source.length < 2 || body.source.length > 200) return error('contentType, title, body, and source are required.', 400, 'INVALID_INPUT');
  const status = body.status === 'published' ? 'published' : 'draft'; const id = `knowledge-${crypto.randomUUID()}`; const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_course_knowledge (id, course_id, organization_id, content_type, title, body, source, source_identifier, status, approved_by_person_id, approved_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`).bind(id, courseId, organizationId, body.contentType, body.title, body.body, body.source, typeof body.sourceIdentifier === 'string' ? body.sourceIdentifier.slice(0, 200) : null, status, status === 'published' ? actorId : null, status === 'published' ? now : null, now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'create', 'course_knowledge', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, id, JSON.stringify({ contentType: body.contentType, status }), now),
  ]);
  return json({ knowledge: { id, courseId, contentType: body.contentType, title: body.title, status, approvedAt: status === 'published' ? now : null } }, 201);
}

async function answerWithWorkersAi(env: Env, question: string, facts: IntelligenceFact[]) {
  const output = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { prompt: buildGolfAgentPrompt(question, facts) });
  const interpretation = extractGolfAgentText(output);
  if (!interpretation) throw new Error('Workers AI returned no answer.');
  return {
    kind: 'course_agent_answer',
    sourceFacts: facts,
    interpretation,
    confidence: facts.length ? 'high' as const : 'low' as const,
    verificationStatus: 'advisory' as const,
    generatedAt: new Date().toISOString(),
    ruleVersion: 'workers-ai-v1',
    providerId: 'cloudflare-workers-ai',
  };
}

async function answerCourseAssistant(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const personId = request.headers.get('x-state-of-stick-person-id'); if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (typeof body.question !== 'string' || body.question.length < 1 || body.question.length > 500) return error('question must be 1 to 500 characters.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT organization_id FROM golf_courses WHERE id = ?1').bind(courseId).first<{ organization_id: string }>(); if (!course) return error('Course not found.', 404, 'NOT_FOUND');
  const knowledge = await env.DB.prepare("SELECT id, title, body, source FROM golf_course_knowledge WHERE course_id = ?1 AND status = 'published' ORDER BY updated_at DESC LIMIT 100").bind(courseId).all();
  const facts = knowledge.results.map((row) => factFrom(`knowledge:${row.id}`, String(row.title), String(row.body), true));
  let insight: ReturnType<typeof deterministicIntelligence.answerCourseQuestion>;
  let provider = 'rules-engine';
  const safeBaseline = deterministicIntelligence.answerCourseQuestion(body.question, facts);
  if (safeBaseline.kind === 'course_assistant_refusal' || !facts.length) {
    insight = safeBaseline;
  } else {
    try {
      insight = await answerWithWorkersAi(env, body.question, facts);
      provider = 'cloudflare-workers-ai';
    } catch {
      insight = safeBaseline;
    }
  }
  const insightId = await persistInsight(env, insight, { personId, courseId });
  await env.DB.prepare(`INSERT INTO golf_course_question_events (id, course_id, organization_id, person_id, category, answered_from_approved_context, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(`question-${crypto.randomUUID()}`, courseId, course.organization_id, personId, classifyCourseQuestion(body.question), (insight.kind === 'course_assistant_answer' || insight.kind === 'course_agent_answer') && facts.length > 0 ? 1 : 0, new Date().toISOString()).run();
  return json({ courseId, answer: insight, insightId, provider, fallbackAvailable: provider !== 'cloudflare-workers-ai', sourceBoundary: 'Approved published course knowledge only.' }, 200, { 'cache-control': 'private, no-store' });
}

async function getCourseQuestionInsights(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const grouped = await env.DB.prepare(`SELECT category, COUNT(*) AS asked, SUM(CASE WHEN answered_from_approved_context = 0 THEN 1 ELSE 0 END) AS unanswered, MAX(created_at) AS last_asked FROM golf_course_question_events WHERE course_id = ?1 AND organization_id = ?2 GROUP BY category ORDER BY asked DESC`).bind(courseId, organizationId).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS count, SUM(CASE WHEN answered_from_approved_context = 0 THEN 1 ELSE 0 END) AS unanswered FROM golf_course_question_events WHERE course_id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first<{ count: number; unanswered: number | null }>();
  return json({ courseId, totals: { asked: Number(total?.count ?? 0), unanswered: Number(total?.unanswered ?? 0) }, categories: grouped.results, sourceBoundary: 'Aggregated categories only; raw golfer questions are not stored.' }, 200, { 'cache-control': 'private, no-store' });
}

async function registerTapPoint(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  const geometryJson = typeof body.geometryJson === 'string' ? body.geometryJson : JSON.stringify(body.geometryJson ?? null);
  if (typeof body.label !== 'string' || body.label.length < 2 || body.label.length > 160 || typeof body.locationType !== 'string' || !['tee', 'green', 'clubhouse', 'turn_house', 'sponsor'].includes(body.locationType) || !isValidGeometryJson(geometryJson)) return error('label, locationType, and valid geometryJson are required.', 400, 'INVALID_INPUT');
  const id = `tap-${crypto.randomUUID()}`; const now = new Date().toISOString(); const hardwareId = typeof body.hardwareId === 'string' && /^[a-zA-Z0-9._-]{2,120}$/.test(body.hardwareId) ? body.hardwareId : null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_sticklink_locations (id, course_id, label, location_type, geometry_json, source, organization_id, approved_by_operator, approved_at, hardware_id, status, installed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, NULL, ?8, 'planned', NULL)`).bind(id, courseId, body.label, body.locationType, geometryJson, typeof body.source === 'string' ? body.source.slice(0, 200) : 'operator-entered', organizationId, hardwareId),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'create', 'tap_point', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, id, JSON.stringify({ hardwareId, status: 'planned' }), now),
  ]);
  return json({ tapPoint: { id, courseId, label: body.label, status: 'planned', approvedByOperator: false } }, 201);
}

async function recordTapEvent(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const body = await readJson(request); if (body instanceof Response) return body;
  if (typeof body.tapPointId !== 'string' || !isValidId(body.tapPointId.replace(/^tap-/, 'tpx'))) return error('tapPointId is required.', 400, 'INVALID_INPUT');
  const tap = await env.DB.prepare("SELECT id, location_type FROM golf_sticklink_locations WHERE id = ?1 AND course_id = ?2 AND approved_by_operator = 1 AND status = 'active'").bind(body.tapPointId, courseId).first<{ id: string; location_type: string }>(); if (!tap) return error('Active approved tap point not found.', 404, 'NOT_FOUND');
  const id = `tap-event-${crypto.randomUUID()}`; const now = new Date().toISOString(); const context = ['tee', 'green'].includes(tap.location_type) ? 'hole' : tap.location_type;
  const personId = typeof body.personId === 'string' && isValidPersonId(body.personId) ? body.personId : null;
  const roundId = typeof body.roundId === 'string' ? body.roundId : null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_tap_events (id, tap_point_id, course_id, person_id, round_id, context, client_event_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, tap.id, courseId, personId, roundId, context, typeof body.clientEventId === 'string' ? body.clientEventId.slice(0, 120) : null, now),
    platformEventStatement(env.DB, { eventId: `platform-${id}`, eventName: 'golf.tap_interaction', courseId, aggregateType: 'tap_event', aggregateId: id, occurredAt: now, payload: { tapPointId: tap.id, context, hasPerson: Boolean(personId), hasRound: Boolean(roundId) } }),
  ]);
  return json({ tapEvent: { id, tapPointId: tap.id, courseId, context, createdAt: now } }, 201);
}

async function updateTapPointStatus(request: Request, env: Env, courseId: string, tapPointId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId) || !isValidId(tapPointId.replace(/^tap-/, 'tpx'))) return error('Course or tap point id is invalid.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const allowed = new Set(['planned', 'active', 'needs_attention', 'retired']); if (typeof body.status !== 'string' || !allowed.has(body.status)) return error('A valid tap point status is required.', 400, 'INVALID_INPUT');
  const current = await env.DB.prepare('SELECT id, status FROM golf_sticklink_locations WHERE id = ?1 AND course_id = ?2 AND organization_id = ?3').bind(tapPointId, courseId, organizationId).first<{ id: string; status: string }>();
  if (!current) return error('Tap point not found in this organization.', 404, 'NOT_FOUND');
  const now = new Date().toISOString(); const approved = body.status === 'active' ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare('UPDATE golf_sticklink_locations SET status = ?1, approved_by_operator = ?2, approved_at = CASE WHEN ?2 = 1 THEN ?3 ELSE approved_at END, installed_at = CASE WHEN ?1 = \'active\' AND installed_at IS NULL THEN ?3 ELSE installed_at END WHERE id = ?4 AND course_id = ?5 AND organization_id = ?6').bind(body.status, approved, now, tapPointId, courseId, organizationId),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'status_change', 'tap_point', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, tapPointId, JSON.stringify({ from: current.status, to: body.status }), now),
  ]);
  return json({ tapPoint: { id: tapPointId, courseId, status: body.status, approvedByOperator: Boolean(approved), updatedAt: now } });
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
  if (organizationId) batch.push(platformEventStatement(env.DB, { eventId: `platform-${roundId}`, eventName: 'golf.round_submitted', organizationId, courseId: input.courseId, aggregateType: 'round', aggregateId: roundId, occurredAt: now, payload: { format: input.format, scoreCount: input.scores.length, personId: input.stateOfStickPersonId } }));
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

async function getServices(env: Env, courseId: string): Promise<Response> {
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const services = await env.DB.prepare(`SELECT id, course_id, service_type, name, description, price_cents, currency, fulfillment_modes, updated_at
    FROM golf_service_catalog WHERE course_id = ?1 AND published = 1 AND active = 1 ORDER BY service_type, name`).bind(courseId).all();
  return json({ courseId, services: services.results }, 200, { 'cache-control': 'public, max-age=60' });
}

async function createService(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const ownedCourse = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  if (!ownedCourse) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const body = await readJson(request); if (body instanceof Response) return body;
  const types = new Set<GolfServiceType>(['food_beverage', 'player_service', 'course_information', 'event_program', 'sponsor_activation']);
  if (typeof body.name !== 'string' || body.name.length < 2 || body.name.length > 160 || typeof body.description !== 'string' || body.description.length < 1 || body.description.length > 1000 || typeof body.serviceType !== 'string' || !types.has(body.serviceType as GolfServiceType)) return error('name, description, and a supported serviceType are required.', 400, 'INVALID_INPUT');
  const priceCents = body.priceCents === null || body.priceCents === undefined ? null : Number(body.priceCents);
  if (priceCents !== null && (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 10_000_000)) return error('priceCents must be a non-negative integer.', 400, 'INVALID_INPUT');
  const fulfillmentModes = Array.isArray(body.fulfillmentModes) ? body.fulfillmentModes.filter((mode): mode is string => typeof mode === 'string' && ['clubhouse', 'cart_delivery', 'pickup', 'digital'].includes(mode)).slice(0, 4) : ['clubhouse'];
  if (!fulfillmentModes.length) return error('At least one fulfillment mode is required.', 400, 'INVALID_INPUT');
  const id = `service-${crypto.randomUUID()}`; const now = new Date().toISOString(); const published = body.published === true ? 1 : 0; const active = body.active !== false ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_service_catalog (id, course_id, organization_id, service_type, name, description, price_cents, currency, fulfillment_modes, active, published, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'USD', ?8, ?9, ?10, ?11, ?11)`).bind(id, courseId, organizationId, body.serviceType, body.name, body.description, priceCents, JSON.stringify(fulfillmentModes), active, published, now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'create', 'service', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, id, JSON.stringify({ published: Boolean(published), active: Boolean(active) }), now),
  ]);
  return json({ service: { id, courseId, serviceType: body.serviceType, name: body.name, published: Boolean(published), active: Boolean(active) } }, 201);
}

async function createServiceRequest(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const personId = request.headers.get('x-state-of-stick-person-id'); if (!personId || !isValidPersonId(personId)) return error('A golfer identity is required.', 400, 'INVALID_INPUT');
  if (!isValidId(courseId)) return error('Course id is invalid.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  if (typeof body.serviceId !== 'string' || !isValidId(body.serviceId.replace(/^service-/, 'servx'))) return error('serviceId is required.', 400, 'INVALID_INPUT');
  const quantity = Number(body.quantity ?? 1); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return error('quantity must be an integer from 1 to 20.', 400, 'INVALID_INPUT');
  const fulfillment = typeof body.fulfillment === 'string' && ['clubhouse', 'cart_delivery', 'pickup', 'digital'].includes(body.fulfillment) ? body.fulfillment : 'clubhouse';
  const service = await env.DB.prepare(`SELECT id, course_id, organization_id, price_cents, fulfillment_modes FROM golf_service_catalog WHERE id = ?1 AND course_id = ?2 AND published = 1 AND active = 1`).bind(body.serviceId, courseId).first<{ id: string; course_id: string; organization_id: string; price_cents: number | null; fulfillment_modes: string }>();
  if (!service) return error('Published service not found for this course.', 404, 'NOT_FOUND');
  let allowedModes: unknown = []; try { allowedModes = JSON.parse(service.fulfillment_modes); } catch { /* malformed operator data remains unavailable */ }
  if (!Array.isArray(allowedModes) || !allowedModes.includes(fulfillment)) return error('That fulfillment mode is not available for this service.', 400, 'INVALID_INPUT');
  const roundId = typeof body.roundId === 'string' && /^round-[a-zA-Z0-9-]{8,100}$/.test(body.roundId) ? body.roundId : null;
  let teeTimeReservationId: string | null = null;
  if (roundId) { const round = await env.DB.prepare('SELECT id, tee_time_reservation_id FROM golf_rounds WHERE id = ?1 AND course_id = ?2 AND state_of_stick_person_id = ?3').bind(roundId, courseId, personId).first<{ id: string; tee_time_reservation_id: string | null }>(); if (!round) return error('Round is not available for this golfer and course.', 403, 'FORBIDDEN'); teeTimeReservationId = round.tee_time_reservation_id; }
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null; const id = `service-request-${crypto.randomUUID()}`; const now = new Date().toISOString(); const totalCents = calculateServiceTotal(service.price_cents, quantity);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_service_requests (id, course_id, organization_id, service_id, person_id, round_id, tee_time_reservation_id, status, quantity, note, fulfillment, total_cents, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'requested', ?8, ?9, ?10, ?11, ?12, ?12)`).bind(id, courseId, service.organization_id, service.id, personId, roundId, teeTimeReservationId, quantity, note, fulfillment, totalCents, now),
    env.DB.prepare(`INSERT INTO golf_service_request_events (id, request_id, organization_id, actor_person_id, from_status, to_status, note, created_at) VALUES (?1, ?2, ?3, ?4, NULL, 'requested', ?5, ?6)`).bind(`service-event-${crypto.randomUUID()}`, id, service.organization_id, personId, note, now),
    platformEventStatement(env.DB, { eventId: `platform-${id}`, eventName: 'golf.service_requested', organizationId: service.organization_id, courseId, aggregateType: 'service_request', aggregateId: id, occurredAt: now, payload: { serviceId: service.id, serviceType: 'operator_service', quantity, fulfillment, totalCents, hasNote: Boolean(note) } }),
  ]);
  return json({ request: { id, courseId, serviceId: service.id, roundId, teeTimeReservationId, status: 'requested', quantity, fulfillment, totalCents, createdAt: now } }, 201);
}

async function getServiceRequests(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); if (!organizationId) return error('Organization identity is required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first(); if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const status = new URL(request.url).searchParams.get('status'); const allowed = new Set<ServiceRequestStatus>(['requested', 'accepted', 'in_progress', 'ready', 'completed', 'cancelled', 'rejected']);
  if (status && !allowed.has(status as ServiceRequestStatus)) return error('status is invalid.', 400, 'INVALID_INPUT');
  const query = status ? `SELECT r.*, s.name AS service_name, s.service_type FROM golf_service_requests r JOIN golf_service_catalog s ON s.id = r.service_id WHERE r.course_id = ?1 AND r.organization_id = ?2 AND r.status = ?3 ORDER BY r.created_at DESC LIMIT 100` : `SELECT r.*, s.name AS service_name, s.service_type FROM golf_service_requests r JOIN golf_service_catalog s ON s.id = r.service_id WHERE r.course_id = ?1 AND r.organization_id = ?2 ORDER BY r.created_at DESC LIMIT 100`;
  const requests = status ? await env.DB.prepare(query).bind(courseId, organizationId, status).all() : await env.DB.prepare(query).bind(courseId, organizationId).all();
  return json({ courseId, requests: requests.results }, 200, { 'cache-control': 'private, no-store' });
}

async function updateServiceRequest(request: Request, env: Env, requestId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id'); if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body; const nextStatus = body.status;
  const allowed = new Set<ServiceRequestStatus>(['requested', 'accepted', 'in_progress', 'ready', 'completed', 'cancelled', 'rejected']); if (typeof nextStatus !== 'string' || !allowed.has(nextStatus as ServiceRequestStatus)) return error('A valid status is required.', 400, 'INVALID_INPUT');
  const current = await env.DB.prepare('SELECT id, course_id, status FROM golf_service_requests WHERE id = ?1 AND organization_id = ?2').bind(requestId, organizationId).first<{ id: string; course_id: string; status: ServiceRequestStatus }>(); if (!current) return error('Service request not found.', 404, 'NOT_FOUND');
  if (!canTransitionServiceRequest(current.status, nextStatus as ServiceRequestStatus)) return error(`Cannot move service request from ${current.status} to ${nextStatus}.`, 409, 'INVALID_STATUS_TRANSITION');
  const now = new Date().toISOString(); const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE golf_service_requests SET status = ?1, updated_at = ?2 WHERE id = ?3 AND organization_id = ?4').bind(nextStatus, now, requestId, organizationId),
    env.DB.prepare(`INSERT INTO golf_service_request_events (id, request_id, organization_id, actor_person_id, from_status, to_status, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(`service-event-${crypto.randomUUID()}`, requestId, organizationId, actorId, current.status, nextStatus, note, now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, 'status_change', 'service_request', ?5, ?6, ?7)`).bind(`op-${crypto.randomUUID()}`, organizationId, current.course_id, actorId, requestId, JSON.stringify({ from: current.status, to: nextStatus }), now),
    platformEventStatement(env.DB, { eventId: `platform-${requestId}-${now}`, eventName: 'golf.service_status_changed', organizationId, courseId: current.course_id, aggregateType: 'service_request', aggregateId: requestId, occurredAt: now, payload: { from: current.status, to: nextStatus, hasNote: Boolean(note) } }),
  ]);
  return json({ request: { id: requestId, status: nextStatus, updatedAt: now } });
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

async function createLeagueMatch(request: Request, env: Env, leagueId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId)) return error('Organization and actor identity are required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const playerA = body.playerAId; const playerB = body.playerBId;
  if (typeof playerA !== 'string' || !isValidPersonId(playerA) || typeof playerB !== 'string' || !isValidPersonId(playerB) || playerA === playerB) return error('Two different valid player ids are required.', 400, 'INVALID_INPUT');
  const league = await env.DB.prepare('SELECT id, format, status FROM golf_leagues WHERE id = ?1 AND organization_id = ?2').bind(leagueId, organizationId).first<{ id: string; format: CompetitionFormat; status: string }>();
  if (!league) return error('League not found in this organization.', 404, 'NOT_FOUND');
  if (league.status !== 'active') return error('Matches can only be created in an active league.', 409, 'LEAGUE_NOT_ACTIVE');
  if (league.format !== 'stroke_play' && league.format !== 'stableford') return error('Portable matches currently support stroke play or Stableford leagues only.', 409, 'FORMAT_NOT_SUPPORTED');
  const enrollments = await env.DB.prepare("SELECT person_id FROM golf_league_enrollments WHERE league_id = ?1 AND person_id IN (?2, ?3) AND status = 'active'").bind(leagueId, playerA, playerB).all();
  if (enrollments.results.length !== 2) return error('Both players must be active league members.', 409, 'PLAYER_NOT_ENROLLED');
  const id = `match-${crypto.randomUUID()}`; const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO golf_league_matches (id, league_id, player_a_id, player_b_id, format, status, scheduled_for, created_by_person_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'scheduled', ?6, ?7, ?8, ?8)`).bind(id, leagueId, playerA, playerB, league.format, typeof body.scheduledFor === 'string' ? body.scheduledFor.slice(0, 80) : null, actorId, now),
    env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, 'create', 'league_match', ?4, ?5, ?6)`).bind(`op-${crypto.randomUUID()}`, organizationId, actorId, id, JSON.stringify({ playerA, playerB, format: league.format }), now),
  ]);
  return json({ match: { id, leagueId, playerAId: playerA, playerBId: playerB, format: league.format, status: 'scheduled' } }, 201);
}

async function getLeagueMatches(request: Request, env: Env, leagueId: string): Promise<Response> {
  if (!isValidId(leagueId)) return error('League id is invalid.', 400, 'INVALID_INPUT');
  const league = await env.DB.prepare('SELECT id, visibility FROM golf_leagues WHERE id = ?1').bind(leagueId).first<{ id: string; visibility: string }>(); if (!league) return error('League not found.', 404, 'NOT_FOUND');
  if (league.visibility === 'private') {
    const personId = request.headers.get('x-state-of-stick-person-id'); if (!personId || !isValidPersonId(personId)) return error('Private league access requires a golfer identity.', 401, 'UNAUTHORIZED');
    const member = await env.DB.prepare("SELECT 1 FROM golf_league_enrollments WHERE league_id = ?1 AND person_id = ?2 AND status = 'active'").bind(leagueId, personId).first(); if (!member) return error('This league is private.', 403, 'FORBIDDEN');
  }
  const matches = await env.DB.prepare(`SELECT m.id, m.league_id, m.player_a_id, m.player_b_id, m.format, m.status, m.scheduled_for, m.result_json, m.created_at, m.updated_at,
    (SELECT COUNT(*) FROM golf_league_match_entries e WHERE e.match_id = m.id) AS submitted_entries
    FROM golf_league_matches m WHERE m.league_id = ?1 ORDER BY m.scheduled_for, m.created_at DESC LIMIT 100`).bind(leagueId).all();
  return json({ leagueId, matches: matches.results.map((match) => ({ ...match, result: typeof match.result_json === 'string' ? JSON.parse(match.result_json) : null })) }, 200, { 'cache-control': league.visibility === 'public' ? 'public, max-age=30' : 'private, no-store' });
}

async function submitLeagueMatchEntry(request: Request, env: Env, matchId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const playerId = request.headers.get('x-state-of-stick-person-id'); if (!playerId || !isValidPersonId(playerId)) return error('A golfer identity is required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const match = await env.DB.prepare('SELECT id, league_id, player_a_id, player_b_id, format, status FROM golf_league_matches WHERE id = ?1').bind(matchId).first<{ id: string; league_id: string; player_a_id: string; player_b_id: string; format: CompetitionFormat; status: string }>();
  if (!match) return error('Match not found.', 404, 'NOT_FOUND');
  if (match.status === 'complete' || match.status === 'cancelled') return error('This match is no longer accepting entries.', 409, 'MATCH_CLOSED');
  if (playerId !== match.player_a_id && playerId !== match.player_b_id) return error('Only a match participant may submit an entry.', 403, 'FORBIDDEN');
  if (typeof body.roundId !== 'string' || !/^round-[a-zA-Z0-9-]{8,100}$/.test(body.roundId) || typeof body.teeSetId !== 'string' || !isValidId(body.teeSetId.replace(/-/g, 'x'))) return error('roundId and teeSetId are required.', 400, 'INVALID_INPUT');
  const handicapIndex = Number(body.handicapIndex); if (!Number.isFinite(handicapIndex) || handicapIndex < -10 || handicapIndex > 54) return error('handicapIndex must be between -10 and 54.', 400, 'INVALID_INPUT');
  const round = await env.DB.prepare(`SELECT r.id, r.course_id, r.status, r.state_of_stick_person_id, t.id AS tee_id, t.rating, t.slope, COUNT(s.hole_number) AS holes_completed, COALESCE(SUM(s.strokes), 0) AS gross_strokes
    FROM golf_rounds r JOIN golf_tee_sets t ON t.id = ?2 AND t.course_id = r.course_id LEFT JOIN golf_hole_scores s ON s.round_id = r.id
    WHERE r.id = ?1 AND r.state_of_stick_person_id = ?3 GROUP BY r.id, t.id`).bind(body.roundId, body.teeSetId, playerId).first<{ id: string; course_id: string; status: string; tee_id: string; rating: number; slope: number; holes_completed: number; gross_strokes: number }>();
  if (!round) return error('Verified round and tee set were not found for this golfer.', 404, 'NOT_FOUND');
  if (round.status !== 'verified') return error('Only verified rounds can produce a portable match result.', 409, 'ROUND_NOT_VERIFIED');
  const eligible = await env.DB.prepare('SELECT 1 FROM golf_league_courses WHERE league_id = ?1 AND course_id = ?2').bind(match.league_id, round.course_id).first(); if (!eligible) return error('This course is not eligible for the league.', 409, 'COURSE_NOT_ELIGIBLE');
  const parRow = await env.DB.prepare('SELECT COALESCE(SUM(par), 72) AS par FROM golf_holes WHERE course_id = ?1').bind(round.course_id).first<{ par: number }>();
  const courseHandicap = calculateProvisionalCourseHandicap(handicapIndex, Number(round.slope), Number(round.rating), Number(parRow?.par ?? 72));
  const scores = await env.DB.prepare('SELECT hole_number AS hole, strokes, tap_verified AS tapVerified, witness_confirmed AS witnessConfirmed FROM golf_hole_scores WHERE round_id = ?1 ORDER BY hole_number').bind(body.roundId).all();
  const holes = await env.DB.prepare('SELECT hole_number, par, handicap_index FROM golf_holes WHERE course_id = ?1').bind(round.course_id).all();
  const stablefordPoints = match.format === 'stableford' ? calculateHandicapStableford(scores.results.map((row) => ({ hole: Number(row.hole), strokes: Number(row.strokes) })), holes.results.map((row) => ({ number: Number(row.hole_number), par: Number(row.par), handicapIndex: Number(row.handicap_index) })), courseHandicap) : null;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`INSERT INTO golf_league_match_entries (match_id, player_id, round_id, course_id, tee_set_id, gross_strokes, course_handicap, stableford_points, handicap_index, handicap_source, holes_completed, trust_level, verified, submitted_at, verified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'provisional_player_input', ?10, 'course_confirmed', 1, ?11, ?11)`).bind(matchId, playerId, body.roundId, round.course_id, round.tee_id, round.gross_strokes, courseHandicap, stablefordPoints, handicapIndex, round.holes_completed, now).run();
  } catch { return error('This golfer or round already has an entry in the match.', 409, 'ENTRY_EXISTS'); }
  const entryRows = await env.DB.prepare('SELECT player_id, course_id, gross_strokes, course_handicap, handicap_index, handicap_source, stableford_points, holes_completed, verified FROM golf_league_match_entries WHERE match_id = ?1 ORDER BY player_id').bind(matchId).all();
  const entries = entryRows.results.map((row) => ({ playerId: String(row.player_id), courseId: String(row.course_id), grossStrokes: Number(row.gross_strokes), courseHandicap: Number(row.course_handicap), handicapIndex: Number(row.handicap_index), handicapSource: String(row.handicap_source), stablefordPoints: row.stableford_points === null ? undefined : Number(row.stableford_points), holesCompleted: Number(row.holes_completed), verified: Boolean(row.verified) }));
  const result = resolveCompetition(match.format, entries); const nextStatus = result.status === 'complete' ? 'complete' : 'in_progress';
  await env.DB.prepare('UPDATE golf_league_matches SET status = ?1, result_json = ?2, updated_at = ?3 WHERE id = ?4').bind(nextStatus, JSON.stringify(result), now, matchId).run();
  return json({ matchId, result, status: nextStatus }, 201);
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

function courseSlug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'course';
}

async function getCoursePublication(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id');
  if (!organizationId || !isValidId(courseId)) return error('Organization and course identity are required.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id, name FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first<{ id: string; name: string }>();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const publication = await env.DB.prepare('SELECT * FROM golf_course_publications WHERE course_id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first();
  return json({ courseId, courseName: course.name, publication: publication ?? { courseId, organizationId, slug: courseSlug(course.name), status: 'draft' } }, 200, { 'cache-control': 'private, no-store' });
}

async function updateCoursePublication(request: Request, env: Env, courseId: string): Promise<Response> {
  const authError = requireWriteAccess(request, env); if (authError) return authError;
  const organizationId = request.headers.get('x-state-of-stick-organization-id'); const actorId = request.headers.get('x-state-of-stick-person-id');
  if (!organizationId || !actorId || !isValidPersonId(actorId) || !isValidId(courseId)) return error('Organization, actor, and course identity are required.', 400, 'INVALID_INPUT');
  const body = await readJson(request); if (body instanceof Response) return body;
  const action = body.action === 'unpublish' ? 'unpublish' : body.action === 'publish' ? 'publish' : null;
  if (!action) return error('action must be publish or unpublish.', 400, 'INVALID_INPUT');
  const course = await env.DB.prepare('SELECT id, name FROM golf_courses WHERE id = ?1 AND organization_id = ?2').bind(courseId, organizationId).first<{ id: string; name: string }>();
  if (!course) return error('Course not found in this organization.', 404, 'NOT_FOUND');
  const existing = await env.DB.prepare('SELECT slug FROM golf_course_publications WHERE course_id = ?1').bind(courseId).first<{ slug: string }>();
  const slug = typeof body.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) ? body.slug.slice(0, 100) : existing?.slug ?? courseSlug(course.name);
  const title = typeof body.title === 'string' && body.title.trim().length >= 2 ? body.title.trim().slice(0, 180) : `${course.name} | Course Guide, Events & Connected Golf`;
  const description = typeof body.description === 'string' && body.description.trim().length >= 20 ? body.description.trim().slice(0, 320) : `Explore approved course information, local guidance, events, leagues, and connected golfer experiences at ${course.name}.`;
  const now = new Date().toISOString(); const status = action === 'publish' ? 'published' : 'unpublished';
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO golf_course_publications (course_id, organization_id, slug, status, title, description, approved_by_person_id, approved_at, published_at, unpublished_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CASE WHEN ?4 = 'published' THEN ?8 ELSE NULL END, CASE WHEN ?4 = 'unpublished' THEN ?8 ELSE NULL END, ?8, ?8)
        ON CONFLICT(course_id) DO UPDATE SET organization_id = excluded.organization_id, slug = excluded.slug, status = excluded.status, title = excluded.title, description = excluded.description, approved_by_person_id = excluded.approved_by_person_id, approved_at = excluded.approved_at, published_at = CASE WHEN excluded.status = 'published' THEN excluded.published_at ELSE golf_course_publications.published_at END, unpublished_at = CASE WHEN excluded.status = 'unpublished' THEN excluded.unpublished_at ELSE golf_course_publications.unpublished_at END, updated_at = excluded.updated_at`).bind(courseId, organizationId, slug, status, title, description, actorId, now),
      env.DB.prepare(`INSERT INTO golf_operator_audit_events (id, organization_id, course_id, actor_person_id, action, entity_type, entity_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'course_publication', ?6, ?7, ?8)`).bind(`op-${crypto.randomUUID()}`, organizationId, courseId, actorId, action, courseId, JSON.stringify({ status, slug }), now),
      platformEventStatement(env.DB, { eventId: `platform-course-publication-${courseId}-${now}`, eventName: action === 'publish' ? 'golf.course_published' : 'golf.course_unpublished', organizationId, courseId, aggregateType: 'course_publication', aggregateId: courseId, occurredAt: now, payload: { slug, status } }),
    ]);
  } catch (caught) {
    if (String(caught).includes('UNIQUE')) return error('That public course slug is already in use.', 409, 'SLUG_EXISTS');
    throw caught;
  }
  return json({ courseId, publication: { slug, status, title, description, approvedByPersonId: actorId, updatedAt: now } });
}

async function getPublicCourseProfile(env: Env, slug: string): Promise<Response> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return error('Course profile not found.', 404, 'NOT_FOUND');
  const course = await env.DB.prepare(`SELECT c.id, c.name, c.region, c.address, c.state_code, c.latitude, c.longitude, p.slug, p.title, p.description, p.published_at
    FROM golf_courses c JOIN golf_course_publications p ON p.course_id = c.id
    WHERE p.slug = ?1 AND p.status = 'published' LIMIT 1`).bind(slug).first<Record<string, unknown>>();
  if (!course) return error('Course profile not found.', 404, 'NOT_FOUND');
  const [holes, tees, announcements, services, leagues] = await Promise.all([
    env.DB.prepare('SELECT hole_number, name, par, handicap_index, yards, challenge FROM golf_holes WHERE course_id = ?1 ORDER BY hole_number').bind(course.id).all(),
    env.DB.prepare('SELECT id, name, color, rating, slope, yardage FROM golf_tee_sets WHERE course_id = ?1 ORDER BY yardage DESC').bind(course.id).all(),
    env.DB.prepare("SELECT title, body, published, updated_at FROM golf_course_announcements WHERE course_id = ?1 AND published = 1 ORDER BY updated_at DESC LIMIT 20").bind(course.id).all(),
    env.DB.prepare('SELECT id, service_type, name, description, price_cents, currency, fulfillment_modes FROM golf_service_catalog WHERE course_id = ?1 AND active = 1 AND published = 1 ORDER BY name').bind(course.id).all(),
    env.DB.prepare("SELECT l.id, l.name, l.season, l.format, l.region FROM golf_leagues l JOIN golf_league_courses lc ON lc.league_id = l.id WHERE lc.course_id = ?1 AND l.visibility = 'public' AND l.status IN ('draft', 'active') ORDER BY l.start_date, l.name LIMIT 20").bind(course.id).all(),
  ]);
  return json({ profile: { ...course, holes: holes.results, teeSets: tees.results, announcements: announcements.results, services: services.results, leagues: leagues.results, sourceBoundary: 'Only operator-approved published records are included.' } }, 200, { 'cache-control': 'public, max-age=60, s-maxage=300' });
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
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin'), env) });
    if (url.pathname === '/health' && request.method === 'GET') return withCors(json({ ok: true, service: 'sticklink-golf-api', environment: env.ENVIRONMENT }), request, env);
    if (url.pathname.match(/^\/api\/v1\/public\/courses\/[^/]+$/) && request.method === 'GET') return withCors(await getPublicCourseProfile(env, url.pathname.split('/')[5] ?? ''), request, env);
    if (url.pathname.match(/^\/api\/v1\/public\/tee-time-activations\/[^/]+$/) && request.method === 'GET') return withCors(await getTeeTimeActivation(env, url.pathname.split('/')[6] ?? ''), request, env);
    if (url.pathname.match(/^\/api\/v1\/taps\/[^/]+$/) && request.method === 'GET') return withCors(await resolveTap(env, url.pathname.split('/')[4] ?? ''), request, env);
    if (!url.pathname.startsWith('/api/v1/')) return withCors(error('Not found.', 404, 'NOT_FOUND'), request, env);

    const identity = await readStateOfStickAssertion(request, env);
    if (identity instanceof Response) return withCors(identity, request, env);
    if (identity) {
      const sessionError = await checkIdentitySession(env, identity);
      if (sessionError) return withCors(sessionError, request, env);
      // Route handlers consume only this canonicalized request. The two legacy
      // headers remain a compatibility transport, but their values are now
      // populated from the verified State of Stick assertion, never trusted
      // from the browser.
      const headers = new Headers(request.headers);
      headers.delete('x-state-of-stick-person-id');
      headers.delete('x-state-of-stick-organization-id');
      headers.set('x-state-of-stick-person-id', identity.personId);
      if (identity.organizationId) headers.set('x-state-of-stick-organization-id', identity.organizationId);
      // The standard Request constructor and Workers' incoming Request types
      // differ only in Cloudflare's inbound metadata generic.
      request = new Request(request, { headers }) as typeof request;
      verifiedIdentityRequests.add(request);
      verifiedIdentities.set(request, identity);
    }

    const operatorRoute = url.pathname.match(/^\/api\/v1\/(courses\/[^/]+\/(?:tee-times|publication|map-layers|knowledge|assistant|question-insights|tap-points|tap-events|announcements|services|service-requests|operator-profile|operator-review|operator-metrics|billing)|tee-times\/[^/]+\/status|course-claims(?:\/[^/]+\/review)?$)/);
    const golferServiceRequest = url.pathname.endsWith('/service-requests') && request.method === 'POST';
    if (operatorRoute && !golferServiceRequest && request.method !== 'OPTIONS') {
      const operatorError = requireOperatorAccess(request);
      if (operatorError) return withCors(operatorError, request, env);
    }

    let response: Response;
    if (url.pathname === '/api/v1/operator-plans' && request.method === 'GET') {
      response = await getOperatorPlans(env);
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/tee-times\/import$/) && request.method === 'POST') {
      response = await importTeeTimes(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/tee-times$/) && request.method === 'GET') {
      response = await getOperatorTeeTimes(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/tee-times\/[^/]+\/status$/) && request.method === 'POST') {
      response = await updateTeeTimeStatus(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/tee-time-activations\/[^/]+\/claim$/) && request.method === 'POST') {
      response = await claimTeeTimeSlot(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/tee-time-activations\/[^/]+\/start-round$/) && request.method === 'POST') {
      response = await startTeeTimeRound(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/golfer-membership-plans' && request.method === 'GET') {
      response = await getGolferMembershipPlans();
    } else if (url.pathname === '/api/v1/stripe/webhook' && request.method === 'POST') {
      response = await handleGolfStripeWebhook(request, env);
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/billing\/checkout$/) && request.method === 'POST') {
      response = await createOperatorBillingCheckout(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/publication$/) && request.method === 'GET') {
      response = await getCoursePublication(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/publication$/) && request.method === 'POST') {
      response = await updateCoursePublication(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/courses' && request.method === 'GET') {
      response = await discoverCourses(env, request);
    } else if (url.pathname.match(/^\/api\/v1\/players\/[^/]+\/passport$/) && request.method === 'GET') {
      response = await getPassport(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/players\/[^/]+\/intelligence$/) && request.method === 'GET') {
      response = await getPlayerIntelligence(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/assistant' && request.method === 'POST') {
      response = await answerAssistant(request, env);
    } else if (url.pathname.match(/^\/api\/v1\/intelligence\/[^/]+\/feedback$/) && request.method === 'POST') {
      response = await recordInsightFeedback(request, env, url.pathname.split('/')[4] ?? '');
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
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/knowledge$/) && request.method === 'GET') {
      response = await getCourseKnowledge(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/knowledge\/manage$/) && request.method === 'GET') {
      response = await getOperatorKnowledge(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/knowledge$/) && request.method === 'POST') {
      response = await createCourseKnowledge(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/assistant$/) && request.method === 'POST') {
      response = await answerCourseAssistant(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/question-insights$/) && request.method === 'GET') {
      response = await getCourseQuestionInsights(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/tap-points$/) && request.method === 'POST') {
      response = await registerTapPoint(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/tap-points$/) && request.method === 'GET') {
      response = await getOperatorTapPoints(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/tap-events$/) && request.method === 'POST') {
      response = await recordTapEvent(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/tap-points\/[^/]+\/status$/) && request.method === 'POST') {
      response = await updateTapPointStatus(request, env, url.pathname.split('/')[4] ?? '', url.pathname.split('/')[6] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/announcements$/) && request.method === 'GET') {
      response = await getAnnouncements(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/announcements$/) && request.method === 'POST') {
      response = await createAnnouncement(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/services$/) && request.method === 'GET') {
      response = await getServices(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/services$/) && request.method === 'POST') {
      response = await createService(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/service-requests$/) && request.method === 'POST') {
      response = await createServiceRequest(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/service-requests$/) && request.method === 'GET') {
      response = await getServiceRequests(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/service-requests\/[^/]+\/status$/) && request.method === 'POST') {
      response = await updateServiceRequest(request, env, url.pathname.split('/')[3] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/operator-profile$/) && request.method === 'POST') {
      response = await updateCourseProfile(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/operator-review$/) && request.method === 'POST') {
      response = await operatorCourseReview(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/operator-metrics$/) && request.method === 'GET') {
      response = await getOperatorMetrics(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/course-claims' && request.method === 'POST') {
      response = await createCourseClaim(request, env);
    } else if (url.pathname === '/api/v1/course-claims' && request.method === 'GET') {
      response = await getCourseClaims(request, env);
    } else if (url.pathname.match(/^\/api\/v1\/course-claims\/[^/]+\/review$/) && request.method === 'POST') {
      response = await reviewCourseClaim(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/courses\/[^/]+\/intelligence$/) && request.method === 'GET') {
      response = await getOperatorIntelligence(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/courses' && request.method !== 'GET') {
      response = error('Course writes are not available on the public API.', 405, 'METHOD_NOT_ALLOWED');
    } else if (url.pathname.startsWith('/api/v1/courses/') && request.method === 'GET') {
      response = await getCourse(env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/leagues\/[^/]+\/matches$/) && request.method === 'POST') {
      response = await createLeagueMatch(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/leagues\/[^/]+\/matches$/) && request.method === 'GET') {
      response = await getLeagueMatches(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname.match(/^\/api\/v1\/matches\/[^/]+\/entries$/) && request.method === 'POST') {
      response = await submitLeagueMatchEntry(request, env, url.pathname.split('/')[4] ?? '');
    } else if (url.pathname === '/api/v1/leagues' && request.method === 'POST') {
      response = await createLeague(request, env);
    } else if (url.pathname.startsWith('/api/v1/leagues/') && request.method === 'GET') {
      if (url.pathname.endsWith('/live')) response = await getLiveLeague(request, env, url.pathname.split('/')[4] ?? '');
      else if (url.pathname.endsWith('/intelligence')) response = await getLeagueIntelligence(request, env, url.pathname.split('/')[4] ?? '');
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
    ctx.waitUntil(forwardPendingPlatformEvents(env.DB, env.PLATFORM_EVENTS));
    return withCors(response, request, env);
  },
} satisfies ExportedHandler<Env>;
