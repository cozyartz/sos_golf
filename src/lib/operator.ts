export type OperatorBriefPriority = 'high' | 'medium' | 'low';

export type OperatorBriefInput = {
  submittedRounds: number;
  openServiceRequests: number;
  activeTeeTimeHandoffs: number;
  unansweredQuestions: number;
  attentionTapPoints: number;
  unpublishedKnowledge: number;
  unapprovedGeometry: number;
};

export type OperatorBriefAction = {
  key: string;
  priority: OperatorBriefPriority;
  label: string;
  reason: string;
  sourceRef: string;
};

export type OperatorBrief = {
  kind: 'operator_shift_brief';
  generatedAt: string;
  actions: OperatorBriefAction[];
  sourceFacts: Array<{ sourceRef: string; label: string; value: string }>;
  boundary: string;
};

/**
 * Turn recorded operational queues into a review order. This is deliberately
 * deterministic: it prepares staff work and never approves, publishes,
 * fulfills, changes scores, or moves money.
 */
export function buildOperatorBrief(input: OperatorBriefInput, generatedAt = new Date().toISOString()): OperatorBrief {
  const actions: OperatorBriefAction[] = [];
  const add = (key: string, priority: OperatorBriefPriority, label: string, reason: string, sourceRef: string) => {
    actions.push({ key, priority, label, reason, sourceRef });
  };

  if (input.submittedRounds > 0) add('review-rounds', 'high', 'Review submitted rounds', `${input.submittedRounds} submitted round(s) are waiting for operator review.`, 'operator:rounds:submitted');
  if (input.openServiceRequests > 0) add('respond-services', 'high', 'Respond to service requests', `${input.openServiceRequests} service request(s) still need an operator response or fulfillment update.`, 'operator:services:open');
  if (input.activeTeeTimeHandoffs > 0) add('check-tee-times', 'medium', 'Check tee-time handoffs', `${input.activeTeeTimeHandoffs} tee-time activation(s) are active or awaiting a handoff.`, 'operator:tee-times:active');
  if (input.unansweredQuestions > 0) add('improve-knowledge', 'medium', 'Improve course answers', `${input.unansweredQuestions} course question signal(s) were not answered from approved knowledge.`, 'operator:questions:unanswered');
  if (input.attentionTapPoints > 0) add('inspect-tap-points', 'medium', 'Inspect physical touchpoints', `${input.attentionTapPoints} StickLink location(s) are marked as needing attention.`, 'operator:tap-points:attention');
  if (input.unpublishedKnowledge > 0) add('review-knowledge', 'low', 'Review course knowledge', `${input.unpublishedKnowledge} course knowledge record(s) are unpublished and available for review.`, 'operator:knowledge:unpublished');
  if (input.unapprovedGeometry > 0) add('approve-geometry', 'low', 'Review course geometry', `${input.unapprovedGeometry} geometry layer(s) are not operator-approved.`, 'operator:geometry:unapproved');

  if (!actions.length) add('monitor', 'low', 'Monitor the next shift', 'No recorded queue currently requires action.', 'operator:queues:empty');

  return {
    kind: 'operator_shift_brief',
    generatedAt,
    actions,
    sourceFacts: Object.entries(input).map(([key, value]) => ({ sourceRef: `operator:${key}`, label: key, value: String(value) })),
    boundary: 'Prepared from recorded D1 activity. Staff must review and explicitly perform any score, publication, price, order, customer, or maintenance action.',
  };
}
