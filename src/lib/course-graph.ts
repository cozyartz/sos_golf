import type { Course, GolfRound, Hole, TeeSet } from './golf';

/**
 * The Course Graph is the shared context layer for physical and digital golf
 * experiences. A node is useful only when its source and verification state
 * remain visible to the caller.
 */
export type CourseGraphNodeKind =
  | 'course'
  | 'tee_set'
  | 'hole'
  | 'tee_location'
  | 'green'
  | 'hazard'
  | 'amenity'
  | 'service'
  | 'event'
  | 'offer'
  | 'sticklink';

export type CourseGraphRelation =
  | 'contains'
  | 'located_at'
  | 'serves'
  | 'supports'
  | 'available_at'
  | 'part_of';

export type CourseGraphSource = {
  sourceRef: string;
  verified: boolean;
  observedAt?: string;
};

export type CourseGraphNode = CourseGraphSource & {
  id: string;
  courseId: string;
  kind: CourseGraphNodeKind;
  label: string;
  holeNumber?: number;
  metadata: Record<string, string | number | boolean>;
};

export type CourseGraphEdge = {
  from: string;
  to: string;
  relation: CourseGraphRelation;
  source: CourseGraphSource;
};

export type CourseGraph = {
  courseId: string;
  nodes: CourseGraphNode[];
  edges: CourseGraphEdge[];
};

export type CourseGraphContext = {
  course: CourseGraphNode;
  hole?: CourseGraphNode;
  teeSet?: CourseGraphNode;
  round?: Pick<GolfRound, 'id' | 'status' | 'format'>;
  nodes: CourseGraphNode[];
};

const courseSource = (course: Course): CourseGraphSource => ({
  sourceRef: `course:${course.id}`,
  verified: false,
});

const holeSource = (course: Course, hole: Hole): CourseGraphSource => ({
  sourceRef: `course:${course.id}:hole:${hole.number}`,
  verified: false,
});

const teeSetSource = (course: Course, teeSet: TeeSet): CourseGraphSource => ({
  sourceRef: `course:${course.id}:tee-set:${teeSet.id}`,
  verified: false,
});

function node(
  source: CourseGraphSource,
  values: Omit<CourseGraphNode, keyof CourseGraphSource>,
): CourseGraphNode {
  return { ...source, ...values };
}

function edge(
  source: CourseGraphSource,
  from: string,
  to: string,
  relation: CourseGraphRelation,
): CourseGraphEdge {
  return { from, to, relation, source };
}

/** Build the canonical graph nodes that can be derived from an approved course record. */
export function buildCourseGraph(course: Course): CourseGraph {
  const source = courseSource(course);
  const courseNode = node(source, {
    id: `course:${course.id}`,
    courseId: course.id,
    kind: 'course',
    label: course.name,
    metadata: { region: course.region, address: course.address },
  });

  const teeNodes = course.teeSets.map((teeSet) => {
    const teeSource = teeSetSource(course, teeSet);
    return node(teeSource, {
      id: `tee-set:${course.id}:${teeSet.id}`,
      courseId: course.id,
      kind: 'tee_set',
      label: teeSet.name,
      metadata: { color: teeSet.color, rating: teeSet.rating, slope: teeSet.slope, yardage: teeSet.yardage },
    });
  });

  const holeNodes = course.holes.map((hole) => {
    const holeSourceValue = holeSource(course, hole);
    return node(holeSourceValue, {
      id: `hole:${course.id}:${hole.number}`,
      courseId: course.id,
      kind: 'hole',
      label: hole.name,
      holeNumber: hole.number,
      metadata: { par: hole.par, handicapIndex: hole.handicapIndex, yards: hole.yards, ...(hole.challenge ? { challenge: hole.challenge } : {}) },
    });
  });

  const edges = [
    ...teeNodes.map((tee) => edge(source, courseNode.id, tee.id, 'contains')),
    ...holeNodes.map((hole) => edge(source, courseNode.id, hole.id, 'contains')),
  ];

  return { courseId: course.id, nodes: [courseNode, ...teeNodes, ...holeNodes], edges };
}

/** Resolve the context available for a golfer interaction without adding facts that were not supplied. */
export function resolveCourseGraphContext(
  graph: CourseGraph,
  input: { holeNumber?: number; teeSetId?: string; round?: Pick<GolfRound, 'id' | 'status' | 'format'> },
): CourseGraphContext {
  const course = graph.nodes.find((item) => item.kind === 'course');
  if (!course) throw new Error(`Course graph ${graph.courseId} has no course node`);

  const hole = input.holeNumber === undefined
    ? undefined
    : graph.nodes.find((item) => item.kind === 'hole' && item.holeNumber === input.holeNumber);
  const teeSet = input.teeSetId === undefined
    ? undefined
    : graph.nodes.find((item) => item.kind === 'tee_set' && item.id === `tee-set:${graph.courseId}:${input.teeSetId}`);

  return {
    course,
    ...(hole ? { hole } : {}),
    ...(teeSet ? { teeSet } : {}),
    ...(input.round ? { round: input.round } : {}),
    nodes: [course, ...(hole ? [hole] : []), ...(teeSet ? [teeSet] : [])],
  };
}
