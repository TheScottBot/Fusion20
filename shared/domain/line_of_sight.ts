// Page coordinates, with y growing downwards. Which side of a one way wall sees through depends
// on that, so an interpreter must flip the inverted y of doors and windows before reaching here.
export interface PagePoint {
  readonly x: number;
  readonly y: number;
}

interface BarrierSegment {
  readonly start: PagePoint;
  readonly end: PagePoint;
}

export type SightBarrier =
  | (BarrierSegment & { readonly kind: "wall" })
  | (BarrierSegment & { readonly kind: "transparent" })
  | (BarrierSegment & { readonly kind: "one way"; readonly isReversed: boolean })
  | (BarrierSegment & { readonly kind: "door"; readonly isOpen: boolean })
  | (BarrierSegment & { readonly kind: "window" });

function crossProduct(origin: PagePoint, firstPoint: PagePoint, secondPoint: PagePoint): number {
  const firstAcross = firstPoint.x - origin.x;
  const firstDown = firstPoint.y - origin.y;
  const secondAcross = secondPoint.x - origin.x;
  const secondDown = secondPoint.y - origin.y;
  return firstAcross * secondDown - firstDown * secondAcross;
}

function liesWithinBounds(segment: BarrierSegment, point: PagePoint): boolean {
  return (
    point.x >= Math.min(segment.start.x, segment.end.x) &&
    point.x <= Math.max(segment.start.x, segment.end.x) &&
    point.y >= Math.min(segment.start.y, segment.end.y) &&
    point.y <= Math.max(segment.start.y, segment.end.y)
  );
}

// Touching counts as crossing. Walls join at shared end points, so a line through such a corner
// touches two walls without properly crossing either, and sight must not leak through it.
function segmentsTouch(firstSegment: BarrierSegment, secondSegment: BarrierSegment): boolean {
  const sideOfSecondStart = Math.sign(crossProduct(firstSegment.start, firstSegment.end, secondSegment.start));
  const sideOfSecondEnd = Math.sign(crossProduct(firstSegment.start, firstSegment.end, secondSegment.end));
  const sideOfFirstStart = Math.sign(crossProduct(secondSegment.start, secondSegment.end, firstSegment.start));
  const sideOfFirstEnd = Math.sign(crossProduct(secondSegment.start, secondSegment.end, firstSegment.end));
  if (sideOfSecondStart !== sideOfSecondEnd && sideOfFirstStart !== sideOfFirstEnd) {
    return true;
  }
  return (
    (sideOfSecondStart === 0 && liesWithinBounds(firstSegment, secondSegment.start)) ||
    (sideOfSecondEnd === 0 && liesWithinBounds(firstSegment, secondSegment.end)) ||
    (sideOfFirstStart === 0 && liesWithinBounds(secondSegment, firstSegment.start)) ||
    (sideOfFirstEnd === 0 && liesWithinBounds(secondSegment, firstSegment.end))
  );
}

function isOneWayPassable(barrier: BarrierSegment & { readonly isReversed: boolean }, viewer: PagePoint): boolean {
  const viewerSide = crossProduct(barrier.start, barrier.end, viewer);
  return barrier.isReversed ? viewerSide < 0 : viewerSide > 0;
}

// Each answer here was observed in Roll20 on 7 November 2026, not read from a document. In
// particular a closed window does not block sight, which is why it carries no open state.
function blocksSightFrom(barrier: SightBarrier, viewer: PagePoint): boolean {
  switch (barrier.kind) {
    case "wall":
      return true;
    case "transparent":
    case "window":
      return false;
    case "door":
      return !barrier.isOpen;
    case "one way":
      return !isOneWayPassable(barrier, viewer);
  }
}

function hasLength(barrier: SightBarrier): boolean {
  return barrier.start.x !== barrier.end.x || barrier.start.y !== barrier.end.y;
}

export function hasLineOfSight(viewer: PagePoint, target: PagePoint, barriers: readonly SightBarrier[]): boolean {
  if (viewer.x === target.x && viewer.y === target.y) {
    return true;
  }
  const sightLine = { start: viewer, end: target };
  return !barriers.some((barrier) => {
    return hasLength(barrier) && blocksSightFrom(barrier, viewer) && segmentsTouch(sightLine, barrier);
  });
}
