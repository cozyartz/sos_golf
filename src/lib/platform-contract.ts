import type { GolferFeature, GolferPlanKey } from './membership';

export type PlatformIdentityClaims = {
  issuer: 'state_of_stick';
  personId: string;
  organizationId?: string;
  roles: readonly string[];
  sessionId: string;
  issuedAt: string;
  expiresAt: string;
};

export type PlatformEntitlementSnapshot = {
  personId: string;
  plan: GolferPlanKey;
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  features: readonly GolferFeature[];
  aiQuestionsRemaining: number;
  syncedAt: string;
  source: 'state_of_stick';
};

/** The adapter must verify the platform signature before creating these claims. */
export function platformIdentityIsFresh(claims: PlatformIdentityClaims, now = Date.now()): boolean {
  return claims.issuer === 'state_of_stick' && Date.parse(claims.expiresAt) > now && Date.parse(claims.issuedAt) <= now;
}

export function platformFeatureIsAllowed(snapshot: PlatformEntitlementSnapshot | null, feature: GolferFeature): boolean {
  if (!snapshot || snapshot.source !== 'state_of_stick' || !['active', 'trial'].includes(snapshot.status)) return false;
  if (feature === 'basic_golf_agent' && snapshot.aiQuestionsRemaining < 1) return false;
  return snapshot.features.includes(feature);
}
