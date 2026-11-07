export type DiagonalRule = "foure" | "pythagorean" | "threefive" | "manhattan";

export interface SquareGrid {
  readonly diagonalRule: DiagonalRule;
  readonly scaleNumber: number;
  readonly snappingIncrement: number;
}

export interface GridFields {
  readonly gridType: string;
  readonly diagonalRule: string;
  readonly scaleNumber: number;
  readonly snappingIncrement: number;
}

export type GridCreation =
  | { readonly outcome: "created"; readonly grid: SquareGrid }
  | {
      readonly outcome: "refused";
      readonly reason: "grid is not square" | "unknown diagonal rule" | "grid size is not usable";
      readonly refusedValue: string | number;
    };

export interface TokenBounds {
  readonly leftUnits: number;
  readonly topUnits: number;
  readonly widthUnits: number;
  readonly heightUnits: number;
}

export interface TokenFootprint {
  readonly firstColumn: number;
  readonly lastColumn: number;
  readonly firstRow: number;
  readonly lastRow: number;
}

export type TokenFootprintCreation =
  | { readonly outcome: "created"; readonly footprint: TokenFootprint }
  | { readonly outcome: "refused"; readonly reason: "token bounds are not usable" };

// One table, so a rule cannot be accepted by the grid and missed by the measurement.
const cellsTravelledByDiagonalRule: Readonly<Record<DiagonalRule, (across: number, down: number) => number>> = {
  foure: (across, down) => Math.max(across, down),
  pythagorean: (across, down) => Math.hypot(across, down),
  // Every second diagonal step costs two cells, so the total rounds down from one and a half.
  threefive: (across, down) => {
    const diagonalSteps = Math.min(across, down);
    const straightSteps = Math.abs(across - down);
    return straightSteps + Math.floor(diagonalSteps * 1.5);
  },
  manhattan: (across, down) => across + down,
};

function isDiagonalRule(candidate: string): candidate is DiagonalRule {
  return Object.hasOwn(cellsTravelledByDiagonalRule, candidate);
}

function isPositiveFinite(candidate: number): boolean {
  return Number.isFinite(candidate) && candidate > 0;
}

export function createSquareGrid(fields: GridFields): GridCreation {
  if (fields.gridType !== "square") {
    return { outcome: "refused", reason: "grid is not square", refusedValue: fields.gridType };
  }
  if (!isDiagonalRule(fields.diagonalRule)) {
    return { outcome: "refused", reason: "unknown diagonal rule", refusedValue: fields.diagonalRule };
  }
  for (const gridSize of [fields.scaleNumber, fields.snappingIncrement]) {
    if (!isPositiveFinite(gridSize)) {
      return { outcome: "refused", reason: "grid size is not usable", refusedValue: gridSize };
    }
  }
  const { diagonalRule, scaleNumber, snappingIncrement } = fields;
  return { outcome: "created", grid: { diagonalRule, scaleNumber, snappingIncrement } };
}

// A token occupies every cell it touches, so one placed off the grid stands in both cells. That
// favours reach slightly, which suits a rule asking whether an ally can reach at all.
export function createTokenFootprint(tokenBounds: TokenBounds, grid: SquareGrid): TokenFootprintCreation {
  const { leftUnits, topUnits, widthUnits, heightUnits } = tokenBounds;
  const hasUsableBounds =
    Number.isFinite(leftUnits) &&
    Number.isFinite(topUnits) &&
    isPositiveFinite(widthUnits) &&
    isPositiveFinite(heightUnits);
  if (!hasUsableBounds) {
    return { outcome: "refused", reason: "token bounds are not usable" };
  }
  const { snappingIncrement } = grid;
  return {
    outcome: "created",
    footprint: {
      firstColumn: Math.floor(leftUnits / snappingIncrement),
      lastColumn: Math.ceil((leftUnits + widthUnits) / snappingIncrement) - 1,
      firstRow: Math.floor(topUnits / snappingIncrement),
      lastRow: Math.ceil((topUnits + heightUnits) / snappingIncrement) - 1,
    },
  };
}

function cellsBetween(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  return Math.max(0, secondStart - firstEnd, firstStart - secondEnd);
}

// Counted in cells so the answer is the same under every diagonal rule. A distance cannot give
// this, as an adjacent diagonal measures 7.07 ft under pythagorean and 10 ft under manhattan.
export function areFootprintsAdjacent(firstFootprint: TokenFootprint, secondFootprint: TokenFootprint): boolean {
  const across = cellsBetween(
    firstFootprint.firstColumn,
    firstFootprint.lastColumn,
    secondFootprint.firstColumn,
    secondFootprint.lastColumn,
  );
  const down = cellsBetween(
    firstFootprint.firstRow,
    firstFootprint.lastRow,
    secondFootprint.firstRow,
    secondFootprint.lastRow,
  );
  return across <= 1 && down <= 1;
}

// Measured between the nearest occupied cells, which is why a large target is reached sooner.
export function measureFootprintDistance(
  firstFootprint: TokenFootprint,
  secondFootprint: TokenFootprint,
  grid: SquareGrid,
): number {
  const across = cellsBetween(
    firstFootprint.firstColumn,
    firstFootprint.lastColumn,
    secondFootprint.firstColumn,
    secondFootprint.lastColumn,
  );
  const down = cellsBetween(
    firstFootprint.firstRow,
    firstFootprint.lastRow,
    secondFootprint.firstRow,
    secondFootprint.lastRow,
  );
  const cellsTravelled = cellsTravelledByDiagonalRule[grid.diagonalRule](across, down);
  return cellsTravelled * grid.snappingIncrement * grid.scaleNumber;
}
