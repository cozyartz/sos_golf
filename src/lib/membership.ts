export type GolferPlanKey = 'network_member' | 'player_plus' | 'pro_golfer' | 'league_pass';
export type GolferEntitlementSource = 'state_of_stick' | 'course_sponsor' | 'league' | 'demo';
export type GolferFeature =
  | 'public_course_access'
  | 'saved_rounds'
  | 'golf_passport'
  | 'public_leagues'
  | 'private_leagues'
  | 'cross_course_matches'
  | 'basic_golf_agent'
  | 'personal_round_insights'
  | 'advanced_round_insights'
  | 'practice_suggestions'
  | 'season_analytics'
  | 'custom_challenges'
  | 'commissioner_tools';

export type GolferPlan = {
  key: GolferPlanKey;
  name: string;
  priceDisplay: string;
  billingDisplay: string;
  description: string;
  audience: string;
  aiQuestionsPerMonth: number | null;
  monthlyPriceRangeCents?: readonly [number, number];
  annualPriceRangeCents?: readonly [number, number];
  features: readonly GolferFeature[];
  proposed: boolean;
};

export type GolferAccessContext = {
  plan: GolferPlanKey;
  source?: GolferEntitlementSource;
  aiQuestionsUsed?: number;
};

export type GolferAccessDecision = {
  allowed: boolean;
  reason: 'included' | 'course_sponsored' | 'upgrade_required' | 'allowance_reached';
  plan: GolferPlanKey;
  feature: GolferFeature;
  remainingAiQuestions?: number;
};

/**
 * Product definitions only. State of Stick remains authoritative for live
 * assignments, billing, usage, and access decisions.
 */
export const golferPlans: readonly GolferPlan[] = [
  {
    key: 'network_member', name: 'Network Member', priceDisplay: 'Free', billingDisplay: 'No charge',
    description: 'Your identity and passport for connected golf.', audience: 'Every golfer who wants to play and keep a history.',
    aiQuestionsPerMonth: 10, proposed: false,
    features: ['public_course_access', 'saved_rounds', 'golf_passport', 'public_leagues', 'cross_course_matches', 'basic_golf_agent', 'personal_round_insights']
  },
  {
    key: 'player_plus', name: 'Player Plus', priceDisplay: '$5–$8', billingDisplay: 'Proposed monthly range',
    description: 'More context and more useful feedback from your rounds.', audience: 'Golfers who want to understand their game over time.',
    aiQuestionsPerMonth: 100, monthlyPriceRangeCents: [500, 800], annualPriceRangeCents: [4800, 7200], proposed: true,
    features: ['public_course_access', 'saved_rounds', 'golf_passport', 'public_leagues', 'private_leagues', 'cross_course_matches', 'basic_golf_agent', 'personal_round_insights', 'advanced_round_insights', 'practice_suggestions', 'season_analytics']
  },
  {
    key: 'pro_golfer', name: 'Pro Golfer', priceDisplay: '$10–$15', billingDisplay: 'Proposed monthly range',
    description: 'Advanced competition, season, and player intelligence.', audience: 'Serious golfers, competitors, and highly active network members.',
    aiQuestionsPerMonth: 300, monthlyPriceRangeCents: [1000, 1500], annualPriceRangeCents: [9600, 14400], proposed: true,
    features: ['public_course_access', 'saved_rounds', 'golf_passport', 'public_leagues', 'private_leagues', 'cross_course_matches', 'basic_golf_agent', 'personal_round_insights', 'advanced_round_insights', 'practice_suggestions', 'season_analytics', 'custom_challenges']
  },
  {
    key: 'league_pass', name: 'League Pass', priceDisplay: 'Season or league fee', billingDisplay: 'Proposed commissioner-sponsored option',
    description: 'A participation layer for organized play.', audience: 'League members and commissioners; may be sponsored by a course or league.',
    aiQuestionsPerMonth: 50, proposed: true,
    features: ['public_course_access', 'saved_rounds', 'golf_passport', 'public_leagues', 'private_leagues', 'cross_course_matches', 'basic_golf_agent', 'commissioner_tools']
  }
];

export function planHasFeature(plan: GolferPlan, feature: GolferFeature): boolean {
  return plan.features.includes(feature);
}

export function planFor(key: GolferPlanKey): GolferPlan {
  return golferPlans.find((plan) => plan.key === key) ?? golferPlans[0];
}

/** Product decision only; State of Stick supplies the live plan and usage. */
export function decideGolferAccess(feature: GolferFeature, context: GolferAccessContext): GolferAccessDecision {
  const plan = planFor(context.plan);
  if (context.source === 'course_sponsor' && feature === 'basic_golf_agent') {
    return { allowed: true, reason: 'course_sponsored', plan: plan.key, feature };
  }
  if (!planHasFeature(plan, feature)) {
    return { allowed: false, reason: 'upgrade_required', plan: plan.key, feature };
  }
  if (feature === 'basic_golf_agent' && plan.aiQuestionsPerMonth !== null) {
    const used = Math.max(0, context.aiQuestionsUsed ?? 0);
    const remaining = Math.max(0, plan.aiQuestionsPerMonth - used);
    if (remaining === 0) return { allowed: false, reason: 'allowance_reached', plan: plan.key, feature, remainingAiQuestions: 0 };
    return { allowed: true, reason: 'included', plan: plan.key, feature, remainingAiQuestions: remaining };
  }
  return { allowed: true, reason: 'included', plan: plan.key, feature };
}
