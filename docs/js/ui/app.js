import {
  Evaluator,
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

const env = new PuzzleEnvironment();
let initialState = env.getPreset("easy");
let currentManualState = initialState;
let lastResult = null;
let benchmarkResults = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const board2d = new Board2D($("#board2dContainer"), { onTileMove: handleManualAction });
const board3d = new Board3D($("#board3dContainer"), { onTileMove: handleManualAction });

const playback = new PlaybackController({
  onStepChange: handleStepUpdate,
  onStateChange: (playing) => {
    const btn = $("#pbPlayPauseBtn");
    btn.textContent = playing ? "⏸ Pause" : "▶ Play";
  },
});

function handleManualAction(action) {
  if (!env.isValidAction(currentManualState, action)) return;
  playback.pause();
  currentManualState = env.result(currentManualState, action);
  initialState = currentManualState;
  lastResult = null;
  playback.setSingleState(currentManualState);
  updateSolvabilityBanner(currentManualState);
  syncEditorFromState(currentManualState);
  updateTimeline([]);
  updateTelemetryFromResult(null);
}

function handleStepUpdate({ state, stepIndex, totalSteps, lastAction }) {
  currentManualState = state;
  board2d.render(state);
  board3d.render(state);

  const manh = manhattanDistance(state);
  const conf = conflictCount(state);
  const lin = linearConflictCount(state);
  const misp = misplacedTiles(state);
  const solvedNow = env.goalTest(state);

  $("#telStep").textContent = `${stepIndex} / ${totalSteps}`;
  $("#telPathCost").textContent = String(stepIndex);
  $("#telManhattan").textContent = `${manh} (LC: ${lin}, Misplaced: ${misp})`;

  const confEl = $("#telConflict");
  confEl.textContent = String(conf);
  confEl.classList.toggle("is-zero", conf === 0);

  $("#goalBanner").hidden = !solvedNow;
  $("#stepSummaryLabel").textContent = lastAction
    ? `Step ${stepIndex}: Move blank ${lastAction}`
    : totalSteps > 0
      ? `Initial state (${totalSteps} steps ready)`
      : "Manual / Ready state";

  $$(".timeline-chip").forEach((chip, idx) => {
    chip.classList.toggle("active", idx === stepIndex - 1);
  });
}

function updateTelemetryFromResult(result) {
  const statusEl = $("#telStatusBadge");
  const noticeEl = $("#solverExtraNotice");
  if (!result) {
    $("#telNodes").textContent = "—";
    $("#telElapsed").textContent = "—";
    statusEl.textContent = "Ready";
    statusEl.className = "status-badge";
    noticeEl.textContent = "";
    return;
  }

  $("#telNodes").textContent = `${result.metrics.nodesExpanded.toLocaleString()} exp / ${result.metrics.nodesGenerated.toLocaleString()} gen`;
  $("#telElapsed").textContent = `${result.metrics.elapsedMs.toFixed(2)} ms`;

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
    noticeEl.textContent = `${result.algorithm} stopped with status "${result.status}" (best path length: ${result.pathCost}). Try IDA* or Weighted A* for deeper 4×4 instances.`;
  } else {
    noticeEl.textContent = `${result.algorithm}${result.heuristicName ? ` (${result.heuristicName})` : ""} found solution in ${result.pathCost} moves.`;
  }
}

function updateTimeline(actions) {
  const wrap = $("#timelineChips");
  wrap.innerHTML = "";
  if (!actions || actions.length === 0) {
    wrap.innerHTML = `<span class="muted">No trajectory loaded yet.</span>`;
    return;
  }
  actions.forEach((act, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "timeline-chip";
    btn.title = `Step ${idx + 1}: ${act}`;
    btn.textContent = `${idx + 1}.${actionShortCode(act)}`;
    btn.addEventListener("click", () => playback.jumpTo(idx + 1));
    wrap.appendChild(btn);
  });
}

function updateSolvabilityBanner(state) {
  const { solvable, inversions, blankRowBottom } = isSolvableTiles(state);
  const el = $("#solvabilityIndicator");
  el.textContent = solvable
    ? `Solvable (inversions=${inversions}, blank row from bottom=${blankRowBottom}, parity=${(inversions + blankRowBottom) % 2})`
    : `Unsolvable (inversions=${inversions}, blank row from bottom=${blankRowBottom}, parity=${(inversions + blankRowBottom) % 2})`;
  el.className = `solvability-pill ${solvable ? "solvable-ok" : "solvable-bad"}`;
}

function buildSolverFromUI() {
  const algo = $("#algorithmSelect").value;
  const heuristic = $("#heuristicSelect").value;
  const maxNodes = Number($("#maxNodesInput").value) || 120000;
  const maxTimeMs = Number($("#maxTimeInput").value) || 5000;
  const weight = Number($("#weightInput").value) || 1.5;
  const depthLimit = Number($("#depthLimitInput").value) || 26;
  const beamWidth = Number($("#beamWidthInput").value) || 12;
  const initialTemp = Number($("#saTempInput").value) || 12.0;
  const coolingRate = Number($("#saCoolingInput").value) || 0.995;

  switch (algo) {
    case "bfs":
      return new BFSSolver(env, { maxNodes, maxTimeMs });
    case "ucs":
      return new UCSSolver(env, { maxNodes, maxTimeMs });
    case "dls":
      return new DLSSolver(env, { depthLimit, maxNodes, maxTimeMs });
    case "dfs":
      return new DFSSolver(env, { maxDepth: depthLimit, maxNodes, maxTimeMs });
    case "iddfs":
      return new IDDFSSolver(env, { maxDepth: depthLimit, maxNodes, maxTimeMs });
    case "gbfs":
      return new GreedyBestFirstSolver(env, { heuristic, maxNodes, maxTimeMs });
    case "astar":
      return new AStarSolver(env, { heuristic, maxNodes, maxTimeMs });
    case "wastar":
      return new WeightedAStarSolver(env, { heuristic, weight, maxNodes, maxTimeMs });
    case "idastar":
      return new IDAStarSolver(env, { heuristic, maxNodes: Math.max(maxNodes, 350000), maxTimeMs });
    case "hc_steepest":
      return new HillClimbingSolver(env, { variant: "steepest", heuristic });
    case "hc_stochastic":
      return new HillClimbingSolver(env, { variant: "stochastic", heuristic });
    case "hc_restart":
      return new HillClimbingSolver(env, { variant: "random_restart", heuristic });
    case "sa":
      return new SimulatedAnnealingSolver(env, { heuristic, initialTemp, coolingRate });
    case "beam":
      return new LocalBeamSolver(env, { heuristic, beamWidth });
    case "ga": {
      const fitCfg = new FitnessConfig({
        largeConstant: Number($("#gaLargeConstant").value) || 10000,
        heuristicName: heuristic,
      });
      const gaCfg = new GAConfig({
        populationSize: Number($("#gaPopSize").value) || 50,
        sequenceLength: Number($("#gaSeqLen").value) || 32,
        numGenerations: Number($("#gaGenerations").value) || 120,
        mutationRate: Number($("#gaMutationRate").value) || 0.15,
        crossoverType: $("#gaCrossoverType").value,
        mutationType: $("#gaMutationType").value,
        selectionMethod: $("#gaSelectionMethod").value,
        tournamentK: Number($("#gaTournamentK").value) || 4,
        elitismCount: Number($("#gaElitism").value) || 2,
        seed: Number($("#gaSeed").value) || 42,
        fitnessConfig: fitCfg,
      });
      return new GeneticAlgorithmSolver(env, gaCfg);
    }
    default:
      return new AStarSolver(env, { heuristic });
  }
}

function syncParameterVisibility() {
  const algo = $("#algorithmSelect").value;
  const usesHeuristic = !["bfs", "ucs", "dls", "dfs", "iddfs"].includes(algo);
  $("#heuristicGroup").hidden = !usesHeuristic;
  $("#weightGroup").hidden = algo !== "wastar";
  $("#depthLimitGroup").hidden = !["dls", "dfs", "iddfs"].includes(algo);
  $("#beamWidthGroup").hidden = algo !== "beam";
  $("#saGroup").hidden = algo !== "sa";
  $("#gaParamsPanel").hidden = algo !== "ga";
}

function renderGACharts(result) {
  const fitnessBox = $("#gaFitnessChart");
  const conflictBox = $("#gaConflictChart");
  const tableBody = $("#gaStatsTableBody");

  if (!result || result.algorithm !== "Genetic Algorithm" || !result.history.length) {
    renderLineChart(fitnessBox, { title: "GA Fitness Convergence", series: [] });
    renderLineChart(conflictBox, { title: "GA Conflicts & Path Cost", series: [] });
    tableBody.innerHTML = `<tr><td colspan="6" class="muted">Run the Genetic Algorithm to inspect generation-by-generation telemetry.</td></tr>`;
    return;
  }

  const hist = result.history;
  renderLineChart(fitnessBox, {
    title: "GA Fitness per Generation",
    series: [
      {
        label: "Best Fitness",
        color: "#2563eb",
        points: hist.map((h) => ({ x: h.generation, y: h.best_fitness })),
      },
      {
        label: "Mean Fitness",
        color: "#0ea5e9",
        points: hist.map((h) => ({ x: h.generation, y: h.mean_fitness })),
      },
    ],
  });

  renderLineChart(conflictBox, {
    title: "Min Conflict Count & Best Path Cost",
    series: [
      {
        label: "Min Conflicts",
        color: "#dc2626",
        points: hist.map((h) => ({ x: h.generation, y: h.min_conflicts })),
      },
      {
        label: "Min Distance",
        color: "#f59e0b",
        points: hist.map((h) => ({ x: h.generation, y: h.min_distance })),
      },
      {
        label: "Best Path Cost",
        color: "#10b981",
        points: hist.map((h) => ({ x: h.generation, y: h.best_path_cost })),
      },
    ],
  });

  const step = Math.max(1, Math.floor(hist.length / 15));
  const sampled = hist.filter((_, idx) => idx % step === 0 || idx === hist.length - 1 || hist[idx].goal_reached);
  tableBody.innerHTML = sampled
    .slice(0, 20)
    .map(
      (row) => `
      <tr class="${row.goal_reached ? "row-solved" : ""}">
        <td>${row.generation}</td>
        <td>${row.best_fitness}</td>
        <td>${row.mean_fitness}</td>
        <td>${row.min_conflicts}</td>
        <td>${row.best_path_cost}</td>
        <td>${row.solved_count > 0 ? `Yes (${row.solved_count})` : "No"}</td>
      </tr>`
    )
    .join("");
}

function runSolver() {
  const btn = $("#solveBtn");
  btn.disabled = true;
  btn.textContent = "Solving…";

  setTimeout(() => {
    try {
      const solver = buildSolverFromUI();
      const res = solver.solve(initialState);
      lastResult = res;
      updateTelemetryFromResult(res);
      updateTimeline(res.actions);
      playback.loadTrajectory(initialState, res.actions, env);
      renderGACharts(res);
      if (res.solved && res.actions.length > 0) {
        playback.play();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Solve & Animate";
    }
  }, 15);
}

function runBrowserBenchmarks() {
  const btn = $("#runBenchmarkBtn");
  btn.disabled = true;
  btn.textContent = "Running Benchmark…";

  setTimeout(() => {
    try {
      const benchBoard = initialState;
      const solvers = [
        new BFSSolver(env, { maxNodes: 40000, maxTimeMs: 1200 }),
        new UCSSolver(env, { maxNodes: 40000, maxTimeMs: 1200 }),
        new IDDFSSolver(env, { maxDepth: 16, maxNodes: 60000, maxTimeMs: 1200 }),
        new GreedyBestFirstSolver(env, { heuristic: "linear_conflict", maxNodes: 40000, maxTimeMs: 1200 }),
        new AStarSolver(env, { heuristic: "manhattan", maxNodes: 60000, maxTimeMs: 1500 }),
        new AStarSolver(env, { heuristic: "linear_conflict", maxNodes: 60000, maxTimeMs: 1500 }),
        new WeightedAStarSolver(env, { heuristic: "linear_conflict", weight: 1.5, maxNodes: 60000, maxTimeMs: 1500 }),
        new IDAStarSolver(env, { heuristic: "linear_conflict", maxNodes: 200000, maxTimeMs: 2000 }),
        new HillClimbingSolver(env, { variant: "steepest", heuristic: "linear_conflict" }),
        new SimulatedAnnealingSolver(env, { heuristic: "linear_conflict", maxIterations: 2000 }),
        new LocalBeamSolver(env, { heuristic: "linear_conflict", beamWidth: 12 }),
        new GeneticAlgorithmSolver(
          env,
          new GAConfig({
            populationSize: 50,
            sequenceLength: 28,
            numGenerations: 60,
            selectionMethod: "tournament",
            tournamentK: 4,
            seed: Number($("#gaSeed").value) || 42,
          })
        ),
      ];

      benchmarkResults = solvers.map((s) => s.solve(benchBoard));

      renderBarChart($("#benchCostChart"), {
        title: "Path Cost (Steps)",
        bars: benchmarkResults.map((r) => ({
          label: r.heuristicName ? `${r.algorithm} (${r.heuristicName === "linear_conflict" ? "LC" : r.heuristicName})` : r.algorithm,
          value: r.pathCost,
          solved: r.solved,
          color: r.solved ? "#2563eb" : "#94a3b8",
        })),
      });

      renderBarChart($("#benchNodesChart"), {
        title: "Nodes Expanded / Evaluated",
        bars: benchmarkResults.map((r) => ({
          label: r.heuristicName ? `${r.algorithm} (${r.heuristicName === "linear_conflict" ? "LC" : r.heuristicName})` : r.algorithm,
          value: r.metrics.nodesExpanded,
          solved: r.solved,
          color: r.category === "informed" ? "#10b981" : r.category === "evolutionary" ? "#8b5cf6" : "#f59e0b",
        })),
        valueFormatter: (v) => v.toLocaleString(),
      });

      $("#benchTableBody").innerHTML = benchmarkResults
        .map(
          (r) => `
          <tr>
            <td>${r.algorithm}${r.heuristicName ? ` <span class="muted">(${r.heuristicName})</span>` : ""}</td>
            <td>${r.category}</td>
            <td><span class="status-badge ${r.solved ? "badge-success" : "badge-warn"}">${r.status}</span></td>
            <td>${r.pathCost}</td>
            <td>${r.metrics.nodesExpanded.toLocaleString()}</td>
            <td>${r.metrics.elapsedMs.toFixed(2)} ms</td>
          </tr>`
        )
        .join("");
    } finally {
      btn.disabled = false;
      btn.textContent = "Run Multi-Algorithm Benchmark on Current Board";
    }
  }, 20);
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
  syncEditorFromState(initialState);
}

function syncEditorFromState(state) {
  const cells = $$(".editor-cell");
  state.tiles.forEach((val, idx) => {
    if (cells[idx]) cells[idx].value = String(val);
  });
  $("#editorTextInput").value = state.tiles.join(", ");
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
  initialState = state;
  currentManualState = state;
  lastResult = null;
  playback.setSingleState(state);
  updateSolvabilityBanner(state);
  syncEditorFromState(state);
  updateTimeline([]);
  updateTelemetryFromResult(null);
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
    const payload = {
      exported_at: new Date().toISOString(),
      initial_tiles: Array.from(initialState.tiles),
      last_result: lastResult ? lastResult.toJSON() : null,
      benchmark_results: benchmarkResults.map((r) => r.toJSON()),
    };
    content = JSON.stringify(payload, null, 2);
    filename = "15_puzzle_run_summary.json";
    mime = "application/json";
  } else {
    const rows = (benchmarkResults.length > 0 ? benchmarkResults : [lastResult]).map((r) => [
      r.algorithm,
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
  // Theme toggle
  $("#themeToggleBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    $("#themeToggleBtn").textContent = next === "dark" ? "☀ Light Theme" : "🌙 Dark Theme";
  });

  // Tabs
  $$(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      $$(".nav-tab").forEach((t) => t.classList.toggle("active", t === tab));
      $$(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== target));
    });
  });

  // View modes
  $$(".view-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.view;
      $$(".view-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      $("#boardsStage").dataset.view = mode;
    });
  });

  $("#overlayToggle").addEventListener("change", (e) => {
    board2d.setOverlaysVisible(e.target.checked);
  });

  // 3D camera controls
  $("#camIsoBtn").addEventListener("click", () => board3d.setPreset("isometric"));
  $("#camTopBtn").addEventListener("click", () => board3d.setPreset("top"));
  $("#camLowBtn").addEventListener("click", () => board3d.setPreset("low"));
  $("#camZoomInBtn").addEventListener("click", () => board3d.adjustZoom(0.12));
  $("#camZoomOutBtn").addEventListener("click", () => board3d.adjustZoom(-0.12));

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
    const panel = $("#customEditorPanel");
    panel.hidden = !panel.hidden;
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

  // Solver & export
  $("#algorithmSelect").addEventListener("change", syncParameterVisibility);
  $("#solveBtn").addEventListener("click", runSolver);
  $("#resetInitialBtn").addEventListener("click", () => loadBoard(initialState));
  $("#exportJsonBtn").addEventListener("click", () => exportRun("json"));
  $("#exportCsvBtn").addEventListener("click", () => exportRun("csv"));

  // Playback controls
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
    $("#pbSpeedLabel").textContent = `${ms} ms/step`;
    playback.setSpeed(ms);
  });

  // Benchmarks
  $("#runBenchmarkBtn").addEventListener("click", runBrowserBenchmarks);

  // Keyboard arrow controls
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const map = {
      ArrowUp: Action.UP,
      ArrowDown: Action.DOWN,
      ArrowLeft: Action.LEFT,
      ArrowRight: Action.RIGHT,
    };
    if (map[e.key]) {
      e.preventDefault();
      handleManualAction(map[e.key]);
    }
  });
}

// Initialize app
buildEditorGrid();
wireEvents();
syncParameterVisibility();
loadBoard(initialState);
