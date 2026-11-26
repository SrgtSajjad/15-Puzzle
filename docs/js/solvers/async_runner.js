import { SearchMetrics, SearchResult, nowMs } from "../core/solver_base.js";
import { GAConfig, GeneticAlgorithmSolver } from "./genetic.js";
import {
  AStarSolver,
  GreedyBestFirstSolver,
  IDAStarSolver,
  WeightedAStarSolver,
} from "./informed.js";
import {
  HillClimbingSolver,
  LocalBeamSolver,
  SimulatedAnnealingSolver,
} from "./local.js";
import { BFSSolver, IDDFSSolver, UCSSolver } from "./uninformed.js";

export function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Guaranteed non-blocking solver strategy:
 *   1. Optimal IDA* (linear_conflict) with generous budget
 *   2. Weighted A* (w=1.8) escalation for deep extreme scrambles
 *   3. Weighted A* (w=2.6) fallback
 */
export async function solveAtAllCostAsync(
  env,
  initialState,
  { signal = null, onProgress = null } = {}
) {
  if (!env.isSolvable(initialState)) {
    return new IDAStarSolver(env).unsolvableResult(initialState, "linear_conflict");
  }

  const totalStart = nowMs();
  let accumulatedNodes = 0;

  const phases = [
    {
      label: "Optimal via IDA*",
      create: () =>
        new IDAStarSolver(env, {
          heuristic: "linear_conflict",
          maxNodes: 350000,
          maxTimeMs: 4000,
        }),
    },
    {
      label: "Best-effort via Weighted A* (w=1.8)",
      create: () =>
        new WeightedAStarSolver(env, {
          heuristic: "linear_conflict",
          weight: 1.8,
          maxNodes: 250000,
          maxTimeMs: 4000,
        }),
    },
    {
      label: "Best-effort via Weighted A* (w=2.6)",
      create: () =>
        new WeightedAStarSolver(env, {
          heuristic: "linear_conflict",
          weight: 2.6,
          maxNodes: 300000,
          maxTimeMs: 5000,
        }),
    },
  ];

  let lastResult = null;
  for (let i = 0; i < phases.length; i++) {
    if (signal?.aborted) break;
    const phase = phases[i];
    const solver = phase.create();

    if (onProgress) {
      onProgress({
        phaseIndex: i + 1,
        totalPhases: phases.length,
        phaseLabel: phase.label,
        nodesExpanded: accumulatedNodes,
        elapsedMs: nowMs() - totalStart,
      });
    }
    await yieldToUI();

    const res = await solver.solveAsync(initialState, {
      signal,
      chunkSize: 3000,
      onProgress: (prog) => {
        if (onProgress) {
          onProgress({
            phaseIndex: i + 1,
            totalPhases: phases.length,
            phaseLabel: phase.label,
            threshold: prog.threshold,
            nodesExpanded: accumulatedNodes + prog.nodesExpanded,
            elapsedMs: nowMs() - totalStart,
          });
        }
      },
    });

    accumulatedNodes += res.metrics.nodesExpanded;
    lastResult = res;
    if (res.solved || signal?.aborted) {
      res.metrics.extra.solve_mode = phase.label;
      res.metrics.extra.total_nodes_across_phases = accumulatedNodes;
      res.metrics.elapsedMs = nowMs() - totalStart;
      return res;
    }
  }

  if (lastResult) {
    lastResult.metrics.extra.solve_mode = "Stopped / Budget Reached";
    lastResult.metrics.elapsedMs = nowMs() - totalStart;
    return lastResult;
  }

  return new SearchResult({
    algorithm: "Solve At All Cost",
    category: "informed",
    status: "terminated",
    solved: false,
    initialState,
    finalState: initialState,
    actions: [],
    pathCost: 0,
    heuristicName: "linear_conflict",
    metrics: new SearchMetrics({ elapsedMs: nowMs() - totalStart }),
  });
}

/**
 * Run all 4 search families asynchronously on the exact current board,
 * streaming live rows and supporting instant mid-run AbortSignal termination.
 */
export async function runBenchmarkSuiteAsync(
  env,
  board,
  {
    gaSeed = 42,
    signal = null,
    onSolverStart = null,
    onSolverFinish = null,
  } = {}
) {
  const specs = [
    { label: "BFS", category: "uninformed", create: () => new BFSSolver(env, { maxNodes: 35000, maxTimeMs: 900 }) },
    { label: "UCS", category: "uninformed", create: () => new UCSSolver(env, { maxNodes: 35000, maxTimeMs: 900 }) },
    { label: "IDDFS", category: "uninformed", create: () => new IDDFSSolver(env, { maxDepth: 16, maxNodes: 50000, maxTimeMs: 900 }) },
    { label: "Greedy Best-First (LC)", category: "informed", create: () => new GreedyBestFirstSolver(env, { heuristic: "linear_conflict", maxNodes: 40000, maxTimeMs: 1000 }) },
    { label: "A* (Manhattan)", category: "informed", create: () => new AStarSolver(env, { heuristic: "manhattan", maxNodes: 60000, maxTimeMs: 1400 }) },
    { label: "A* (Linear Conflict)", category: "informed", create: () => new AStarSolver(env, { heuristic: "linear_conflict", maxNodes: 60000, maxTimeMs: 1400 }) },
    { label: "Weighted A* (w=1.5)", category: "informed", create: () => new WeightedAStarSolver(env, { heuristic: "linear_conflict", weight: 1.5, maxNodes: 60000, maxTimeMs: 1400 }) },
    { label: "IDA* (Linear Conflict)", category: "informed", create: () => new IDAStarSolver(env, { heuristic: "linear_conflict", maxNodes: 200000, maxTimeMs: 2000 }) },
    { label: "Hill Climbing (Steepest)", category: "local", create: () => new HillClimbingSolver(env, { variant: "steepest", heuristic: "linear_conflict" }) },
    { label: "Simulated Annealing", category: "local", create: () => new SimulatedAnnealingSolver(env, { heuristic: "linear_conflict", maxIterations: 2000 }) },
    { label: "Local Beam (k=12)", category: "local", create: () => new LocalBeamSolver(env, { heuristic: "linear_conflict", beamWidth: 12 }) },
    {
      label: "Genetic Algorithm",
      category: "evolutionary",
      create: () =>
        new GeneticAlgorithmSolver(
          env,
          new GAConfig({
            populationSize: 50,
            sequenceLength: 30,
            numGenerations: 60,
            selectionMethod: "tournament",
            tournamentK: 4,
            crossoverType: "two_point",
            seed: gaSeed,
          })
        ),
    },
  ];

  const results = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (signal?.aborted) {
      const terminated = new SearchResult({
        algorithm: spec.label,
        category: spec.category,
        status: "terminated",
        solved: false,
        initialState: board,
        finalState: board,
        actions: [],
        pathCost: 0,
        metrics: new SearchMetrics(),
      });
      terminated.displayLabel = spec.label;
      results.push(terminated);
      if (onSolverFinish) onSolverFinish(terminated, i, specs.length);
      continue;
    }

    if (onSolverStart) onSolverStart(spec.label, i, specs.length);
    await yieldToUI();

    const solver = spec.create();
    const res =
      typeof solver.solveAsync === "function"
        ? await solver.solveAsync(board, { signal })
        : solver.solve(board);
    res.displayLabel = spec.label;
    results.push(res);

    if (onSolverFinish) onSolverFinish(res, i, specs.length);
  }

  return results;
}
