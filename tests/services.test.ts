import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateServiceTotal, canTransitionServiceRequest } from '../src/lib/services.ts';

test('service requests follow an operator-controlled lifecycle', () => {
  assert.equal(canTransitionServiceRequest('requested', 'accepted'), true);
  assert.equal(canTransitionServiceRequest('accepted', 'ready'), false);
  assert.equal(canTransitionServiceRequest('completed', 'cancelled'), false);
});

test('service totals remain integer cents and support non-priced requests', () => {
  assert.equal(calculateServiceTotal(875, 2), 1750);
  assert.equal(calculateServiceTotal(null, 1), null);
});
