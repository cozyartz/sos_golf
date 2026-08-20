import type { PlatformIdentityClaims } from '../../src/lib/platform-contract';

const ASSERTION_HEADER = 'x-state-of-stick-identity-assertion';
const MAX_ASSERTION_BYTES = 16_384;

type IdentityEnv = {
  ENVIRONMENT?: string;
  STATE_OF_STICK_IDENTITY_SECRET?: string;
};

function secretFrom(env: IdentityEnv): string | undefined {
  const value = Reflect.get(env, 'STATE_OF_STICK_IDENTITY_SECRET');
  return typeof value === 'string' && value.length >= 32 ? value : undefined;
}

function encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function validClaimString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function parseClaims(bytes: Uint8Array): PlatformIdentityClaims | null {
  if (bytes.length > MAX_ASSERTION_BYTES) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<PlatformIdentityClaims>;
    if (parsed.issuer !== 'state_of_stick' || !validClaimString(parsed.personId, 120) || !validClaimString(parsed.sessionId, 160) || !validClaimString(parsed.issuedAt, 40) || !validClaimString(parsed.expiresAt, 40)) return null;
    if (!Array.isArray(parsed.roles) || parsed.roles.length > 30 || !parsed.roles.every((role) => validClaimString(role, 80))) return null;
    if (parsed.organizationId !== undefined && !validClaimString(parsed.organizationId, 120)) return null;
    if (!Number.isFinite(Date.parse(parsed.issuedAt)) || !Number.isFinite(Date.parse(parsed.expiresAt))) return null;
    return { issuer: 'state_of_stick', personId: parsed.personId, organizationId: parsed.organizationId, roles: parsed.roles, sessionId: parsed.sessionId, issuedAt: parsed.issuedAt, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

async function signatureFor(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
}

async function signaturesEqual(payload: string, encodedSignature: string, secret: string): Promise<boolean> {
  const signature = decode(encodedSignature);
  if (!signature || signature.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signatureBuffer = signature.slice().buffer as ArrayBuffer;
  return crypto.subtle.verify('HMAC', key, signatureBuffer, new TextEncoder().encode(payload));
}

/** Create the compact assertion that State of Stick will issue to Golf. */
export async function createStateOfStickAssertion(claims: PlatformIdentityClaims, secret: string): Promise<string> {
  const payload = encode(new TextEncoder().encode(JSON.stringify(claims)));
  return `${payload}.${encode(await signatureFor(payload, secret))}`;
}

export async function readStateOfStickAssertion(request: Request, env: IdentityEnv, now = Date.now()): Promise<PlatformIdentityClaims | Response | null> {
  const assertion = request.headers.get(ASSERTION_HEADER);
  if (!assertion) return null;
  const secret = secretFrom(env);
  if (!secret) return new Response(JSON.stringify({ error: { code: 'IDENTITY_NOT_CONFIGURED', message: 'State of Stick identity verification is not configured.' } }), { status: 503, headers: { 'content-type': 'application/json' } });
  if (assertion.length > MAX_ASSERTION_BYTES * 2) return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Identity assertion is invalid.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const separator = assertion.indexOf('.');
  if (separator < 1 || separator !== assertion.lastIndexOf('.')) return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Identity assertion is invalid.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const payload = assertion.slice(0, separator);
  const claims = parseClaims(decode(payload) ?? new Uint8Array());
  if (!claims || !(await signaturesEqual(payload, assertion.slice(separator + 1), secret)) || Date.parse(claims.issuedAt) > now || Date.parse(claims.expiresAt) <= now) return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Identity assertion is invalid, expired, or not yet active.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const personHeader = request.headers.get('x-state-of-stick-person-id');
  const organizationHeader = request.headers.get('x-state-of-stick-organization-id');
  if ((personHeader && personHeader !== claims.personId) || (organizationHeader && organizationHeader !== claims.organizationId)) return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Caller identity headers do not match the verified State of Stick assertion.' } }), { status: 403, headers: { 'content-type': 'application/json' } });
  return claims;
}

export const stateOfStickIdentityAssertionHeader = ASSERTION_HEADER;
