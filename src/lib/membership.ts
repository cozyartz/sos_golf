export type GolferPlanKey = 'network_member' | 'player_plus' | 'pro_golfer' | 'league_pass';
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
  features: readonly GolferFeature[];
  proposed: boolean;
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
    aiQuestionsPerMonth: 100, proposed: true,
    features: ['public_course_access', 'saved_rounds', 'golf_passport', 'public_leagues', 'private_leagues', 'cross_course_matches', 'basic_golf_agent', 'personal_round_insights', 'advanced_round_insights', 'practice_suggestions', 'season_analytics']
  },
  {
    key: 'pro_golfer', name: 'Pro Golfer', priceDisplay: '$10–$15', billingDisplay: 'Proposed monthly range',
    description: 'Advanced competition, season, and player intelligence.', audience: 'Serious golfers, competitors, and highly active network members.',
    aiQuestionsPerMonth: 300, proposed: true,
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
