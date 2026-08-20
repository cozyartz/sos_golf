import type { GolfFormat, HoleScore, RoundStatus, ScoreTrustLevel } from './golf';

export type VerificationEventType = 'tap_verification' | 'witness_confirmation' | 'operator_review' | 'course_confirmation' | 'round_rejected';
export type VerificationEvent = { id: string; roundId: string; type: VerificationEventType; actorId: string; hole?: number; note?: string; createdAt: string };
export type PassportSummary = { personId: string; roundsPlayed: number; coursesPlayed: number; holesCompleted: number; verifiedRounds: number; personalBests: Array<{ courseId: string; scoreToPar: number; playedAt: string }>; currentStreak: number; leagueMemberships: Array<{ id: string; name: string; season: string }> };
export type CourseLocation = { latitude: number; longitude: number; stateCode: string; source: 'operator_seeded' | 'operator_updated' | 'open_reference' };
export type CourseDiscoveryFilter = { stateCode?: string; format?: GolfFormat; difficulty?: 'easy' | 'moderate' | 'challenging'; leagueActive?: boolean; hasStickLinks?: boolean; recentlyPlayedBy?: string; page?: number; pageSize?: number };
export type LeagueVisibility = 'public' | 'private';
export type LeagueCadence = 'weekly' | 'seasonal';

export const roundStatuses: RoundStatus[] = ['draft', 'in_progress', 'submitted', 'verified', 'rejected'];
export function isVerificationEvent(event: VerificationEvent): boolean { return event.type === 'operator_review' || event.type === 'course_confirmation'; }
export function canVerifyRound(status: RoundStatus, events: VerificationEvent[]): boolean { return status === 'submitted' && events.some(isVerificationEvent); }
export function trustLevelForEvents(events: VerificationEvent[]): ScoreTrustLevel {
  if (events.some((event) => event.type === 'course_confirmation')) return 'course_confirmed';
  if (events.some((event) => event.type === 'operator_review')) return 'commissioner_approved';
  if (events.some((event) => event.type === 'witness_confirmation')) return 'partner_attested';
  return 'self_reported';
}

export function stablefordForHole(par: number, strokes: number): number { const delta = strokes - par; return delta <= -3 ? 5 : delta === -2 ? 4 : delta === -1 ? 3 : delta === 0 ? 2 : delta === 1 ? 1 : 0; }
export function calculateLeaguePoints(format: GolfFormat, scores: HoleScore[], pars: Map<number, number>): number {
  if (format === 'stableford') return scores.reduce((sum, score) => sum + (score.strokes ? stablefordForHole(pars.get(score.hole) ?? 4, score.strokes) : 0), 0);
  if (format === 'skins') return scores.reduce((sum, score) => sum + (score.tapVerified ? 1 : 0), 0);
  if (format === 'match_play') return scores.reduce((sum, score) => sum + (score.strokes > 0 ? 1 : 0), 0);
  return scores.filter((score) => score.strokes > 0).reduce((sum, score) => sum + score.strokes, 0);
}
export function rankWithTies(rows: Array<{ points: number }>): number[] { const ranks: number[] = []; let previous: number | undefined; let rank = 0; rows.forEach((row, index) => { if (row.points !== previous) rank = index + 1; ranks.push(rank); previous = row.points; }); return ranks; }
export function pageWindow(page = 1, pageSize = 20): { page: number; pageSize: number; offset: number } { const safePage = Number.isInteger(page) && page > 0 ? Math.min(page, 10000) : 1; const safeSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20; return { page: safePage, pageSize: safeSize, offset: (safePage - 1) * safeSize }; }
export function canViewLeague(visibility: LeagueVisibility, requesterId: string | undefined, enrolledIds: string[]): boolean { return visibility === 'public' || (!!requesterId && enrolledIds.includes(requesterId)); }
