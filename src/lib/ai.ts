import type { Course, GolfRound } from './golf';

export type AIResult = { trustedFacts: string[]; suggestions: string[]; unverifiedObservations: string[] };
export function summarizeRound(course: Course, round: GolfRound): AIResult {
  const completed = round.scores.filter((score) => score.strokes > 0);
  const par = course.holes.filter((hole) => completed.some((score) => score.hole === hole.number)).reduce((sum, hole) => sum + hole.par, 0);
  const strokes = completed.reduce((sum, score) => sum + score.strokes, 0);
  const warnings = completed.filter((score) => score.strokes > 0 && score.strokes > 8).map((score) => `Hole ${score.hole} has a high recorded score; confirm before submitting.`);
  return { trustedFacts: [`${completed.length} of ${course.holes.length} holes have recorded strokes.`, completed.length ? `${strokes - par >= 0 ? '+' : ''}${strokes - par} to par for completed holes.` : 'No strokes recorded yet.'], suggestions: ['Keep official strokes separate from format points and physical verification.', 'Use a witness or course confirmation when the round needs stronger trust.'], unverifiedObservations: warnings.length ? warnings : ['No deterministic score warnings for the supplied data.'] };
}
