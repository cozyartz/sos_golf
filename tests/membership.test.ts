import assert from 'node:assert/strict';
import test from 'node:test';
import { decideGolferAccess, golferPlans, planFor, planHasFeature } from '../src/lib/membership.ts';
import { canTransitionTeeTimeStatus, isTeeTimePlayerCount, isTeeTimeSource, isTeeTimeStatus } from '../src/lib/tee-times.ts';
import { platformFeatureIsAllowed, platformIdentityIsFresh, type PlatformEntitlementSnapshot, type PlatformIdentityClaims } from '../src/lib/platform-contract.ts';
import { createStateOfStickAssertion, readStateOfStickAssertion } from '../worker/src/identity.ts';

test('network membership keeps basic play available without paid features', () => {
  const plan = planFor('network_member');
  assert.equal(plan.priceDisplay, 'Free');
  assert.equal(planHasFeature(plan, 'saved_rounds'), true);
  assert.equal(planHasFeature(plan, 'advanced_round_insights'), false);
});

test('proposed golfer plans add depth without changing the official-data boundary', () => {
  const pro = planFor('pro_golfer');
  assert.equal(pro.proposed, true);
  assert.equal(planHasFeature(pro, 'custom_challenges'), true);
  assert.equal(golferPlans.some((plan) => plan.key === 'league_pass'), true);
});

test('course sponsorship covers basic course questions without unlocking personal depth', () => {
  const sponsored = decideGolferAccess('basic_golf_agent', { plan: 'network_member', source: 'course_sponsor' });
  const personal = decideGolferAccess('practice_suggestions', { plan: 'network_member', source: 'course_sponsor' });
  assert.equal(sponsored.reason, 'course_sponsored');
  assert.equal(sponsored.allowed, true);
  assert.equal(personal.reason, 'upgrade_required');
});

test('AI allowance fails closed when the monthly allowance is reached', () => {
  const decision = decideGolferAccess('basic_golf_agent', { plan: 'player_plus', aiQuestionsUsed: 100 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'allowance_reached');
  assert.equal(decision.remainingAiQuestions, 0);
});

test('tee-time import accepts bounded source values and statuses', () => {
  assert.equal(isTeeTimeSource('Existing Tee Sheet'), true);
  assert.equal(isTeeTimeSource(''), false);
  assert.equal(isTeeTimePlayerCount(4), true);
  assert.equal(isTeeTimePlayerCount(9), false);
  assert.equal(isTeeTimeStatus('reserved'), true);
  assert.equal(isTeeTimeStatus('booked'), false);
  assert.equal(canTransitionTeeTimeStatus('reserved', 'activated'), true);
  assert.equal(canTransitionTeeTimeStatus('completed', 'reserved'), false);
});

test('platform identity and entitlement decisions fail closed without verified freshness', () => {
  const claims: PlatformIdentityClaims = { issuer: 'state_of_stick', personId: 'person-1', roles: ['golfer'], sessionId: 'session-1', issuedAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-20T13:00:00.000Z' };
  const snapshot: PlatformEntitlementSnapshot = { personId: 'person-1', plan: 'player_plus', status: 'active', features: ['basic_golf_agent', 'saved_rounds'], aiQuestionsRemaining: 3, syncedAt: '2026-08-20T12:00:00.000Z', source: 'state_of_stick' };
  assert.equal(platformIdentityIsFresh(claims, Date.parse('2026-08-20T12:30:00.000Z')), true);
  assert.equal(platformIdentityIsFresh(claims, Date.parse('2026-08-20T14:00:00.000Z')), false);
  assert.equal(platformFeatureIsAllowed(snapshot, 'basic_golf_agent'), true);
  assert.equal(platformFeatureIsAllowed({ ...snapshot, aiQuestionsRemaining: 0 }, 'basic_golf_agent'), false);
  assert.equal(platformFeatureIsAllowed(null, 'saved_rounds'), false);
});

test('signed State of Stick assertions verify and reject tampering or expiry', async () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const claims: PlatformIdentityClaims = { issuer: 'state_of_stick', personId: 'person-1', organizationId: 'org-1', roles: ['golfer'], sessionId: 'session-1', issuedAt: '2026-08-20T12:00:00.000Z', expiresAt: '2026-08-20T13:00:00.000Z' };
  const assertion = await createStateOfStickAssertion(claims, secret);
  const request = new Request('https://golf-api.example/api/v1/rounds', { headers: { 'x-state-of-stick-identity-assertion': assertion, 'x-state-of-stick-person-id': 'person-1' } });
  const verified = await readStateOfStickAssertion(request, { ENVIRONMENT: 'production', STATE_OF_STICK_IDENTITY_SECRET: secret }, Date.parse('2026-08-20T12:30:00.000Z'));
  assert.equal((verified as PlatformIdentityClaims).personId, 'person-1');
  const tampered = new Request(request, { headers: { 'x-state-of-stick-identity-assertion': `${assertion.slice(0, -1)}x` } });
  assert.equal((await readStateOfStickAssertion(tampered, { ENVIRONMENT: 'production', STATE_OF_STICK_IDENTITY_SECRET: secret }, Date.parse('2026-08-20T12:30:00.000Z')) as Response).status, 401);
  assert.equal((await readStateOfStickAssertion(request, { ENVIRONMENT: 'production', STATE_OF_STICK_IDENTITY_SECRET: secret }, Date.parse('2026-08-20T14:00:00.000Z')) as Response).status, 401);
});
