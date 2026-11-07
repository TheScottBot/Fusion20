import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hasLineOfSight, type PagePoint, type SightBarrier } from "./line_of_sight.ts";

const verticalSegment = { start: { x: 210, y: 70 }, end: { x: 210, y: 350 } };
const viewerOnLeft: PagePoint = { x: 140, y: 210 };
const targetOnRight: PagePoint = { x: 420, y: 210 };

describe("hasLineOfSight, in the rooms observed in Roll20 on 7 November 2026", () => {
  const observedRooms: readonly (readonly [string, SightBarrier, boolean])[] = [
    ["Control wall", { kind: "wall", ...verticalSegment }, false],
    ["Transparent", { kind: "transparent", ...verticalSegment }, true],
    ["One way", { kind: "one way", isReversed: false, ...verticalSegment }, true],
    ["One way reversed", { kind: "one way", isReversed: true, ...verticalSegment }, false],
    ["Door closed", { kind: "door", isOpen: false, ...verticalSegment }, false],
    ["Door open", { kind: "door", isOpen: true, ...verticalSegment }, true],
    ["Window closed", { kind: "window", ...verticalSegment }, true],
  ];

  it.each(observedRooms)("matches room %s", (_roomName, barrier, expected) => {
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [barrier])).toBe(expected);
  });
});

describe("hasLineOfSight", () => {
  it("sees with no barriers at all", () => {
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [])).toBe(true);
  });

  it("is blocked if any one barrier of many blocks", () => {
    const barriers: SightBarrier[] = [
      { kind: "transparent", ...verticalSegment },
      { kind: "wall", start: { x: 300, y: 70 }, end: { x: 300, y: 350 } },
    ];
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, barriers)).toBe(false);
  });

  it("is not blocked by a wall beside the line", () => {
    const wall: SightBarrier = { kind: "wall", start: { x: 210, y: 300 }, end: { x: 210, y: 350 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [wall])).toBe(true);
  });

  it("is not blocked by a wall beyond the target", () => {
    const wall: SightBarrier = { kind: "wall", start: { x: 500, y: 70 }, end: { x: 500, y: 350 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [wall])).toBe(true);
  });

  it("is blocked by a line grazing a wall's end point, so sight cannot leak through a joined corner", () => {
    const firstWall: SightBarrier = { kind: "wall", start: { x: 210, y: 70 }, end: { x: 210, y: 210 } };
    const secondWall: SightBarrier = { kind: "wall", start: { x: 210, y: 210 }, end: { x: 300, y: 300 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [firstWall])).toBe(false);
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [firstWall, secondWall])).toBe(false);
  });

  it("is blocked along a wall lying on the line itself", () => {
    const wall: SightBarrier = { kind: "wall", start: { x: 200, y: 210 }, end: { x: 300, y: 210 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [wall])).toBe(false);
  });

  it("ignores a wall of no length", () => {
    const wall: SightBarrier = { kind: "wall", start: { x: 210, y: 150 }, end: { x: 210, y: 150 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [wall])).toBe(true);
  });

  it("sees a target at the viewer's own point", () => {
    expect(hasLineOfSight(viewerOnLeft, viewerOnLeft, [{ kind: "wall", ...verticalSegment }])).toBe(true);
  });

  it.each([
    ["starting on the line and running past the target", { x: 300, y: 210 }, { x: 500, y: 210 }],
    ["starting behind the viewer and ending on the line", { x: 50, y: 210 }, { x: 200, y: 210 }],
    ["covering the whole line", { x: 50, y: 210 }, { x: 500, y: 210 }],
  ])("is blocked by a wall in line with the sight, %s", (_description, start, end) => {
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [{ kind: "wall", start, end }])).toBe(false);
  });

  it("is not blocked by a wall in line with the sight but clear of it", () => {
    const wall: SightBarrier = { kind: "wall", start: { x: 500, y: 210 }, end: { x: 600, y: 210 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [wall])).toBe(true);
  });

  it("ignores a wall of no length even when it sits on the line", () => {
    const wall: SightBarrier = { kind: "wall", start: { x: 210, y: 210 }, end: { x: 210, y: 210 } };
    expect(hasLineOfSight(viewerOnLeft, targetOnRight, [wall])).toBe(true);
  });

  it("sees a target at the viewer's own point even when a wall runs through it", () => {
    const pointOnWall = { x: 210, y: 210 };
    expect(hasLineOfSight(pointOnWall, pointOnWall, [{ kind: "wall", ...verticalSegment }])).toBe(true);
  });

  describe("a one way wall", () => {
    const oneWay: SightBarrier = { kind: "one way", isReversed: false, ...verticalSegment };

    it("lets sight through from one side only", () => {
      expect(hasLineOfSight(viewerOnLeft, targetOnRight, [oneWay])).toBe(true);
      expect(hasLineOfSight(targetOnRight, viewerOnLeft, [oneWay])).toBe(false);
    });

    it("swaps sides when reversed", () => {
      const reversed: SightBarrier = { kind: "one way", isReversed: true, ...verticalSegment };
      expect(hasLineOfSight(viewerOnLeft, targetOnRight, [reversed])).toBe(false);
      expect(hasLineOfSight(targetOnRight, viewerOnLeft, [reversed])).toBe(true);
    });

    it("swaps sides when the same wall is drawn the other way round", () => {
      const redrawn: SightBarrier = {
        kind: "one way",
        isReversed: false,
        start: verticalSegment.end,
        end: verticalSegment.start,
      };
      expect(hasLineOfSight(viewerOnLeft, targetOnRight, [redrawn])).toBe(false);
    });

    it("blocks a viewer standing exactly on the wall's line", () => {
      const viewerOnWall = { x: 210, y: 210 };
      expect(hasLineOfSight(viewerOnWall, targetOnRight, [oneWay])).toBe(false);
    });
  });

  describe("properties", () => {
    const coordinate = fc.integer({ min: 0, max: 1750 });
    const point = fc.record({ x: coordinate, y: coordinate });
    const twoWayBarrier = fc.oneof(
      fc.record({ kind: fc.constant("wall" as const), start: point, end: point }),
      fc.record({ kind: fc.constant("transparent" as const), start: point, end: point }),
      fc.record({ kind: fc.constant("window" as const), start: point, end: point }),
      fc.record({ kind: fc.constant("door" as const), isOpen: fc.boolean(), start: point, end: point }),
    );

    it("is symmetric for two way barriers", () => {
      fc.assert(
        fc.property(point, point, fc.array(twoWayBarrier, { maxLength: 8 }), (firstPoint, secondPoint, barriers) => {
          const forwards = hasLineOfSight(firstPoint, secondPoint, barriers);
          expect(hasLineOfSight(secondPoint, firstPoint, barriers)).toBe(forwards);
        }),
      );
    });

    it("never gains sight by adding a barrier", () => {
      fc.assert(
        fc.property(
          point,
          point,
          fc.array(twoWayBarrier, { maxLength: 6 }),
          twoWayBarrier,
          (viewer, target, barriers, added) => {
            if (!hasLineOfSight(viewer, target, barriers)) {
              expect(hasLineOfSight(viewer, target, [...barriers, added])).toBe(false);
            }
          },
        ),
      );
    });

    it("always sees through barriers that do not block, wherever they are", () => {
      fc.assert(
        fc.property(point, point, point, point, (viewer, target, start, end) => {
          expect(
            hasLineOfSight(viewer, target, [
              { kind: "transparent", start, end },
              { kind: "window", start, end },
            ]),
          ).toBe(true);
        }),
      );
    });
  });
});
