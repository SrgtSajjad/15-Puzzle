import {
  FitnessConfig,
  conflictCount,
  linearConflictCount,
  manhattanDistance,
  misplacedTiles,
} from "../core/heuristics.js";
import {
  Action,
  PuzzleEnvironment,
  PuzzleState,
  actionShortCode,
  isSolvableTiles,
} from "../core/puzzle.js";
import { runBenchmarkSuiteAsync, solveAtAllCostAsync } from "../solvers/async_runner.js";
import { GAConfig, GeneticAlgorithmSolver } from "../solvers/genetic.js";
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
import { BFSSolver, DFSSolver, DLSSolver, IDDFSSolver, UCSSolver } from "../solvers/uninformed.js";
import { Board2D } from "./board2d.js";
import { Board3D } from "./board3d.js";
import { renderBarChart, renderLineChart } from "./charts.js";
import { PlaybackController } from "./playback.js";

const ALGO_CATALOG = [
  { id: "bfs", label: "BFS", cat: "uninformed" },
  { id: "ucs", label: "UCS", cat: "uninformed" },
  { id: "dls", label: "DLS", cat: "uninformed" },
  { id: "iddfs", label: "IDDFS", cat: "uninformed" },
  { id: "dfs", label: "DFS", cat: "uninformed" },
  { id: "astar", label: "A*", cat: "informed" },
  { id: "idastar", label: "IDA*", cat: "informed" },
  { id: "wastar", label: "Weighted A*", cat: "informed" },
  { id: "gbfs", label: "Greedy", cat: "informed" },
  { id: "hc_steepest", label: "HC Steepest", cat: "local" },
  { id: "hc_stochastic", label: "HC Stochastic", cat: "local" },
  { id: "hc_restart", label: "HC Restart", cat: "local" },
  { id: "sa", label: "Sim. Annealing", cat: "local" },
  { id: "beam", label: "Local Beam", cat: "local" },
  { id: "ga", label: "Genetic Algo", cat: "evolutionary" },
];

const FAMILY_COLORS = {
  uninformed: "#2563eb",
  informed: "#059669",
  local: "#d97706",
  evolutionary: "#9333ea",
};

const env = new PuzzleEnvironment();
let anchorBoardState = env.getPreset("easy");
let currentBoardState = anchorBoardState;
let selectedAlgo = "astar";
let selectedFamilyFilter = "all";
let lastResult = null;
let benchmarkResults = [];
let activeAbortController = null;
let initialConflictBaseline = Math.max(1, conflictCount(anchorBoardState));

const manualSession = {
  startState: anchorBoardState,
  history: [],      // [{ action, state }]
  redoStack: [],    // [{ action, state }]
  startTimeMs: null,
  elapsedSec: 0,
  timerId: null,
  solved: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const board2d = new Board2D($("#board2dContainer"), { onTileMove: handleManualAction });
const board3d = new Board3D($("#board3dContainer"), { onTileMove: handleManualAction });

const playback = new PlaybackController({
  onStepChange: handlePlaybackStep,
  onStateChange: (playing) => {
    $("#pbPlayPauseBtn").textContent = playing ? "⏸ Pause" : "▶ Play";
  },
});

function formatTimer(sec) {
  const mins = Math.floor(sec / 60);
  const rem = (sec % 60).toFixed(1).padStart(4, "0");
  return `${String(mins).padStart(2, "0")}:${rem}`;
}

function stopManualTimer() {
  if (manualSession.timerId !== null) {
    clearInterval(manualSession.timerId);
    manualSession.timerId = null;
  }
}

function startManualTimerIfNeeded() {
  if (manualSession.timerId !== null || manualSession.solved) return;
  manualSession.startTimeMs = performance.now() - manualSession.elapsedSec * 1000;
  manualSession.timerId = setInterval(() => {
    manualSession.elapsedSec = (performance.now() - manualSession.startTimeMs) / 1000;
    $("#manualTimerDisplay").textContent = formatTimer(manualSession.elapsedSec);
  }, 100);
}

function resetManualSession(startState) {
  stopManualTimer();
  manualSession.startState = startState;
  manualSession.history = [];
  manualSession.redoStack = [];
  manualSession.startTimeMs = null;
  manualSession.elapsedSec = 0;
  manualSession.solved = env.goalTest(startState);
  $("#manualMovesCount").textContent = "0";
  $("#manualTimerDisplay").textContent = "00:00.0";
  updateManualButtons();
}

function updateManualButtons() {
  $("#manualUndoBtn").disabled = manualSession.history.length === 0;
  $("#manualRedoBtn").disabled = manualSession.redoStack.length === 0;
  $("#dpadUpBtn").disabled = !env.isValidAction(currentBoardState, Action.UP);
  $("#dpadDownBtn").disabled = !env.isValidAction(currentBoardState, Action.DOWN);
  $("#dpadLeftBtn").disabled = !env.isValidAction(currentBoardState, Action.LEFT);
  $("#dpadRightBtn").disabled = !env.isValidAction(currentBoardState, Action.RIGHT);
}

function renderStateMetricsAndInlineChart(state, stepIdx, totalSteps, trajectoryStates, modeLabel, activeActions = []) {
  currentBoardState = state;
  board2d.render(state);
  board3d.render(state);
  updateManualButtons();

  const manh = manhattanDistance(state);
  const conf = conflictCount(state);
  const lin = linearConflictCount(state);
  const misp = misplacedTiles(state);

  $("#telStep").textContent = modeLabel;
  $("#telPathCost").textContent = String(stepIdx);
  $("#telManhattan").textContent = `${manh} (LC:${lin}, Misp:${misp})`;

  const confEl = $("#telConflict");
  confEl.textContent = String(conf);
  confEl.classList.toggle("is-zero", conf === 0);

  // Conflict gauge
  const denom = Math.max(initialConflictBaseline, conf, 1);
  const pct = conf === 0 ? 0 : Math.min(100, Math.round((conf / denom) * 100));
  $("#conflictGaugeLabel").textContent =
    conf === 0 ? "conflict_count = 0 (GOAL)" : `conflict_count = ${conf} / baseline ${denom}`;
  $("#conflictGaugeFill").style.width = `${pct}%`;

  // Inline heuristic progress chart
  const statesForChart = trajectoryStates.length > 0 ? trajectoryStates : [state];
  renderLineChart($("#inlineProgressChart"), {
    title: "Trajectory Heuristic & Conflict Progress",
    xLabel: "Step",
    height: 175,
    highlightX: stepIdx,
    series: [
      {
        label: "Conflict Count",
        color: "#ef4444",
        points: statesForChart.map((st, idx) => ({ x: idx, y: conflictCount(st) })),
      },
      {
        label: "Manhattan",
        color: "#2563eb",
        points: statesForChart.map((st, idx) => ({ x: idx, y: manhattanDistance(st) })),
      },
    ],
  });

  // Chips highlight
  $$(".timeline-chip").forEach((chip, idx) => {
    chip.classList.toggle("active", idx === stepIdx - 1);
  });
}

function handleManualAction(action) {
  if (activeAbortController) return;
  if (!env.isValidAction(currentBoardState, action)) return;

  playback.pause();
  lastResult = null;
  const nextState = env.result(currentBoardState, action);

  startManualTimerIfNeeded();
  manualSession.history.push({ action, state: nextState });
  manualSession.redoStack = [];

  applyManualState(nextState);
}

function applyManualState(state) {
  const moves = manualSession.history.length;
  const solved = env.goalTest(state);
  manualSession.solved = solved;
  if (solved) stopManualTimer();

  $("#manualMovesCount").textContent = String(moves);
  $("#solverPlaybackBar").hidden = true;
  $("#telNodes").textContent = "—";
  $("#telElapsed").textContent = `${manualSession.elapsedSec.toFixed(1)} s`;

  const statusEl = $("#telStatusBadge");
  statusEl.textContent = solved ? "Solved Manually" : "Manual Play";
  statusEl.className = `status-badge ${solved ? "badge-success" : "badge-info"}`;

  const banner = $("#goalBanner");
  if (solved && moves > 0) {
    banner.hidden = false;
    banner.textContent = `Solved Manually in ${moves} move${moves === 1 ? "" : "s"} (${manualSession.elapsedSec.toFixed(1)}s) — conflict_count == 0!`;
  } else if (solved) {
    banner.hidden = false;
    banner.textContent = "Goal State Reached — conflict_count == 0";
  } else {
    banner.hidden = true;
  }

  const actions = manualSession.history.map((h) => h.action);
  const traj = [manualSession.startState, ...manualSession.history.map((h) => h.state)];
  updateTimeline(actions, (idx) => {
    // Jump back in manual history cleanly
    while (manualSession.history.length > idx) {
      const popped = manualSession.history.pop();
      manualSession.redoStack.push(popped);
    }
    const targetState =
      manualSession.history.length > 0
        ? manualSession.history[manualSession.history.length - 1].state
        : manualSession.startState;
    applyManualState(targetState);
  });

  $("#stepSummaryLabel").textContent =
    moves > 0
      ? `Manual Move #${moves}: ${actions[moves - 1]}`
      : "Manual play ready — click 2D/3D tiles, swipe, use D-pad, or Arrow/WASD keys.";
  $("#solverExtraNotice").textContent = "";

  renderStateMetricsAndInlineChart(
    state,
    moves,
    moves,
    traj,
    `Manual (${moves})`,
    actions
  );
  updateSolvabilityBanner(state);
}

function handlePlaybackStep({ state, stepIndex, totalSteps, lastAction }) {
  const solvedNow = env.goalTest(state);
  if (lastResult && totalSteps > 0) {
    $("#solverPlaybackBar").hidden = false;
    const banner = $("#goalBanner");
    if (solvedNow && lastResult.solved) {
      const modeTag = lastResult.metrics.extra.solve_mode || `${lastResult.algorithm}${lastResult.heuristicName ? ` · ${lastResult.heuristicName}` : ""}`;
      banner.hidden = false;
      banner.textContent = `Solved in ${lastResult.pathCost} moves (${modeTag})`;
    } else {
      banner.hidden = !solvedNow;
      if (solvedNow) banner.textContent = "GOAL STATE REACHED — conflict_count == 0";
    }
    $("#stepSummaryLabel").textContent = lastAction
      ? `Playback Step ${stepIndex}/${totalSteps}: Move blank ${lastAction}`
      : `Solution ready (${totalSteps} moves) — press Play or step through`;
  } else {
    $("#solverPlaybackBar").hidden = true;
    $("#goalBanner").hidden = !solvedNow;
    if (solvedNow) $("#goalBanner").textContent = "GOAL STATE REACHED — conflict_count == 0";
  }

  renderStateMetricsAndInlineChart(
    state,
    stepIndex,
    totalSteps,
    playback.states,
    totalSteps > 0 ? `${stepIndex} / ${totalSteps}` : "Manual (0)",
    playback.actions
  );
}

function updateTimeline(actions, onChipClick = null) {
  const wrap = $("#timelineChips");
  wrap.innerHTML = "";
  if (!actions || actions.length === 0) {
    wrap.innerHTML = `<span class="muted">Move history will appear here as you play or solve.</span>`;
    return;
  }
  actions.forEach((act, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "timeline-chip";
    btn.title = `Move ${idx + 1}: ${act}`;
    btn.textContent = `${idx + 1}.${actionShortCode(act)}`;
    btn.addEventListener("click", () => {
      if (onChipClick) onChipClick(idx + 1);
      else playback.jumpTo(idx + 1);
    });
    wrap.appendChild(btn);
  });
}

function updateSolvabilityBanner(state) {
  const { solvable, inversions, blankRowBottom } = isSolvableTiles(state);
  const el = $("#solvabilityIndicator");
  el.textContent = solvable
    ? `Solvable · inv=${inversions}, blank row from bottom=${blankRowBottom}`
    : `Unsolvable · inv=${inversions}, blank row from bottom=${blankRowBottom}`;
  el.className = `solvability-pill ${solvable ? "solvable-ok" : "solvable-bad"}`;
}

function renderAlgorithmPills() {
  const wrap = $("#algoPills");
  wrap.innerHTML = "";
  const filtered =
    selectedFamilyFilter === "all"
      ? ALGO_CATALOG
      : ALGO_CATALOG.filter((a) => a.cat === selectedFamilyFilter);

  filtered.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `algo-pill${item.id === selectedAlgo ? " active" : ""}`;
    btn.dataset.algo = item.id;
    btn.dataset.cat = item.cat;
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      selectedAlgo = item.id;
      renderAlgorithmPills();
      syncParameterVisibility();
    });
    wrap.appendChild(btn);
  });
}

function syncParameterVisibility() {
  const algo = selectedAlgo;
  const usesHeuristic = !["bfs", "ucs", "dls", "dfs", "iddfs"].includes(algo);
  $("#heuristicGroup").hidden = !usesHeuristic;
  $("#weightGroup").hidden = algo !== "wastar";
  $("#depthLimitGroup").hidden = !["dls", "dfs", "iddfs"].includes(algo);
  $("#beamWidthGroup").hidden = algo !== "beam";
  $("#saGroup").hidden = algo !== "sa";
  $("#gaParamsPanel").hidden = algo !== "ga";
  if (algo === "ga") {
    $("#advancedSettingsDrawer").open = true;
  }
}

function buildSelectedSolver() {
  const heuristic = $("#heuristicSelect").value;
  const maxNodes = Number($("#maxNodesInput").value) || 120000;
  const maxTimeMs = Number($("#maxTimeInput").value) || 5000;
  const weight = Number($("#weightInput").value) || 1.5;
  const depthLimit = Number($("#depthLimitInput").value) || 26;
  const beamWidth = Number($("#beamWidthInput").value) || 12;
  const initialTemp = Number($("#saTempInput").value) || 12.0;
  const coolingRate = Number($("#saCoolingInput").value) || 0.995;

  switch (selectedAlgo) {
    case "bfs": return new BFSSolver(env, { maxNodes, maxTimeMs });
    case "ucs": return new UCSSolver(env, { maxNodes, maxTimeMs });
    case "dls": return new DLSSolver(env, { depthLimit, maxNodes, maxTimeMs });
    case "dfs": return new DFSSolver(env, { maxDepth: depthLimit, maxNodes, maxTimeMs });
    case "iddfs": return new IDDFSSolver(env, { maxDepth: depthLimit, maxNodes, maxTimeMs });
    case "gbfs": return new GreedyBestFirstSolver(env, { heuristic, maxNodes, maxTimeMs });
    case "astar": return new AStarSolver(env, { heuristic, maxNodes, maxTimeMs });
    case "wastar": return new WeightedAStarSolver(env, { heuristic, weight, maxNodes, maxTimeMs });
    case "idastar": return new IDAStarSolver(env, { heuristic, maxNodes: Math.max(maxNodes, 350000), maxTimeMs });
    case "hc_steepest": return new HillClimbingSolver(env, { variant: "steepest", heuristic });
    case "hc_stochastic": return new HillClimbingSolver(env, { variant: "stochastic", heuristic });
    case "hc_restart": return new HillClimbingSolver(env, { variant: "random_restart", heuristic });
    case "sa": return new SimulatedAnnealingSolver(env, { heuristic, initialTemp, coolingRate });
    case "beam": return new LocalBeamSolver(env, { heuristic, beamWidth });
    case "ga": {
      const fitCfg = new FitnessConfig({
        largeConstant: Number($("#gaLargeConstant").value) || 10000,
        heuristicName: heuristic,
      });
      return new GeneticAlgorithmSolver(
        env,
        new GAConfig({
          populationSize: Number($("#gaPopSize").value) || 50,
          sequenceLength: Number($("#gaSeqLen").value) || 28,
          numGenerations: Number($("#gaGenerations").value) || 120,
          mutationRate: Number($("#gaMutationRate").value) || 0.15,
          crossoverType: $("#gaCrossoverType").value,
          mutationType: $("#gaMutationType").value,
          selectionMethod: $("#gaSelectionMethod").value,
          tournamentK: Number($("#gaTournamentK").value) || 4,
          elitismCount: Number($("#gaElitism").value) || 2,
          seed: Number($("#gaSeed").value) || 42,
          fitnessConfig: fitCfg,
        })
      );
    }
    default:
      return new AStarSolver(env, { heuristic });
  }
}

function setRunningState(isRunning, bannerText = "") {
  $("#solveAllCostBtn").disabled = isRunning;
  $("#solveBtn").disabled = isRunning;
  $("#compareAllBtn").disabled = isRunning;
  $("#runBenchmarkBtn").disabled = isRunning;
  $("#terminateBtn").disabled = !isRunning;
  $("#terminateBenchBtn").disabled = !isRunning;

  const progressEl = $("#liveProgressBanner");
  if (isRunning && bannerText) {
    progressEl.hidden = false;
    progressEl.textContent = bannerText;
  } else if (!isRunning) {
    progressEl.hidden = true;
  }
}

function updateTelemetryFromResult(result) {
  const statusEl = $("#telStatusBadge");
  const noticeEl = $("#solverExtraNotice");
  if (!result) {
    $("#telNodes").textContent = "—";
    $("#telElapsed").textContent = "—";
    statusEl.textContent = "Manual";
    statusEl.className = "status-badge badge-info";
    noticeEl.textContent = "";
    return;
  }

  $("#telNodes").textContent = `${result.metrics.nodesExpanded.toLocaleString()} / ${result.metrics.nodesGenerated.toLocaleString()}`;
  $("#telElapsed").textContent = `${result.metrics.elapsedMs.toFixed(1)} ms`;

  statusEl.textContent = result.solved
    ? "Goal Reached"
    : result.status.replace("_", " ");
  statusEl.className = `status-badge ${result.solved ? "badge-success" : "badge-warn"}`;

  if (result.algorithm === "Genetic Algorithm") {
    const gen = result.metrics.extra.goal_reached_generation;
    noticeEl.textContent =
      gen !== null && gen !== undefined
        ? `GA reached conflict_count == 0 at generation ${gen} | Best Fitness: ${result.metrics.extra.best_fitness}`
        : `GA finished ${result.metrics.extra.generations} generations | Best Fitness: ${result.metrics.extra.best_fitness} | Final Conflict: ${result.metrics.extra.final_conflict_count}`;
  } else if (!result.solved) {
    noticeEl.textContent = `${result.algorithm} stopped (${result.status}, best cost ${result.pathCost}). Use "Solve At All Cost" for guaranteed IDA*/Weighted A* completion.`;
  } else {
    const modeNote = result.metrics.extra.solve_mode ? ` (${result.metrics.extra.solve_mode})` : "";
    noticeEl.textContent = `${result.algorithm}${modeNote} solved in ${result.pathCost} moves.`;
  }
}

function applySolvedResult(solveOriginState, res) {
  lastResult = res;
  stopManualTimer();
  updateTelemetryFromResult(res);
  updateTimeline(res.actions);
  playback.loadTrajectory(solveOriginState, res.actions, env);
  if (res.algorithm === "Genetic Algorithm" && res.history.length > 0) {
    renderGACharts(res);
  }
  if (res.solved && res.actions.length > 0) {
    playback.play();
  }
}

async function runSolveAtAllCost() {
  if (activeAbortController) return;
  const originState = currentBoardState;
  activeAbortController = new AbortController();
  setRunningState(true, "Solving At All Cost: Initializing IDA* (Optimal)...");

  try {
    const res = await solveAtAllCostAsync(env, originState, {
      signal: activeAbortController.signal,
      onProgress: (prog) => {
        const threshTxt = prog.threshold !== undefined ? ` · f-threshold ${prog.threshold}` : "";
        $("#liveProgressBanner").textContent =
          `Phase ${prog.phaseIndex}/${prog.totalPhases}: ${prog.phaseLabel}${threshTxt} · ${prog.nodesExpanded.toLocaleString()} nodes · ${Math.round(prog.elapsedMs)} ms`;
      },
    });
    applySolvedResult(originState, res);
  } finally {
    activeAbortController = null;
    setRunningState(false);
  }
}

async function runSelectedSolver() {
  if (activeAbortController) return;
  const originState = currentBoardState;
  const solver = buildSelectedSolver();
  activeAbortController = new AbortController();
  setRunningState(true, `Running ${solver.name}...`);

  try {
    let res;
    if (typeof solver.solveAsync === "function") {
      res = await solver.solveAsync(originState, {
        signal: activeAbortController.signal,
        onProgress: (prog) => {
          const extra =
            prog.generation !== undefined
              ? `Gen ${prog.generation}`
              : prog.threshold !== undefined
                ? `f=${prog.threshold}`
                : `best h=${prog.bestH ?? "?"}`;
          $("#liveProgressBanner").textContent =
            `Running ${solver.name} (${extra}) · ${prog.nodesExpanded.toLocaleString()} evals · ${Math.round(prog.elapsedMs)} ms`;
        },
      });
    } else {
      await new Promise((r) => setTimeout(r, 10));
      res = solver.solve(originState);
    }
    applySolvedResult(originState, res);
  } finally {
    activeAbortController = null;
    setRunningState(false);
  }
}

function renderGACharts(result) {
  const section = $("#gaConvergenceSection");
  if (!result || result.algorithm !== "Genetic Algorithm" || !result.history || result.history.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const hist = result.history;
  renderLineChart($("#gaFitnessChart"), {
    title: "GA Fitness per Generation",
    series: [
      { label: "Best Fitness", color: "#2563eb", points: hist.map((h) => ({ x: h.generation, y: h.best_fitness })) },
      { label: "Mean Fitness", color: "#0ea5e9", points: hist.map((h) => ({ x: h.generation, y: h.mean_fitness })) },
    ],
  });

  renderLineChart($("#gaConflictChart"), {
    title: "Min Conflict Count & Best Path Cost",
    series: [
      { label: "Min Conflicts", color: "#dc2626", points: hist.map((h) => ({ x: h.generation, y: h.min_conflicts })) },
      { label: "Min Distance", color: "#f59e0b", points: hist.map((h) => ({ x: h.generation, y: h.min_distance })) },
      { label: "Best Path Cost", color: "#10b981", points: hist.map((h) => ({ x: h.generation, y: h.best_path_cost })) },
    ],
  });

  const step = Math.max(1, Math.floor(hist.length / 15));
  const sampled = hist.filter((_, idx) => idx % step === 0 || idx === hist.length - 1 || hist[idx].goal_reached);
  $("#gaStatsTableBody").innerHTML = sampled
    .slice(0, 20)
    .map(
      (row) => `
      <tr class="${row.goal_reached ? "row-solved" : ""}">
        <td class="mono">${row.generation}</td>
        <td class="mono">${row.best_fitness}</td>
        <td class="mono">${row.mean_fitness}</td>
        <td class="mono">${row.min_conflicts}</td>
        <td class="mono">${row.best_path_cost}</td>
        <td>${row.solved_count > 0 ? `Yes (${row.solved_count})` : "No"}</td>
      </tr>`
    )
    .join("");
}

function renderBenchmarkLiveView(rows) {
  renderBarChart($("#benchCostChart"), {
    title: "Path Cost (Steps)",
    bars: rows.map((r) => ({
      label: r.displayLabel || r.algorithm,
      value: r.pathCost,
      solved: r.solved,
      status: r.status,
      color: FAMILY_COLORS[r.category] || "#2563eb",
    })),
  });

  renderBarChart($("#benchNodesChart"), {
    title: "Nodes Expanded / Evaluated",
    bars: rows.map((r) => ({
      label: r.displayLabel || r.algorithm,
      value: r.metrics.nodesExpanded,
      solved: r.solved,
      status: r.status,
      color: FAMILY_COLORS[r.category] || "#2563eb",
    })),
    valueFormatter: (v) => v.toLocaleString(),
  });

  $("#benchTableBody").innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td><strong>${r.displayLabel || r.algorithm}</strong></td>
        <td><span class="cat-badge cat-${r.category}">${r.category}</span></td>
        <td><span class="status-badge ${r.solved ? "badge-success" : "badge-warn"}">${r.status}</span></td>
        <td class="mono">${r.pathCost}</td>
        <td class="mono">${r.metrics.nodesExpanded.toLocaleString()}</td>
        <td class="mono">${r.metrics.elapsedMs.toFixed(1)} ms</td>
      </tr>`
    )
    .join("");
}

async function runCompareAllBenchmarks({ switchTab = false } = {}) {
  if (activeAbortController) return;
  if (switchTab) {
    $$(".nav-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "benchmarks"));
    $$(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== "benchmarks"));
  }

  const benchBoard = currentBoardState;
  benchmarkResults = [];
  $("#benchTableBody").innerHTML = "";
  const statusPill = $("#benchStatusPill");
  statusPill.textContent = "Starting...";
  statusPill.className = "status-badge badge-info";

  activeAbortController = new AbortController();
  setRunningState(true, "Benchmarking all 4 AI search families...");

  try {
    const results = await runBenchmarkSuiteAsync(env, benchBoard, {
      gaSeed: Number($("#gaSeed").value) || 42,
      signal: activeAbortController.signal,
      onSolverStart: (label, idx, total) => {
        statusPill.textContent = `Running (${idx + 1}/${total}): ${label}...`;
        $("#liveProgressBanner").textContent = `Benchmark (${idx + 1}/${total}): Running ${label}...`;
      },
      onSolverFinish: (res) => {
        benchmarkResults.push(res);
        renderBenchmarkLiveView(benchmarkResults);
        if (res.algorithm === "Genetic Algorithm" && res.history.length > 0) {
          renderGACharts(res);
        }
      },
    });
    const wasAborted = activeAbortController.signal.aborted;
    statusPill.textContent = wasAborted
      ? `Terminated (${results.filter((r) => r.status !== "terminated").length}/${results.length} completed)`
      : `Completed (${results.filter((r) => r.solved).length}/${results.length} solved)`;
    statusPill.className = `status-badge ${wasAborted ? "badge-warn" : "badge-success"}`;
  } finally {
    activeAbortController = null;
    setRunningState(false);
  }
}

function terminateActiveRun() {
  if (activeAbortController) {
    activeAbortController.abort();
  }
}

// Custom 4x4 Board Editor
function buildEditorGrid() {
  const grid = $("#editorGrid");
  grid.innerHTML = "";
  for (let i = 0; i < 16; i++) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = "15";
    inp.className = "editor-cell";
    inp.dataset.idx = String(i);
    inp.addEventListener("input", validateEditorInputs);
    grid.appendChild(inp);
  }
  syncEditorFromState(anchorBoardState);
}

function syncEditorFromState(state) {
  const cells = $$(".editor-cell");
  state.tiles.forEach((val, idx) => {
    if (cells[idx]) cells[idx].value = String(val);
  });
  const txt = $("#editorTextInput");
  if (document.activeElement !== txt) {
    txt.value = state.tiles.join(", ");
  }
  validateEditorInputs();
}

function validateEditorInputs() {
  const vals = $$(".editor-cell").map((el) => Number(el.value));
  const badge = $("#editorSolvabilityBadge");
  try {
    const st = PuzzleState.fromArray(vals);
    const { solvable, inversions, blankRowBottom } = isSolvableTiles(st);
    badge.textContent = solvable
      ? `Valid & Solvable (inv=${inversions}, row=${blankRowBottom})`
      : `Valid Permutation — UNSOLVABLE (inv=${inversions}, row=${blankRowBottom})`;
    badge.className = `solvability-pill ${solvable ? "solvable-ok" : "solvable-bad"}`;
    const txtInput = $("#editorTextInput");
    if (document.activeElement !== txtInput) {
      txtInput.value = vals.join(", ");
    }
    return st;
  } catch (err) {
    badge.textContent = `Invalid Board: ${err.message}`;
    badge.className = "solvability-pill solvable-bad";
    return null;
  }
}

function loadBoard(state) {
  playback.stop();
  anchorBoardState = state;
  currentBoardState = state;
  lastResult = null;
  initialConflictBaseline = Math.max(1, conflictCount(state));
  resetManualSession(state);
  playback.setSingleState(state);
  applyManualState(state);
  syncEditorFromState(state);
  renderGACharts(null);
}

function exportRun(format) {
  if (!lastResult && benchmarkResults.length === 0) {
    alert("Run a solver or benchmark first to export results.");
    return;
  }
  let content;
  let filename;
  let mime;
  if (format === "json") {
    content = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        initial_tiles: Array.from(anchorBoardState.tiles),
        last_result: lastResult ? lastResult.toJSON() : null,
        benchmark_results: benchmarkResults.map((r) => r.toJSON()),
      },
      null,
      2
    );
    filename = "15_puzzle_run_summary.json";
    mime = "application/json";
  } else {
    const rows = (benchmarkResults.length > 0 ? benchmarkResults : [lastResult]).map((r) => [
      r.displayLabel || r.algorithm,
      r.category,
      r.heuristicName || "",
      r.status,
      r.solved,
      r.pathCost,
      r.metrics.nodesExpanded,
      r.metrics.nodesGenerated,
      r.metrics.elapsedMs.toFixed(3),
    ]);
    const header = "algorithm,category,heuristic,status,solved,path_cost,nodes_expanded,nodes_generated,elapsed_ms";
    content = [header, ...rows.map((r) => r.join(","))].join("\n");
    filename = "15_puzzle_summary.csv";
    mime = "text/csv";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function wireEvents() {
  $("#themeToggleBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    $("#themeToggleBtn").textContent = next === "dark" ? "☀ Light" : "🌙 Dark";
  });

  $$(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      $$(".nav-tab").forEach((t) => t.classList.toggle("active", t === tab));
      $$(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== target));
    });
  });

  $$(".view-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.view;
      $$(".view-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      $("#boardsStage").dataset.view = mode;
    });
  });

  $("#overlayToggle").addEventListener("change", (e) => {
    board2d.setOverlaysVisible(e.target.checked);
    board3d.setOverlaysVisible(e.target.checked);
  });

  // 3D camera
  $("#camIsoBtn").addEventListener("click", () => board3d.setPreset("isometric"));
  $("#camTopBtn").addEventListener("click", () => board3d.setPreset("top"));
  $("#camLowBtn").addEventListener("click", () => board3d.setPreset("low"));
  $("#camZoomInBtn").addEventListener("click", () => board3d.adjustZoom(0.12));
  $("#camZoomOutBtn").addEventListener("click", () => board3d.adjustZoom(-0.12));

  // D-pad & manual session
  $("#dpadUpBtn").addEventListener("click", () => handleManualAction(Action.UP));
  $("#dpadDownBtn").addEventListener("click", () => handleManualAction(Action.DOWN));
  $("#dpadLeftBtn").addEventListener("click", () => handleManualAction(Action.LEFT));
  $("#dpadRightBtn").addEventListener("click", () => handleManualAction(Action.RIGHT));

  $("#manualUndoBtn").addEventListener("click", () => {
    if (manualSession.history.length === 0) return;
    const popped = manualSession.history.pop();
    manualSession.redoStack.push(popped);
    const prevState =
      manualSession.history.length > 0
        ? manualSession.history[manualSession.history.length - 1].state
        : manualSession.startState;
    applyManualState(prevState);
  });

  $("#manualRedoBtn").addEventListener("click", () => {
    if (manualSession.redoStack.length === 0) return;
    const nextItem = manualSession.redoStack.pop();
    manualSession.history.push(nextItem);
    applyManualState(nextItem.state);
  });

  $("#manualResetBtn").addEventListener("click", () => loadBoard(anchorBoardState));

  // Family tabs
  $$(".family-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      selectedFamilyFilter = tab.dataset.family;
      $$(".family-tab").forEach((t) => t.classList.toggle("active", t === tab));
      renderAlgorithmPills();
    });
  });

  // Presets & scramble
  $("#applyPresetBtn").addEventListener("click", () => {
    loadBoard(env.getPreset($("#presetSelect").value));
  });
  $("#scrambleBtn").addEventListener("click", () => {
    const depth = Number($("#scrambleDepthInput").value) || 16;
    const seed = Number($("#scrambleSeedInput").value) || 42;
    const { state } = env.generateScramble(depth, seed);
    loadBoard(state);
  });

  // Custom editor
  $("#toggleEditorBtn").addEventListener("click", () => {
    $("#customEditorPanel").hidden = !$("#customEditorPanel").hidden;
  });
  const syncFromTextInput = (e) => {
    const parts = e.target.value.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length === 16 && parts.every((n) => Number.isInteger(n))) {
      $$(".editor-cell").forEach((cell, i) => (cell.value = String(parts[i])));
      validateEditorInputs();
    }
  };
  $("#editorTextInput").addEventListener("input", syncFromTextInput);
  $("#editorTextInput").addEventListener("change", syncFromTextInput);
  $("#editorApplyBtn").addEventListener("click", () => {
    const parsed = validateEditorInputs();
    if (parsed) {
      loadBoard(parsed);
      $("#customEditorPanel").hidden = true;
    }
  });

  // Solvers & Benchmarks
  $("#solveAllCostBtn").addEventListener("click", runSolveAtAllCost);
  $("#solveBtn").addEventListener("click", runSelectedSolver);
  $("#compareAllBtn").addEventListener("click", () => runCompareAllBenchmarks({ switchTab: true }));
  $("#runBenchmarkBtn").addEventListener("click", () => runCompareAllBenchmarks({ switchTab: false }));
  $("#terminateBtn").addEventListener("click", terminateActiveRun);
  $("#terminateBenchBtn").addEventListener("click", terminateActiveRun);
  $("#exportJsonBtn").addEventListener("click", () => exportRun("json"));
  $("#exportCsvBtn").addEventListener("click", () => exportRun("csv"));

  // Playback
  $("#pbFirstBtn").addEventListener("click", () => playback.first());
  $("#pbPrevBtn").addEventListener("click", () => playback.prev());
  $("#pbPlayPauseBtn").addEventListener("click", () =>
    playback.isPlaying ? playback.pause() : playback.play()
  );
  $("#pbNextBtn").addEventListener("click", () => playback.next());
  $("#pbLastBtn").addEventListener("click", () => playback.last());
  $("#pbStopBtn").addEventListener("click", () => playback.stop());
  $("#pbSpeedRange").addEventListener("input", (e) => {
    const ms = Number(e.target.value);
    $("#pbSpeedLabel").textContent = `${ms} ms`;
    playback.setSpeed(ms);
  });

  // Keyboard Arrow + WASD
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const map = {
      ArrowUp: Action.UP,
      ArrowDown: Action.DOWN,
      ArrowLeft: Action.LEFT,
      ArrowRight: Action.RIGHT,
      w: Action.UP,
      W: Action.UP,
      s: Action.DOWN,
      S: Action.DOWN,
      a: Action.LEFT,
      A: Action.LEFT,
      d: Action.RIGHT,
      D: Action.RIGHT,
    };
    if (map[e.key]) {
      e.preventDefault();
      handleManualAction(map[e.key]);
    }
  });
}

// Initialize
buildEditorGrid();
renderAlgorithmPills();
syncParameterVisibility();
wireEvents();
loadBoard(anchorBoardState);
