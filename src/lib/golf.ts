export type GolfFormat = 'stroke_play' | 'stableford' | 'match_play' | 'skins';
export type ScoreTrustLevel = 'self_reported' | 'partner_attested' | 'commissioner_approved' | 'course_confirmed' | 'officially_integrated';
export type TeeSet = { id: string; name: string; color: string; rating: number; slope: number; yardage: number };
export type Hole = { number: number; name: string; par: number; handicapIndex: number; yards: number; challenge?: string };
export type Course = { id: string; name: string; region: string; address: string; holes: Hole[]; teeSets: TeeSet[]; tapPoints: number };
export type Golfer = { id: string; name: string; region: string; rounds: number; coursesPlayed: number; achievements: number; officialHandicap?: number; privacy: 'public' | 'network' | 'private' };
export type HoleScore = { hole: number; strokes: number; tapVerified: boolean; witnessConfirmed: boolean; proofNote?: string };
export type RoundStatus = 'open' | 'in_progress' | 'submitted' | 'approved';
export type CompetitionBoundary = 'participation' | 'sponsor_activation' | 'commerce' | 'achievement';
export type GolfRound = { id: string; courseId: string; golferId: string; format: GolfFormat; status: RoundStatus; competitionBoundary: CompetitionBoundary[]; scores: HoleScore[] };
export type PortableLeague = { id: string; name: string; season: string; status: 'draft' | 'active' | 'complete'; format: GolfFormat; region: string; courseIds: string[]; participantCount: number; roundsCompleted: number; sponsor?: string };
export type LeagueRoundRecord = { id: string; leagueId: string; golferId: string; courseId: string; teeSetId: string; playedAt: string; scoreToPar: number; points: number; trust: ScoreTrustLevel; status: 'submitted' | 'approved' };
export type LeagueStanding = { golferId: string; name: string; rounds: number; coursesPlayed: number; points: number; trust: ScoreTrustLevel; trend: 'up' | 'steady' | 'new' };

export const cedarRidge: Course = { id: 'cedar-ridge', name: 'Cedar Ridge Golf Club', region: 'Michigan', address: 'Maple City, Michigan', tapPoints: 22, teeSets: [{ id: 'blue', name: 'Blue', color: '#244f3a', rating: 71.8, slope: 132, yardage: 6421 }, { id: 'white', name: 'White', color: '#f4f1e9', rating: 69.6, slope: 126, yardage: 5964 }, { id: 'red', name: 'Red', color: '#e98745', rating: 71.1, slope: 128, yardage: 5298 }], holes: [
  { number: 1, name: 'The Opening', par: 4, handicapIndex: 7, yards: 382 }, { number: 2, name: 'Pine Bend', par: 5, handicapIndex: 3, yards: 506 }, { number: 3, name: 'Oak Run', par: 3, handicapIndex: 15, yards: 164 }, { number: 4, name: 'The Shelf', par: 4, handicapIndex: 1, yards: 411 }, { number: 5, name: 'Little Fox', par: 4, handicapIndex: 11, yards: 365 }, { number: 6, name: 'The Crossing', par: 3, handicapIndex: 17, yards: 142 }, { number: 7, name: 'Red Tail', par: 3, handicapIndex: 13, yards: 148, challenge: 'Closest-to-pin' }, { number: 8, name: 'The Narrows', par: 4, handicapIndex: 5, yards: 372, challenge: 'Local line' }, { number: 9, name: 'Turn House', par: 5, handicapIndex: 9, yards: 489, challenge: 'Order ahead' }, { number: 10, name: 'Long View', par: 4, handicapIndex: 2, yards: 406 }, { number: 11, name: 'Briar', par: 4, handicapIndex: 8, yards: 391 }, { number: 12, name: 'The Drop', par: 3, handicapIndex: 18, yards: 151 }, { number: 13, name: 'Hickory', par: 4, handicapIndex: 6, yards: 405 }, { number: 14, name: 'North Field', par: 5, handicapIndex: 10, yards: 520 }, { number: 15, name: 'The Hollow', par: 4, handicapIndex: 4, yards: 414 }, { number: 16, name: 'Wren', par: 3, handicapIndex: 16, yards: 177 }, { number: 17, name: 'Home Stretch', par: 4, handicapIndex: 12, yards: 397 }, { number: 18, name: 'Last Light', par: 4, handicapIndex: 14, yards: 387 }
] };

export const andrea: Golfer = { id: 'sg-00a79234', name: 'Andrea Cozart-Lundin', region: 'Michigan', rounds: 183, coursesPlayed: 47, achievements: 36, officialHandicap: 18.4, privacy: 'network' };
export const startingScores: HoleScore[] = cedarRidge.holes.map((hole, index) => ({ hole: hole.number, strokes: index < 6 ? [5, 6, 3, 5, 4, 4][index] : 0, tapVerified: index < 6, witnessConfirmed: index < 5 }));
export const demoRound: GolfRound = { id: 'round-cedar-ridge-081926', courseId: cedarRidge.id, golferId: andrea.id, format: 'stroke_play', status: 'in_progress', competitionBoundary: ['participation', 'sponsor_activation', 'commerce', 'achievement'], scores: startingScores };
export const networkCourses: Pick<Course, 'id' | 'name' | 'region' | 'tapPoints'>[] = [
  cedarRidge,
  { id: 'bedford-valley', name: 'Bedford Valley Golf Club', region: 'Michigan', tapPoints: 22 },
  { id: 'arcadia-bluffs', name: 'Arcadia Bluffs', region: 'Michigan', tapPoints: 20 },
  { id: 'briar-hill', name: 'Briar Hill Golf Club', region: 'Michigan', tapPoints: 19 }
];
export const portableLeague: PortableLeague = { id: 'great-lakes-open-2026', name: 'Great Lakes Open', season: 'Summer 2026', status: 'active', format: 'stableford', region: 'Michigan · Play anywhere', courseIds: networkCourses.map((course) => course.id), participantCount: 86, roundsCompleted: 214, sponsor: 'State of Stick Community Fund' };
export const leagueStandings: LeagueStanding[] = [
  { golferId: andrea.id, name: andrea.name, rounds: 5, coursesPlayed: 3, points: 74, trust: 'partner_attested', trend: 'up' },
  { golferId: 'sg-0031', name: 'Marcus Bell', rounds: 6, coursesPlayed: 4, points: 72, trust: 'course_confirmed', trend: 'steady' },
  { golferId: 'sg-0068', name: 'Tina Alvarez', rounds: 4, coursesPlayed: 2, points: 69, trust: 'commissioner_approved', trend: 'up' },
  { golferId: 'sg-0084', name: 'James Porter', rounds: 3, coursesPlayed: 3, points: 63, trust: 'partner_attested', trend: 'new' }
];
export function totalStrokes(scores: HoleScore[]) { return scores.reduce((total, score) => total + score.strokes, 0); }
export function holesCompleted(scores: HoleScore[]) { return scores.filter((score) => score.strokes > 0).length; }
export function totalPar(course: Course, scores: HoleScore[]) { return course.holes.filter((hole) => scores.some((score) => score.hole === hole.number && score.strokes > 0)).reduce((total, hole) => total + hole.par, 0); }
export function stablefordPoints(course: Course, scores: HoleScore[]) { return course.holes.reduce((total, hole) => { const score = scores.find((item) => item.hole === hole.number)?.strokes ?? 0; if (!score) return total; const delta = score - hole.par; return total + (delta <= -3 ? 5 : delta === -2 ? 4 : delta === -1 ? 3 : delta === 0 ? 2 : delta === 1 ? 1 : 0); }, 0); }
export function sticklinkPoints(course: Course, scores: HoleScore[]) { return scores.reduce((total, score) => { if (!score.strokes) return total; const hole = course.holes.find((item) => item.number === score.hole); return total + (score.tapVerified ? 1 : 0) + (score.witnessConfirmed ? 1 : 0) + (hole?.challenge ? 1 : 0); }, 0); }
