import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLeaguePoints, canVerifyRound, canViewLeague, canViewPlayerData, pageWindow, rankWithTies, stablefordForHole } from '../src/lib/network.ts';

test('a round cannot become verified without a verification event', () => {
  assert.equal(canVerifyRound('submitted', []), false);
  assert.equal(canVerifyRound('submitted', [{ id: '1', roundId: 'r', type: 'course_confirmation', actorId: 'operator', createdAt: 'now' }]), true);
  assert.equal(canVerifyRound('in_progress', [{ id: '1', roundId: 'r', type: 'course_confirmation', actorId: 'operator', createdAt: 'now' }]), false);
});

test('league calculations and ties are deterministic', () => {
  assert.equal(stablefordForHole(4, 4), 2);
  assert.equal(calculateLeaguePoints('stableford', [{ hole: 1, strokes: 4, tapVerified: false, witnessConfirmed: false }], new Map([[1, 4]])), 2);
  assert.deepEqual(rankWithTies([{ points: 10 }, { points: 10 }, { points: 8 }]), [1, 1, 3]);
});

test('pagination is bounded and private leagues require enrollment', () => {
  assert.deepEqual(pageWindow(2, 200), { page: 2, pageSize: 100, offset: 100 });
  assert.equal(canViewLeague('private', 'sg-1', ['sg-1']), true);
  assert.equal(canViewLeague('private', 'sg-2', ['sg-1']), false);
  assert.equal(canViewLeague('public', undefined, []), true);
});

test('player data requires the matching requester identity', () => {
  assert.equal(canViewPlayerData('sg-1', 'sg-1'), true);
  assert.equal(canViewPlayerData('sg-2', 'sg-1'), false);
  assert.equal(canViewPlayerData(undefined, 'sg-1'), false);
});
