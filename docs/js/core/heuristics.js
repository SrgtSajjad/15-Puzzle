import { GOAL_TILES, GRID_SIZE } from "./puzzle.js";

const GOAL_POS = new Map();
for (let idx = 0; idx < GOAL_TILES.length; idx++) {
  const tile = GOAL_TILES[idx];
  if (tile !== 0) {
    GOAL_POS.set(tile, [Math.floor(idx / GRID_SIZE), idx % GRID_SIZE]);
  }
}

export function misplacedTiles(state) {
  let count = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t !== 0 && t !== GOAL_TILES[i]) count++;
  }
  return count;
}

export function manhattanDistance(state) {
  let total = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t === 0) continue;
    const r = Math.floor(i / GRID_SIZE);
    const c = i % GRID_SIZE;
    const [gr, gc] = GOAL_POS.get(t);
    total += Math.abs(r - gr) + Math.abs(c - gc);
  }
  return total;
}

function countLineConflicts(lineGoalPositions) {
  let conflicts = 0;
  for (let i = 0; i < lineGoalPositions.length; i++) {
    const gi = lineGoalPositions[i];
    for (let j = i + 1; j < lineGoalPositions.length; j++) {
      if (gi > lineGoalPositions[j]) conflicts++;
    }
  }
  return conflicts;
}

export function linearConflictCount(state) {
  const tiles = state.tiles;
  let conflicts = 0;

  for (let row = 0; row < GRID_SIZE; row++) {
    const inGoalRow = [];
    const base = row * GRID_SIZE;
    for (let col = 0; col < GRID_SIZE; col++) {
      const tile = tiles[base + col];
      if (tile !== 0) {
        const [gr, gc] = GOAL_POS.get(tile);
        if (gr === row) inGoalRow.push(gc);
      }
    }
    conflicts += countLineConflicts(inGoalRow);
  }

  for (let col = 0; col < GRID_SIZE; col++) {
    const inGoalCol = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      const tile = tiles[row * GRID_SIZE + col];
      if (tile !== 0) {
        const [gr, gc] = GOAL_POS.get(tile);
        if (gc === col) inGoalCol.push(gr);
      }
    }
    conflicts += countLineConflicts(inGoalCol);
  }

  return conflicts;
}

export function manhattanLinearConflict(state) {
  return manhattanDistance(state) + 2 * linearConflictCount(state);
}

export function conflictCount(state) {
  return misplacedTiles(state) + 2 * linearConflictCount(state);
}

export const HEURISTIC_REGISTRY = Object.freeze({
  misplaced: misplacedTiles,
  manhattan: manhattanDistance,
  linear_conflict: manhattanLinearConflict,
});

export function getHeuristic(name) {
  const key = String(name || "linear_conflict").toLowerCase();
  const fn = HEURISTIC_REGISTRY[key];
  if (!fn) {
    throw new Error(`Unknown heuristic: ${name}`);
  }
  return fn;
}

/**
 * Per-tile diagnostic metadata for UI overlays (Manhattan distance and linear conflict flag).
 */
export function getTileDiagnostics(state) {
  const tiles = state.tiles;
  const conflictSet = new Set();

  for (let row = 0; row < GRID_SIZE; row++) {
    const rowItems = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const tile = tiles[row * GRID_SIZE + col];
      if (tile !== 0) {
        const [gr, gc] = GOAL_POS.get(tile);
        if (gr === row) rowItems.push({ tile, gc });
      }
    }
    for (let i = 0; i < rowItems.length; i++) {
      for (let j = i + 1; j < rowItems.length; j++) {
        if (rowItems[i].gc > rowItems[j].gc) {
          conflictSet.add(rowItems[i].tile);
          conflictSet.add(rowItems[j].tile);
        }
      }
    }
  }

  for (let col = 0; col < GRID_SIZE; col++) {
    const colItems = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      const tile = tiles[row * GRID_SIZE + col];
      if (tile !== 0) {
        const [gr, gc] = GOAL_POS.get(tile);
        if (gc === col) colItems.push({ tile, gr });
      }
    }
    for (let i = 0; i < colItems.length; i++) {
      for (let j = i + 1; j < colItems.length; j++) {
        if (colItems[i].gr > colItems[j].gr) {
          conflictSet.add(colItems[i].tile);
          conflictSet.add(colItems[j].tile);
        }
      }
    }
  }

  return tiles.map((tile, idx) => {
    if (tile === 0) {
      return { tile: 0, manhattan: 0, isCorrect: false, inConflict: false };
    }
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    const [gr, gc] = GOAL_POS.get(tile);
    const manhattan = Math.abs(r - gr) + Math.abs(c - gc);
    return {
      tile,
      manhattan,
      isCorrect: manhattan === 0,
      inConflict: conflictSet.has(tile),
    };
  });
}

export class FitnessConfig {
  constructor({
    largeConstant = 10000,
    baseConstant = 5000,
    wDist = 15,
    wConflict = 10,
    wCost = 1,
    wInvalid = 5,
    heuristicName = "linear_conflict",
  } = {}) {
    this.largeConstant = Number(largeConstant);
    this.baseConstant = Number(baseConstant);
    this.wDist = Number(wDist);
    this.wConflict = Number(wConflict);
    this.wCost = Number(wCost);
    this.wInvalid = Number(wInvalid);
    this.heuristicName = heuristicName;
  }
}

export class Evaluator {
  constructor(environment, fitnessConfig = null) {
    this.env = environment;
    this.config = fitnessConfig || new FitnessConfig();
    this.distanceFn = getHeuristic(this.config.heuristicName);
  }

  evaluateState(state, heuristicName = null) {
    const fn = heuristicName ? getHeuristic(heuristicName) : this.distanceFn;
    const manh = manhattanDistance(state);
    const misp = misplacedTiles(state);
    const lin = linearConflictCount(state);
    return {
      distance: fn(state),
      manhattan: manh,
      misplaced: misp,
      linearConflicts: lin,
      manhattanLinearConflict: manh + 2 * lin,
      conflictCount: misp + 2 * lin,
    };
  }

  evaluateSequence(initialState, sequence, recordTrajectory = false) {
    return this.env.evaluateSequence(
      initialState,
      sequence,
      this.distanceFn,
      misplacedTiles,
      linearConflictCount,
      recordTrajectory
    );
  }

  fitness(initialState, sequence, recordTrajectory = false) {
    const evaluation = this.evaluateSequence(initialState, sequence, recordTrajectory);
    const cfg = this.config;
    let score;
    if (evaluation.solved) {
      score = cfg.largeConstant - evaluation.pathCost;
    } else {
      const penalty =
        cfg.wDist * evaluation.distance +
        cfg.wConflict * evaluation.conflictCount +
        cfg.wCost * evaluation.pathCost +
        cfg.wInvalid * evaluation.invalidMoves;
      score = cfg.baseConstant - penalty;
    }
    return { fitness: score, evaluation };
  }
}
