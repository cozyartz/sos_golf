import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorBrief } from '../src/lib/operator.ts';

test('operator brief prioritizes recorded work without taking action', () => {
  const brief = buildOperatorBrief({
    submittedRounds: 2,
    openServiceRequests: 1,
    activeTeeTimeHandoffs: 0,
    unansweredQuestions: 3,
    attentionTapPoints: 0,
    unpublishedKnowledge: 0,
    unapprovedGeometry: 0,
  }, '2026-08-20T12:00:00.000Z');
  assert.equal(brief.kind, 'operator_shift_brief');
  assert.equal(brief.generatedAt, '2026-08-20T12:00:00.000Z');
  assert.deepEqual(brief.actions.map((action) => action.key), ['review-rounds', 'respond-services', 'improve-knowledge']);
  assert.match(brief.boundary, /explicitly perform/);
});

test('empty queues produce a truthful monitoring action', () => {
  const brief = buildOperatorBrief({ submittedRounds: 0, openServiceRequests: 0, activeTeeTimeHandoffs: 0, unansweredQuestions: 0, attentionTapPoints: 0, unpublishedKnowledge: 0, unapprovedGeometry: 0 }, 'now');
  assert.deepEqual(brief.actions.map((action) => action.key), ['monitor']);
  assert.match(brief.actions[0].reason, /No recorded queue/);
});
