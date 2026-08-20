import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHandicapStableford, calculateProvisionalCourseHandicap, handicapStrokesForHole, resolveCompetition } from '../src/lib/competition.ts';

test('cross-course competition normalizes a provisional course handicap', () => {
  assert.equal(calculateProvisionalCourseHandicap(12, 130, 71.5, 72), 13);
});

test('portable stroke-play match compares net results across courses', () => {
  const result = resolveCompetition('stroke_play', [
    { playerId: 'a', courseId: 'course-a', grossStrokes: 91, courseHandicap: 17, holesCompleted: 18, verified: true },
    { playerId: 'b', courseId: 'course-b', grossStrokes: 96, courseHandicap: 22, holesCompleted: 18, verified: true },
  ]);
  assert.equal(result.status, 'complete');
  assert.equal(result.winnerId, null);
});

test('Stableford applies handicap strokes according to hole handicap index', () => {
  assert.equal(handicapStrokesForHole(20, 1), 2);
  assert.equal(handicapStrokesForHole(20, 3), 1);
  assert.equal(calculateHandicapStableford([{ hole: 1, strokes: 5 }], [{ number: 1, par: 4, handicapIndex: 1 }], 20), 3);
});

test('competition stays pending until both entries are verified and complete', () => {
  const result = resolveCompetition('stroke_play', [{ playerId: 'a', courseId: 'course-a', grossStrokes: 91, courseHandicap: 17, holesCompleted: 18, verified: true }]);
  assert.equal(result.status, 'pending');
  assert.equal(result.winnerId, null);
});
