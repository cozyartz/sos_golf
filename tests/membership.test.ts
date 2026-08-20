import assert from 'node:assert/strict';
import test from 'node:test';
import { decideGolferAccess, golferPlans, planFor, planHasFeature } from '../src/lib/membership.ts';
import { canTransitionTeeTimeStatus, isTeeTimePlayerCount, isTeeTimeSource, isTeeTimeStatus } from '../src/lib/tee-times.ts';

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
