import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createSquareGrid,
  createTokenFootprint,
  measureFootprintDistance,
  type DiagonalRule,
  type SquareGrid,
  type TokenFootprint,
} from "./grid_geometry.ts";

const diagonalRules: readonly DiagonalRule[] = ["foure", "pythagorean", "threefive", "manhattan"];

function gridWith(diagonalRule: DiagonalRule): SquareGrid {
  const creation = createSquareGrid({ gridType: "square", diagonalRule, scaleNumber: 5, snappingIncrement: 1 });
  if (creation.outcome === "refused") {
    throw new Error(`Invalid grid fixture: ${creation.reason}`);
  }
  return creation.grid;
}

function footprintAt(leftUnits: number, topUnits: number, widthUnits = 1, heightUnits = 1): TokenFootprint {
  const creation = createTokenFootprint({ leftUnits, topUnits, widthUnits, heightUnits }, gridWith("foure"));
  if (creation.outcome === "refused") {
    throw new Error(`Invalid footprint fixture: ${creation.reason}`);
  }
  return creation.footprint;
}

describe("createSquareGrid", () => {
  const validFields = { gridType: "square", diagonalRule: "foure", scaleNumber: 5, snappingIncrement: 1 };

  it("accepts the default Roll20 page", () => {
    expect(createSquareGrid(validFields).outcome).toBe("created");
  });

  it.each(["hex", "hexr", "dimetric", "isometric", ""])("refuses grid type %s under FD21", (gridType) => {
    expect(createSquareGrid({ ...validFields, gridType })).toEqual({
      outcome: "refused",
      reason: "grid is not square",
      refusedValue: gridType,
    });
  });

  it("refuses an unknown diagonal rule rather than guessing one", () => {
    expect(createSquareGrid({ ...validFields, diagonalRule: "euclidean" })).toEqual({
      outcome: "refused",
      reason: "unknown diagonal rule",
      refusedValue: "euclidean",
    });
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a scale of %s", (scaleNumber) => {
    expect(createSquareGrid({ ...validFields, scaleNumber }).outcome).toBe("refused");
  });

  it.each([0, -1, Number.NaN])("refuses a snapping increment of %s", (snappingIncrement) => {
    expect(createSquareGrid({ ...validFields, snappingIncrement }).outcome).toBe("refused");
  });
});

describe("createTokenFootprint", () => {
  it("covers one cell for a one unit token", () => {
    expect(footprintAt(3, 4)).toEqual({ firstColumn: 3, lastColumn: 3, firstRow: 4, lastRow: 4 });
  });

  it("covers two cells each way for a large token", () => {
    expect(footprintAt(3, 4, 2, 2)).toEqual({ firstColumn: 3, lastColumn: 4, firstRow: 4, lastRow: 5 });
  });

  it("covers every cell a token off the grid touches", () => {
    expect(footprintAt(3.5, 4, 1, 1)).toEqual({ firstColumn: 3, lastColumn: 4, firstRow: 4, lastRow: 4 });
  });

  it("gives a small token one cell", () => {
    expect(footprintAt(3, 4, 0.5, 0.5)).toEqual({ firstColumn: 3, lastColumn: 3, firstRow: 4, lastRow: 4 });
  });

  it.each([
    { leftUnits: Number.NaN, topUnits: 0, widthUnits: 1, heightUnits: 1 },
    { leftUnits: 0, topUnits: Number.POSITIVE_INFINITY, widthUnits: 1, heightUnits: 1 },
    { leftUnits: 0, topUnits: 0, widthUnits: 0, heightUnits: 1 },
    { leftUnits: 0, topUnits: 0, widthUnits: 1, heightUnits: -1 },
  ])("refuses an impossible token $leftUnits, $topUnits, $widthUnits by $heightUnits", (bounds) => {
    expect(createTokenFootprint(bounds, gridWith("foure"))).toEqual({
      outcome: "refused",
      reason: "token bounds are not usable",
    });
  });

  it("measures cells by the snapping increment when a grid cell is larger than a unit", () => {
    const creation = createSquareGrid({
      gridType: "square",
      diagonalRule: "foure",
      scaleNumber: 5,
      snappingIncrement: 2,
    });
    if (creation.outcome === "refused") {
      throw new Error("Expected the grid to be created");
    }
    const footprint = createTokenFootprint({ leftUnits: 4, topUnits: 2, widthUnits: 2, heightUnits: 2 }, creation.grid);
    expect(footprint).toMatchObject({
      footprint: { firstColumn: 2, lastColumn: 2, firstRow: 1, lastRow: 1 },
    });
  });
});

describe("measureFootprintDistance", () => {
  // Distances in feet at 5 ft to a cell. Moves are in cells across, cells down.
  it.each([
    { across: 1, down: 0, foure: 5, pythagorean: 5, threefive: 5, manhattan: 5 },
    { across: 6, down: 0, foure: 30, pythagorean: 30, threefive: 30, manhattan: 30 },
    { across: 1, down: 1, foure: 5, pythagorean: 5 * Math.SQRT2, threefive: 5, manhattan: 10 },
    { across: 2, down: 2, foure: 10, pythagorean: 10 * Math.SQRT2, threefive: 15, manhattan: 20 },
    { across: 3, down: 3, foure: 15, pythagorean: 15 * Math.SQRT2, threefive: 20, manhattan: 30 },
    { across: 4, down: 4, foure: 20, pythagorean: 20 * Math.SQRT2, threefive: 30, manhattan: 40 },
    { across: 3, down: 1, foure: 15, pythagorean: 5 * Math.sqrt(10), threefive: 15, manhattan: 20 },
    { across: 5, down: 2, foure: 25, pythagorean: 5 * Math.sqrt(29), threefive: 30, manhattan: 35 },
  ])("measures $across across and $down down", ({ across, down, ...expectedByRule }) => {
    for (const diagonalRule of diagonalRules) {
      const distance = measureFootprintDistance(footprintAt(0, 0), footprintAt(across, down), gridWith(diagonalRule));
      expect(distance).toBeCloseTo(expectedByRule[diagonalRule], 10);
    }
  });

  it("is zero for overlapping tokens", () => {
    expect(measureFootprintDistance(footprintAt(2, 2, 2, 2), footprintAt(3, 3), gridWith("foure"))).toBe(0);
  });

  it("measures from the nearest cells of a larger token, so a large target is reached sooner", () => {
    const largeToken = footprintAt(0, 0, 2, 2);
    expect(measureFootprintDistance(largeToken, footprintAt(2, 0), gridWith("foure"))).toBe(5);
    expect(measureFootprintDistance(footprintAt(4, 0), largeToken, gridWith("manhattan"))).toBe(15);
  });

  it("measures between two large tokens on a diagonal under every rule", () => {
    const firstToken = footprintAt(0, 0, 2, 2);
    const secondToken = footprintAt(3, 3, 3, 3);
    expect(measureFootprintDistance(firstToken, secondToken, gridWith("foure"))).toBe(10);
    expect(measureFootprintDistance(firstToken, secondToken, gridWith("threefive"))).toBe(15);
    expect(measureFootprintDistance(firstToken, secondToken, gridWith("manhattan"))).toBe(20);
    expect(measureFootprintDistance(firstToken, secondToken, gridWith("pythagorean"))).toBeCloseTo(10 * Math.SQRT2, 10);
  });

  it("converts by the page's scale", () => {
    const creation = createSquareGrid({
      gridType: "square",
      diagonalRule: "foure",
      scaleNumber: 1.5,
      snappingIncrement: 1,
    });
    if (creation.outcome === "refused") {
      throw new Error("Expected the grid to be created");
    }
    expect(measureFootprintDistance(footprintAt(0, 0), footprintAt(4, 0), creation.grid)).toBe(6);
  });

  it("counts a cell as the snapping increment, when a cell is larger than a unit", () => {
    const creation = createSquareGrid({
      gridType: "square",
      diagonalRule: "foure",
      scaleNumber: 5,
      snappingIncrement: 2,
    });
    if (creation.outcome === "refused") {
      throw new Error("Expected the grid to be created");
    }
    expect(measureFootprintDistance(footprintAt(0, 0), footprintAt(3, 0), creation.grid)).toBe(30);
  });

  describe("properties", () => {
    const footprintArbitrary = fc
      .record({
        leftUnits: fc.integer({ min: 0, max: 100 }),
        topUnits: fc.integer({ min: 0, max: 100 }),
        widthUnits: fc.integer({ min: 1, max: 4 }),
        heightUnits: fc.integer({ min: 1, max: 4 }),
      })
      .map(({ leftUnits, topUnits, widthUnits, heightUnits }) => {
        return footprintAt(leftUnits, topUnits, widthUnits, heightUnits);
      });

    it("is symmetric under every diagonal rule", () => {
      fc.assert(
        fc.property(
          footprintArbitrary,
          footprintArbitrary,
          fc.constantFrom(...diagonalRules),
          (firstFootprint, secondFootprint, diagonalRule) => {
            const grid = gridWith(diagonalRule);
            const forwards = measureFootprintDistance(firstFootprint, secondFootprint, grid);
            expect(measureFootprintDistance(secondFootprint, firstFootprint, grid)).toBe(forwards);
          },
        ),
      );
    });

    it("orders the rules: foure, then pythagorean or threefive, then manhattan", () => {
      fc.assert(
        fc.property(footprintArbitrary, footprintArbitrary, (firstFootprint, secondFootprint) => {
          const distanceBy = (diagonalRule: DiagonalRule): number => {
            return measureFootprintDistance(firstFootprint, secondFootprint, gridWith(diagonalRule));
          };
          expect(distanceBy("foure")).toBeLessThanOrEqual(distanceBy("pythagorean"));
          expect(distanceBy("foure")).toBeLessThanOrEqual(distanceBy("threefive"));
          expect(distanceBy("pythagorean")).toBeLessThanOrEqual(distanceBy("manhattan"));
          expect(distanceBy("threefive")).toBeLessThanOrEqual(distanceBy("manhattan"));
        }),
      );
    });

    it("is never negative", () => {
      fc.assert(
        fc.property(footprintArbitrary, footprintArbitrary, (firstFootprint, secondFootprint) => {
          expect(measureFootprintDistance(firstFootprint, secondFootprint, gridWith("foure"))).toBeGreaterThanOrEqual(
            0,
          );
        }),
      );
    });
  });
});
