import type { Course, GolfRound, HoleScore, LeagueStanding } from './golf';

export type IntelligenceConfidence = 'high' | 'medium' | 'low';
export type IntelligenceVerification = 'verified' | 'advisory';
export type IntelligenceFact = { sourceRef: string; label: string; value: string; verified: boolean };
export type IntelligenceResult = {
  kind: string;
  sourceFacts: IntelligenceFact[];
  interpretation: string;
  confidence: IntelligenceConfidence;
  verificationStatus: IntelligenceVerification;
  generatedAt: string;
  ruleVersion: string;
  providerId: string;
};

export interface GolfIntelligenceService {
  roundSummary(round: GolfRound, course: Course): IntelligenceResult;
  playerTrends(rounds: GolfRound[], courses: Course[]): IntelligenceResult;
  courseDifficulty(rounds: GolfRound[], course: Course): IntelligenceResult;
  leagueStandings(standings: LeagueStanding[], viewerId: string): IntelligenceResult;
  practiceSuggestions(rounds: GolfRound[], course: Course): IntelligenceResult;
  operatorSummary(facts: IntelligenceFact[]): IntelligenceResult;
  answerOwnRounds(question: string, facts: IntelligenceFact[]): IntelligenceResult;
}

const RULE_VERSION = 'deterministic-v1';
const PROVIDER_ID = 'rules-engine';
const now = () => new Date().toISOString();
const result = (kind: string, sourceFacts: IntelligenceFact[], interpretation: string, confidence: IntelligenceConfidence = 'medium'): IntelligenceResult => ({ kind, sourceFacts, interpretation, confidence, verificationStatus: 'advisory', generatedAt: now(), ruleVersion: RULE_VERSION, providerId: PROVIDER_ID });
const fact = (sourceRef: string, label: string, value: string, verified = true): IntelligenceFact => ({ sourceRef, label, value, verified });

function completed(scores: HoleScore[]): HoleScore[] { return scores.filter((score) => score.strokes > 0); }
function sanitizeQuestion(question: string): string { return question.replace(/[\u0000-\u001f]/g, ' ').slice(0, 500).trim(); }
function refusal(question: string): boolean { return /another player|other player|private|medical|diagnos|gambl|payout|wager|live condition|weather now/i.test(question); }

export const deterministicIntelligence: GolfIntelligenceService = {
  roundSummary(round, course) {
    const scores = completed(round.scores); const par = course.holes.filter((hole) => scores.some((score) => score.hole === hole.number)).reduce((sum, hole) => sum + hole.par, 0); const strokes = scores.reduce((sum, score) => sum + score.strokes, 0); const verifiedTaps = scores.filter((score) => score.tapVerified).length;
    return result('round_summary', [fact(`round:${round.id}`, 'Round status', round.status), fact(`round:${round.id}:scores`, 'Completed holes', `${scores.length} of ${course.holes.length}`), fact(`round:${round.id}:score`, 'Recorded score to par', `${strokes - par >= 0 ? '+' : ''}${strokes - par}`), fact(`round:${round.id}:taps`, 'Tap verifications', String(verifiedTaps))], `Based on your recorded rounds, you completed ${scores.length} holes at ${course.name}. The recorded score is ${strokes - par >= 0 ? '+' : ''}${strokes - par} to par for those holes. This is an advisory summary, not an official handicap calculation.`, scores.length >= 9 ? 'high' : 'medium');
  },
  playerTrends(rounds) {
    const usable = rounds.filter((round) => completed(round.scores).length > 0); const totals = usable.map((round) => completed(round.scores).reduce((sum, score) => sum + score.strokes, 0)); const direction = totals.length > 1 && totals[0] < totals[totals.length - 1] ? 'improving' : totals.length > 1 && totals[0] > totals[totals.length - 1] ? 'higher recently' : 'steady';
    return result('player_trends', [fact('player:rounds', 'Rounds with recorded scores', String(usable.length)), fact('player:recent-totals', 'Recent recorded totals', totals.slice(0, 5).join(', ') || 'none')], `Your recorded scoring trend is ${direction}. Your data suggests using the most recent comparable rounds for practice decisions; this does not calculate an official handicap.`, usable.length >= 3 ? 'medium' : 'low');
  },
  courseDifficulty(rounds, course) {
    const relevant = rounds.filter((round) => round.courseId === course.id); const scores = relevant.flatMap((round) => completed(round.scores)); const average = scores.length ? scores.reduce((sum, score) => sum + score.strokes, 0) / scores.length : 0;
    return result('course_difficulty', [fact(`course:${course.id}`, 'Course', course.name), fact(`course:${course.id}:rounds`, 'Recorded rounds', String(relevant.length)), fact(`course:${course.id}:average`, 'Average recorded strokes per completed hole', average ? average.toFixed(2) : 'not enough data')], average ? `Based on ${relevant.length} recorded round(s), this course is a useful comparison point for your game. The available sample averages ${average.toFixed(2)} strokes per completed hole; this is an advisory observation, not an official course rating.` : 'There is not enough recorded data to describe course difficulty yet.', relevant.length > 1 ? 'medium' : 'low');
  },
  leagueStandings(standings, viewerId) {
    const viewer = standings.find((standing) => standing.golferId === viewerId); const sorted = [...standings].sort((a, b) => b.points - a.points); const position = viewer ? sorted.findIndex((standing) => standing.golferId === viewerId) + 1 : null; const next = position && position > 1 ? sorted[position - 2] : null;
    return result('league_standings', [fact('league:standings', 'Published standings rows', String(standings.length)), fact(`league:viewer:${viewerId}`, 'Viewer points', viewer ? String(viewer.points) : 'not enrolled'), fact('league:ranking', 'Tie policy', 'competition ranking; equal points share a rank')], viewer ? `You are currently ${position === 1 ? 'in first place' : `ranked ${position}`}${next ? ` and need ${Math.max(0, next.points - viewer.points)} more point(s) to reach the next published total` : ''}. Equal points share a rank; the league result remains authoritative in the standings record.` : 'You are not present in the published standings. This is an advisory explanation of the available league data.', viewer ? 'high' : 'low');
  },
  practiceSuggestions(rounds, course) {
    const scores = rounds.filter((round) => round.courseId === course.id).flatMap((round) => completed(round.scores)); const byHole = new Map<number, number[]>(); scores.forEach((score) => byHole.set(score.hole, [...(byHole.get(score.hole) ?? []), score.strokes])); const weakest = [...byHole.entries()].sort((a, b) => (b[1].reduce((x, y) => x + y, 0) / b[1].length) - (a[1].reduce((x, y) => x + y, 0) / a[1].length))[0];
    return result('practice_suggestions', weakest ? [fact(`course:${course.id}:hole:${weakest[0]}`, 'Most costly recorded hole', `Hole ${weakest[0]}`), fact(`course:${course.id}:hole:${weakest[0]}:scores`, 'Recorded scores', weakest[1].join(', '))] : [fact(`course:${course.id}`, 'Practice data', 'not enough recorded scores')], weakest ? `Your next best practice focus may be Hole ${weakest[0]}, based on the highest average recorded score in this sample. Your data suggests this is a practice priority; it is not a diagnosis or official performance rating.` : 'Record more rounds to receive a practice focus.', weakest ? 'medium' : 'low');
  },
  operatorSummary(facts) { return result('operator_summary', facts, 'This operator summary separates supplied observations from confirmed course records. Review each source before publishing a course-facing conclusion.', facts.length ? 'medium' : 'low'); },
  answerOwnRounds(question, facts) {
    const safe = sanitizeQuestion(question); if (!safe || refusal(safe)) return result('assistant_refusal', [], 'I can only answer from your authorized golf records. I cannot provide another player’s private data, medical or gambling advice, unsupported live conditions, or unverified official claims.', 'high');
    if (/losing.*strokes|practice|hole/i.test(safe)) return result('assistant_answer', facts, facts.length ? `Based on your authorized recorded facts: ${facts.map((item) => `${item.label}: ${item.value}`).join('; ')}. Your next practice focus should be treated as advisory.` : 'I do not have enough authorized round data to answer that yet.', facts.length ? 'medium' : 'low');
    return result('assistant_answer', facts, facts.length ? `I found these authorized facts in your golf records: ${facts.map((item) => `${item.label}: ${item.value}`).join('; ')}.` : 'I do not have enough authorized round data to answer that yet.', facts.length ? 'medium' : 'low');
  },
};
