export type CompetitionFormat = 'stroke_play' | 'stableford';

export type CompetitionEntry = {
  playerId: string;
  courseId: string;
  grossStrokes: number;
  courseHandicap: number;
  handicapIndex?: number;
  handicapSource?: string;
  stablefordPoints?: number;
  holesCompleted: number;
  verified: boolean;
};

export type CompetitionResult = {
  status: 'pending' | 'complete';
  winnerId: string | null;
  resultLabel: string;
  entries: Array<CompetitionEntry & { netStrokes: number | null }>;
  ruleBoundary: string;
};

export function handicapStrokesForHole(courseHandicap: number, holeHandicapIndex: number): number {
  if (!Number.isInteger(courseHandicap) || !Number.isInteger(holeHandicapIndex) || holeHandicapIndex < 1 || holeHandicapIndex > 18) throw new Error('Handicap stroke inputs are invalid.');
  return Math.floor((courseHandicap + 18 - holeHandicapIndex) / 18);
}

export function calculateHandicapStableford(scores: Array<{ hole: number; strokes: number }>, holes: Array<{ number: number; par: number; handicapIndex: number }>, courseHandicap: number): number {
  const holeMap = new Map(holes.map((hole) => [hole.number, hole]));
  return scores.reduce((points, score) => {
    const hole = holeMap.get(score.hole); if (!hole || score.strokes <= 0) return points;
    const netStrokes = score.strokes - handicapStrokesForHole(courseHandicap, hole.handicapIndex);
    const delta = netStrokes - hole.par;
    return points + (delta <= -3 ? 5 : delta === -2 ? 4 : delta === -1 ? 3 : delta === 0 ? 2 : delta === 1 ? 1 : 0);
  }, 0);
}

export function calculateProvisionalCourseHandicap(handicapIndex: number, slope: number, rating: number, par: number): number {
  if (!Number.isFinite(handicapIndex) || !Number.isFinite(slope) || !Number.isFinite(rating) || !Number.isFinite(par) || slope <= 0) throw new Error('Course handicap inputs are invalid.');
  return Math.round(handicapIndex * (slope / 113) + (rating - par));
}

export function resolveCompetition(format: CompetitionFormat, entries: CompetitionEntry[]): CompetitionResult {
  const normalized = entries.map((entry) => ({ ...entry, netStrokes: entry.grossStrokes - entry.courseHandicap }));
  if (entries.length !== 2 || entries.some((entry) => !entry.verified || entry.holesCompleted < 18)) return { status: 'pending', winnerId: null, resultLabel: 'Awaiting two verified 18-hole entries', entries: normalized, ruleBoundary: 'Official result requires two verified 18-hole rounds. Handicap inputs are provisional until an approved handicap integration is connected.' };
  const score = (entry: CompetitionEntry): number => format === 'stableford' ? (entry.stablefordPoints ?? 0) : entry.grossStrokes - entry.courseHandicap;
  const [first, second] = entries;
  const firstScore = score(first); const secondScore = score(second);
  const winnerId = firstScore === secondScore ? null : firstScore < secondScore && format !== 'stableford' || firstScore > secondScore && format === 'stableford' ? first.playerId : second.playerId;
  return { status: 'complete', winnerId, resultLabel: winnerId ? `${winnerId} wins` : 'Match tied', entries: normalized, ruleBoundary: 'Result is deterministic from submitted verified rounds and provisional league handicap inputs. It is not an official handicap or governing-body ruling.' };
}
