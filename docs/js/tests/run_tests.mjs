import test from "node:test";
import assert from "node:assert/strict";

import { Action, PuzzleEnvironment, PuzzleState } from "../core/puzzle.js";
import {
  Evaluator,
  FitnessConfig,
  conflictCount,
  linearConflictCount,
  manhattanDistance,
  manhattanLinearConflict,
  misplacedTiles,
} from "../core/heuristics.js";
import { SeededRNG } from "../core/rng.js";
import { BFSSolver, DFSSolver, DLSSolver, IDDFSSolver, UCSSolver } from "../solvers/uninformed.js";
import {
  AStarSolver,
  GreedyBestFirstSolver,
  IDAStarSolver,
  WeightedAStarSolver,
} from "../solvers/informed.js";
import {
  HillClimbingSolver,
  LocalBeamSolver,
  SimulatedAnnealingSolver,
} from "../solvers/local.js";
import { GAConfig, GeneticAlgorithmSolver } from "../solvers/genetic.js";
import { runBenchmarkSuiteAsync, solveAtAllCostAsync } from "../solvers/async_runner.js";

function verifyPath(env, initialState, actions) {
  let curr = initialState;
  for (const act of actions) {
    curr = env.result(curr, act);
  }
  return curr;
}

test("Solvability and early-stop sequence evaluation", () => {
  const env = new PuzzleEnvironment();
  const goal = PuzzleState.goal();
  assert.equal(env.goalTest(goal), true);
  assert.equal(env.isSolvable(goal), true);

  const unsolvable = PuzzleState.fromArray([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0,
  ]);
  assert.equal(env.isSolvable(unsolvable), false);

  const s1 = env.result(goal, Action.UP);
  const s2 = env.result(s1, Action.LEFT);
  const res = env.evaluateSequence(
    s2,
    [Action.RIGHT, Action.DOWN, Action.UP, Action.LEFT],
    manhattanDistance,
    misplacedTiles,
    linearConflictCount,
    true
  );
  assert.equal(res.solved, true);
  assert.equal(res.pathCost, 2);
  assert.equal(res.conflictCount, 0);
  assert.equal(env.goalTest(res.finalState), true);
});

test("Heuristics and GA fitness invariants", () => {
  const env = new PuzzleEnvironment();
  const goal = PuzzleState.goal();
  assert.equal(misplacedTiles(goal), 0);
  assert.equal(manhattanDistance(goal), 0);
  assert.equal(linearConflictCount(goal), 0);
  assert.equal(conflictCount(goal), 0);

  const conflictBoard = PuzzleState.fromArray([
    2, 1, 3, 4,
    9, 6, 7, 8,
    5, 10, 11, 12,
    13, 14, 15, 0,
  ]);
  assert.equal(linearConflictCount(conflictBoard), 2);
  assert.equal(manhattanLinearConflict(conflictBoard), manhattanDistance(conflictBoard) + 4);

  const evaluator = new Evaluator(env, new FitnessConfig());
  const start = env.result(goal, Action.UP);
  const fShort = evaluator.fitness(start, [Action.DOWN]);
  const fLong = evaluator.fitness(start, [Action.LEFT, Action.RIGHT, Action.DOWN]);
  const fUnsolved = evaluator.fitness(start, [Action.UP, Action.LEFT]);

  assert.ok(fShort.fitness > fLong.fitness);
  assert.ok(fLong.fitness > fUnsolved.fitness);
});

test("Uninformed and Informed solvers match optimal path cost on depth-8 scramble", () => {
  const env = new PuzzleEnvironment();
  const { state: board } = env.generateScramble(8, 19);

  const bfs = new BFSSolver(env).solve(board);
  assert.equal(bfs.solved, true);

  const solvers = [
    new UCSSolver(env),
    new DLSSolver(env, { depthLimit: 10 }),
    new DFSSolver(env, { maxDepth: 12 }),
    new IDDFSSolver(env, { maxDepth: 12 }),
    new GreedyBestFirstSolver(env),
    new AStarSolver(env, { heuristic: "linear_conflict" }),
    new WeightedAStarSolver(env, { weight: 1.5 }),
    new IDAStarSolver(env, { heuristic: "linear_conflict" }),
  ];

  for (const solver of solvers) {
    const res = solver.solve(board);
    assert.equal(res.solved, true, `${solver.name} failed`);
    const endState = verifyPath(env, board, res.actions);
    assert.equal(env.goalTest(endState), true);
    if (["UCS", "IDDFS", "A*", "IDA*"].includes(solver.name)) {
      assert.equal(res.pathCost, bfs.pathCost);
    }
  }
});

test("Local search solvers return valid executable trajectories", () => {
  const env = new PuzzleEnvironment();
  const { state: board } = env.generateScramble(6, 9);

  for (const solver of [
    new HillClimbingSolver(env, { variant: "steepest", seed: 42 }),
    new HillClimbingSolver(env, { variant: "stochastic", seed: 42 }),
    new HillClimbingSolver(env, { variant: "random_restart", seed: 42 }),
    new SimulatedAnnealingSolver(env, { maxIterations: 1000, seed: 42 }),
    new LocalBeamSolver(env, { beamWidth: 12, maxSteps: 40 }),
  ]) {
    const res = solver.solve(board);
    const endState = verifyPath(env, board, res.actions);
    assert.equal(endState.key, res.finalState.key);
  }
});

test("Darwinian GA select pairs, roulette/tournament, and deterministic solve", () => {
  const env = new PuzzleEnvironment();
  const { state: board } = env.generateScramble(6, 14);

  const cfg = new GAConfig({
    populationSize: 50,
    sequenceLength: 18,
    numGenerations: 80,
    mutationRate: 0.2,
    crossoverType: "two_point",
    selectionMethod: "tournament",
    tournamentK: 4,
    seed: 42,
  });
  const ga1 = new GeneticAlgorithmSolver(env, cfg);
  const pop = ga1.generatePopulation(board);
  assert.equal(ga1.select(board, pop).length, 25);

  const res1 = ga1.solve(board);
  const res2 = new GeneticAlgorithmSolver(env, cfg).solve(board);
  assert.equal(res1.solved, true);
  assert.equal(res1.metrics.extra.final_conflict_count, 0);
  assert.deepEqual(res1.actions, res2.actions);

  const rouletteCfg = new GAConfig({
    populationSize: 40,
    sequenceLength: 16,
    numGenerations: 40,
    selectionMethod: "roulette",
    seed: 77,
  });
  const gaRoulette = new GeneticAlgorithmSolver(env, rouletteCfg);
  const rPop = gaRoulette.generatePopulation(board);
  assert.equal(gaRoulette.select(board, rPop).length, 20);
  assert.ok(new SeededRNG(5).random() >= 0);
});

test("Async IDA*, Solve At All Cost, and AbortController benchmark termination", async () => {
  const env = new PuzzleEnvironment();
  const medium = env.getPreset("medium");
  const hard = env.getPreset("hard");

  const idaSync = new IDAStarSolver(env, { heuristic: "linear_conflict" }).solve(medium);
  const idaAsync = await new IDAStarSolver(env, { heuristic: "linear_conflict" }).solveAsync(medium);
  assert.equal(idaAsync.solved, true);
  assert.equal(idaAsync.pathCost, idaSync.pathCost);

  const solvedHard = await solveAtAllCostAsync(env, hard);
  assert.equal(solvedHard.solved, true);
  const finalState = verifyPath(env, hard, solvedHard.actions);
  assert.equal(env.goalTest(finalState), true);

  const controller = new AbortController();
  let completedCount = 0;
  const benchResults = await runBenchmarkSuiteAsync(env, medium, {
    signal: controller.signal,
    onSolverFinish: (res) => {
      if (res.status !== "terminated") completedCount++;
      if (completedCount >= 2) controller.abort();
    },
  });
  assert.equal(benchResults.length, 12);
  assert.ok(benchResults.some((r) => r.status === "terminated"));
});
