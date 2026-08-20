import assert from 'node:assert/strict';
import test from 'node:test';
import { golferPlans, planFor, planHasFeature } from '../src/lib/membership.ts';

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
