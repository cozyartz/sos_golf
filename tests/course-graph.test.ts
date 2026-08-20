import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseGraph, resolveCourseGraphContext } from '../src/lib/course-graph.ts';
import { cedarRidge, demoRound } from '../src/lib/golf.ts';

test('course graph preserves canonical course, tee, and hole context', () => {
  const graph = buildCourseGraph(cedarRidge);
  assert.equal(graph.courseId, 'cedar-ridge');
  assert.equal(graph.nodes.filter((node) => node.kind === 'tee_set').length, cedarRidge.teeSets.length);
  assert.equal(graph.nodes.filter((node) => node.kind === 'hole').length, cedarRidge.holes.length);
  assert.ok(graph.edges.every((edge) => edge.source.sourceRef.startsWith('course:cedar-ridge')));
  assert.equal(graph.nodes.find((node) => node.id === 'hole:cedar-ridge:7')?.metadata.par, 3);
});

test('context resolution returns only supplied interaction context', () => {
  const graph = buildCourseGraph(cedarRidge);
  const context = resolveCourseGraphContext(graph, { holeNumber: 7, teeSetId: 'blue', round: demoRound });
  assert.equal(context.course.id, 'course:cedar-ridge');
  assert.equal(context.hole?.id, 'hole:cedar-ridge:7');
  assert.equal(context.teeSet?.id, 'tee-set:cedar-ridge:blue');
  assert.equal(context.round?.id, demoRound.id);
  assert.equal(context.nodes.length, 3);
});

test('unknown graph references do not create invented nodes', () => {
  const context = resolveCourseGraphContext(buildCourseGraph(cedarRidge), { holeNumber: 19, teeSetId: 'gold' });
  assert.equal(context.hole, undefined);
  assert.equal(context.teeSet, undefined);
  assert.equal(context.nodes.length, 1);
});
