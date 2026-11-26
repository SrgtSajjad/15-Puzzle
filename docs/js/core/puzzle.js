import { SeededRNG } from "./rng.js";

export const GRID_SIZE = 4;
export const NUM_CELLS = 16;
export const GOAL_TILES = Object.freeze([
  1, 2, 3, 4,
  5, 6, 7, 8,
  9, 10, 11, 12,
  13, 14, 15, 0,
]);

export const Action = Object.freeze({
  UP: "UP",
  DOWN: "DOWN",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
});

export const ALL_ACTIONS = Object.freeze([
  Action.UP,
  Action.DOWN,
  Action.LEFT,
  Action.RIGHT,
]);

const ACTION_DELTAS = Object.freeze({
  UP: [-1, 0],
  DOWN: [1, 0],
  LEFT: [0, -1],
  RIGHT: [0, 1],
});

const ACTION_INVERSES = Object.freeze({
  UP: Action.DOWN,
  DOWN: Action.UP,
  LEFT: Action.RIGHT,
  RIGHT: Action.LEFT,
});

export function actionDelta(action) {
  return ACTION_DELTAS[action];
}

export function actionInverse(action) {
  return ACTION_INVERSES[action];
}

export function actionShortCode(action) {
  return action[0];
}

export const DIFFICULTY_PRESETS = Object.freeze({
  easy: { label: "Easy (Depth 10)", depth: 10, seed: 101, tiles: null },
  medium: { label: "Medium (Depth 22)", depth: 22, seed: 202, tiles: null },
  hard: { label: "Hard (Depth 40)", depth: 40, seed: 303, tiles: null },
  classic: {
    label: "Classic Benchmark (Depth 20)",
    depth: 20,
    seed: 404,
    tiles: [
      5, 1, 2, 4,
      9, 6, 3, 8,
      13, 10, 7, 11,
      14, 15, 12, 0,
    ],
  },
});

export class PuzzleState {
  constructor(tiles, blankIndex = null) {
    this.tiles = Object.freeze(tiles.slice());
    this.blankIndex = blankIndex !== null ? blankIndex : this.tiles.indexOf(0);
    this.key = this.tiles.join(",");
  }

  static fromArray(values) {
    const arr = values.map((v) => Number(v));
    if (arr.length !== NUM_CELLS) {
      throw new Error(`Expected ${NUM_CELLS} tiles, got ${arr.length}`);
    }
    const seen = new Set(arr);
    if (seen.size !== NUM_CELLS) {
      throw new Error("Tiles must contain unique values 0..15.");
    }
    for (let v = 0; v < NUM_CELLS; v++) {
      if (!seen.has(v)) {
        throw new Error(`Missing tile value ${v}.`);
      }
    }
    return new PuzzleState(arr);
  }

  static goal() {
    return new PuzzleState(GOAL_TILES, NUM_CELLS - 1);
  }

  get blankRow() {
    return Math.floor(this.blankIndex / GRID_SIZE);
  }

  get blankCol() {
    return this.blankIndex % GRID_SIZE;
  }

  get blankRowFromBottom() {
    return GRID_SIZE - this.blankRow;
  }

  equals(other) {
    return other instanceof PuzzleState && this.key === other.key;
  }

  toMatrix() {
    const rows = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      rows.push(this.tiles.slice(r * GRID_SIZE, (r + 1) * GRID_SIZE));
    }
    return rows;
  }
}

export class Node {
  constructor(state, parent = null, action = null, pathCost = 0, depth = 0) {
    this.state = state;
    this.parent = parent;
    this.action = action;
    this.pathCost = pathCost;
    this.depth = depth;
  }

  reconstructActions() {
    const actions = [];
    let curr = this;
    while (curr !== null && curr.action !== null) {
      actions.push(curr.action);
      curr = curr.parent;
    }
    actions.reverse();
    return actions;
  }

  reconstructStates() {
    const states = [];
    let curr = this;
    while (curr !== null) {
      states.push(curr.state);
      curr = curr.parent;
    }
    states.reverse();
    return states;
  }
}

export function countInversions(tiles) {
  const nonZero = tiles.filter((t) => t !== 0);
  let inversions = 0;
  for (let i = 0; i < nonZero.length; i++) {
    const ti = nonZero[i];
    for (let j = i + 1; j < nonZero.length; j++) {
      if (ti > nonZero[j]) {
        inversions++;
      }
    }
  }
  return inversions;
}

export function isSolvableTiles(tiles) {
  const state = tiles instanceof PuzzleState ? tiles : PuzzleState.fromArray(tiles);
  const inversions = countInversions(state.tiles);
  const blankRowBottom = state.blankRowFromBottom;
  const solvable = (inversions + blankRowBottom) % 2 === 1;
  return { solvable, inversions, blankRowBottom };
}

export class PuzzleEnvironment {
  constructor(goalState = null) {
    this.goalState = goalState || PuzzleState.goal();
  }

  goalTest(state) {
    return state.key === this.goalState.key;
  }

  isSolvable(stateOrTiles) {
    const { solvable } = isSolvableTiles(stateOrTiles);
    return solvable;
  }

  isValidAction(state, action) {
    const [dr, dc] = actionDelta(action);
    const nr = state.blankRow + dr;
    const nc = state.blankCol + dc;
    return nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE;
  }

  validActions(state, excludeInverseOf = null) {
    const inv = excludeInverseOf ? actionInverse(excludeInverseOf) : null;
    const r = state.blankRow;
    const c = state.blankCol;
    const valid = [];
    for (const action of ALL_ACTIONS) {
      if (inv !== null && action === inv) continue;
      const [dr, dc] = actionDelta(action);
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
        valid.push(action);
      }
    }
    return valid;
  }

  result(state, action) {
    const [dr, dc] = actionDelta(action);
    const nr = state.blankRow + dr;
    const nc = state.blankCol + dc;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) {
      throw new Error(`Illegal action ${action} from blank index ${state.blankIndex}`);
    }
    const targetIdx = nr * GRID_SIZE + nc;
    const nextTiles = state.tiles.slice();
    nextTiles[state.blankIndex] = nextTiles[targetIdx];
    nextTiles[targetIdx] = 0;
    return new PuzzleState(nextTiles, targetIdx);
  }

  stepCost() {
    return 1;
  }

  pathCost(actions) {
    return actions.length;
  }

  expand(node, avoidBacktrack = true) {
    const last = avoidBacktrack ? node.action : null;
    const actions = this.validActions(node.state, last);
    const children = new Array(actions.length);
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      const nxt = this.result(node.state, act);
      children[i] = new Node(
        nxt,
        node,
        act,
        node.pathCost + this.stepCost(node.state, act, nxt),
        node.depth + 1
      );
    }
    return children;
  }

  generateScramble(depth = 20, seed = 42, rng = null, avoidBacktrack = true) {
    const generator = rng || new SeededRNG(seed);
    let state = this.goalState;
    let lastAction = null;
    const scrambleActions = [];
    for (let i = 0; i < depth; i++) {
      const choices = this.validActions(state, avoidBacktrack ? lastAction : null);
      const act = generator.choice(choices);
      state = this.result(state, act);
      scrambleActions.push(act);
      lastAction = act;
    }
    return { state, scrambleActions };
  }

  getPreset(name) {
    const key = String(name).toLowerCase();
    const spec = DIFFICULTY_PRESETS[key];
    if (!spec) {
      throw new Error(`Unknown preset ${name}`);
    }
    if (spec.tiles) {
      return PuzzleState.fromArray(spec.tiles);
    }
    return this.generateScramble(spec.depth, spec.seed).state;
  }

  generateRandomSequence(
    length,
    rng,
    initialState = null,
    avoidInverse = true,
    validOnly = true
  ) {
    const seq = [];
    let state = initialState;
    let lastAction = null;
    for (let i = 0; i < length; i++) {
      let action;
      if (validOnly && state !== null) {
        let choices = this.validActions(state, avoidInverse ? lastAction : null);
        if (choices.length === 0) choices = this.validActions(state);
        action = rng.choice(choices);
        state = this.result(state, action);
      } else {
        const inv = avoidInverse && lastAction ? actionInverse(lastAction) : null;
        const choices = inv ? ALL_ACTIONS.filter((a) => a !== inv) : ALL_ACTIONS;
        action = rng.choice(choices);
      }
      seq.push(action);
      lastAction = action;
    }
    return seq;
  }

  repairSequence(initialState, sequence, rng = null) {
    let state = initialState;
    const repaired = new Array(sequence.length);
    let lastAction = null;
    for (let i = 0; i < sequence.length; i++) {
      let chosen = sequence[i];
      if (!this.isValidAction(state, chosen)) {
        let candidates = this.validActions(state, lastAction);
        if (candidates.length === 0) candidates = this.validActions(state);
        chosen = rng ? rng.choice(candidates) : candidates[0];
      }
      repaired[i] = chosen;
      state = this.result(state, chosen);
      lastAction = chosen;
    }
    return repaired;
  }

  evaluateSequence(
    initialState,
    sequence,
    distanceFn,
    misplacedFn,
    linearConflictFn,
    recordTrajectory = false
  ) {
    let state = initialState;
    let validSteps = 0;
    let invalidMoves = 0;
    const trajectory = recordTrajectory ? [state] : [];
    const executedActions = [];

    if (this.goalTest(state)) {
      return {
        solved: true,
        finalState: state,
        pathCost: 0,
        stepsExecuted: 0,
        invalidMoves: 0,
        distance: 0,
        misplacedTiles: 0,
        linearConflicts: 0,
        conflictCount: 0,
        trajectory,
        executedActions,
      };
    }

    let solved = false;
    for (let i = 0; i < sequence.length; i++) {
      const action = sequence[i];
      if (this.isValidAction(state, action)) {
        state = this.result(state, action);
        validSteps++;
        executedActions.push(action);
        if (recordTrajectory) trajectory.push(state);
        if (this.goalTest(state)) {
          solved = true;
          break;
        }
      } else {
        invalidMoves++;
      }
    }

    const distance = solved ? 0 : distanceFn(state);
    const misplaced = solved ? 0 : misplacedFn(state);
    const linConf = solved ? 0 : linearConflictFn(state);
    const conflictCount = solved ? 0 : misplaced + 2 * linConf;

    return {
      solved,
      finalState: state,
      pathCost: validSteps,
      stepsExecuted: validSteps + invalidMoves,
      invalidMoves,
      distance,
      misplacedTiles: misplaced,
      linearConflicts: linConf,
      conflictCount,
      trajectory,
      executedActions,
    };
  }
}
