type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

type StripeCheckoutSession = {
  id: string;
  url?: string | null;
  mode?: string;
  payment_status?: string;
  subscription?: string | null;
  customer?: string | null;
  metadata?: Record<string, string>;
};

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

function encodeForm(value: unknown, prefix = '', output: string[] = []): string[] {
  if (value === undefined || value === null) return output;
  if (Array.isArray(value)) value.forEach((item, index) => encodeForm(item, `${prefix}[${index}]`, output));
  else if (typeof value === 'object') for (const [key, item] of Object.entries(value as Record<string, unknown>)) encodeForm(item, prefix ? `${prefix}[${key}]` : key, output);
  else output.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return output;
}

async function stripeRequest<T>(env: StripeEnv, path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  const headers: Record<string, string> = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com${path}`, { method: 'POST', headers, body: encodeForm(body).join('&') });
  const data = await response.json() as T & { error?: { message?: string; type?: string } };
  if (!response.ok) throw new Error(data.error?.message || data.error?.type || 'Stripe request failed.');
  return data;
}

export function createOperatorCheckout(env: StripeEnv, input: { priceId: string; successUrl: string; cancelUrl: string; customerEmail?: string; courseId: string; organizationId: string; claimId?: string; idempotencyKey: string }): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>(env, '/v1/checkout/sessions', {
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [{ price: input.priceId, quantity: 1 }],
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    metadata: { purpose: 'golf_connected_course', course_id: input.courseId, organization_id: input.organizationId, ...(input.claimId ? { claim_id: input.claimId } : {}) },
    subscription_data: { metadata: { purpose: 'golf_connected_course', course_id: input.courseId, organization_id: input.organizationId, ...(input.claimId ? { claim_id: input.claimId } : {}) } },
  }, input.idempotencyKey);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function hex(buffer: ArrayBuffer): string { return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join(''); }

export async function verifyStripeWebhook(env: StripeEnv, rawBody: string, signatureHeader: string | null, toleranceSeconds = 300): Promise<StripeEvent> {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook verification is not configured.');
  if (!signatureHeader) throw new Error('Missing Stripe-Signature header.');
  const parts = Object.fromEntries(signatureHeader.split(',').map((part) => { const [key, ...rest] = part.split('='); return [key.trim(), rest.join('=')]; })) as { t?: string; v1?: string };
  const timestamp = Number(parts.t); const signatures = signatureHeader.split(',').filter((part) => part.trim().startsWith('v1=')).map((part) => part.trim().slice(3));
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new Error('Malformed Stripe-Signature header.');
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp); if (age > toleranceSeconds) throw new Error('Stripe webhook timestamp outside tolerance.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  if (!signatures.some((signature) => timingSafeEqual(signature, digest))) throw new Error('Stripe webhook signature verification failed.');
  return JSON.parse(rawBody) as StripeEvent;
}

export function stripeObjectString(object: Record<string, unknown>, key: string): string | null { return typeof object[key] === 'string' ? object[key] as string : null; }
