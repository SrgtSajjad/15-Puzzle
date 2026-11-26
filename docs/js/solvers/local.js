import { getHeuristic } from "../core/heuristics.js";
import { Node } from "../core/puzzle.js";
import { SeededRNG } from "../core/rng.js";
import { SearchMetrics, SearchResult, Solver, nowMs } from "../core/solver_base.js";

export class HillClimbingSolver extends Solver {
  constructor(
    environment,
    {
      variant = "steepest",
      heuristic = "linear_conflict",
      maxSteps = 300,
      maxSideways = 15,
      maxRestarts = 10,
      restartWalkLength = 8,
      seed = 42,
    } = {}
  ) {
    super(environment);
    const v = String(variant).toLowerCase();
    if (!["steepest", "stochastic", "random_restart"].includes(v)) {
      throw new Error(`Unknown Hill Climbing variant: ${variant}`);
    }
    this.variant = v;
    this.category = "local";
    const title = v.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    this.name = `Hill Climbing (${title})`;
    this.heuristicName = heuristic;
    this.heuristicFn = getHeuristic(heuristic);
    this.maxSteps = maxSteps;
    this.maxSideways = maxSideways;
    this.maxRestarts = maxRestarts;
    this.restartWalkLength = restartWalkLength;
    this.rng = new SeededRNG(seed);
  }

  _climbFrom(startState, prefixActions, stepBudget) {
    let state = startState;
    const actions = prefixActions.slice();
    let currentH = this.heuristicFn(state);
    let bestState = state;
    let bestH = currentH;
    let bestActions = actions.slice();
    let lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
    let sideways = 0;
    let expanded = 0;
    let generated = 0;

    for (let step = 0; step < stepBudget; step++) {
      if (this.env.goalTest(state)) {
        return { solved: true, state, actions, expanded, generated, bestH: 0 };
      }
      expanded++;
      let valid = this.env.validActions(state, lastAction);
      if (valid.length === 0) valid = this.env.validActions(state);

      const neighbors = valid.map((act) => {
        const nxt = this.env.result(state, act);
        generated++;
        return { h: this.heuristicFn(nxt), act, nxt };
      });
      const minH = Math.min(...neighbors.map((n) => n.h));
      const bestNeighbors = neighbors.filter((n) => n.h === minH);

      let chosen;
      if (this.variant === "stochastic") {
        const improving = neighbors.filter((n) => n.h < currentH);
        if (improving.length > 0) {
          chosen = this.rng.choice(improving);
        } else if (minH === currentH && sideways < this.maxSideways) {
          chosen = this.rng.choice(bestNeighbors);
          sideways++;
        } else {
          break;
        }
      } else {
        if (minH > currentH) break;
        if (minH === currentH) {
          if (sideways >= this.maxSideways) break;
          sideways++;
        } else {
          sideways = 0;
        }
        chosen = this.rng.choice(bestNeighbors);
      }

      state = chosen.nxt;
      actions.push(chosen.act);
      lastAction = chosen.act;
      currentH = chosen.h;
      if (chosen.h < bestH) {
        bestH = chosen.h;
        bestState = state;
        bestActions = actions.slice();
      }
      if (this.env.goalTest(state)) {
        return { solved: true, state, actions, expanded, generated, bestH: 0 };
      }
    }

    return {
      solved: false,
      state: bestState,
      actions: bestActions,
      expanded,
      generated,
      bestH,
    };
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const start = nowMs();
    let totalExpanded = 0;
    let totalGenerated = 0;
    let globalBestState = initialState;
    let globalBestActions = [];
    let globalBestH = this.heuristicFn(initialState);

    const restarts = this.variant === "random_restart" ? this.maxRestarts : 0;
    for (let attempt = 0; attempt <= restarts; attempt++) {
      const prefix = [];
      let seedState = initialState;
      if (attempt > 0) {
        let lastAct = null;
        for (let w = 0; w < this.restartWalkLength; w++) {
          let choices = this.env.validActions(seedState, lastAct);
          if (choices.length === 0) choices = this.env.validActions(seedState);
          const act = this.rng.choice(choices);
          seedState = this.env.result(seedState, act);
          prefix.push(act);
          lastAct = act;
          totalGenerated++;
          if (this.env.goalTest(seedState)) {
            return new SearchResult({
              algorithm: this.name,
              category: this.category,
              status: "solved",
              solved: true,
              initialState,
              finalState: seedState,
              actions: prefix,
              pathCost: prefix.length,
              heuristicName: this.heuristicName,
              metrics: new SearchMetrics({
                nodesExpanded: totalExpanded,
                nodesGenerated: totalGenerated,
                maxFrontierSize: 1,
                elapsedMs: nowMs() - start,
                extra: { restarts: attempt },
              }),
            });
          }
        }
      }

      const climb = this._climbFrom(seedState, prefix, this.maxSteps);
      totalExpanded += climb.expanded;
      totalGenerated += climb.generated;
      if (climb.solved) {
        return new SearchResult({
          algorithm: this.name,
          category: this.category,
          status: "solved",
          solved: true,
          initialState,
          finalState: climb.state,
          actions: climb.actions,
          pathCost: climb.actions.length,
          heuristicName: this.heuristicName,
          metrics: new SearchMetrics({
            nodesExpanded: totalExpanded,
            nodesGenerated: totalGenerated,
            maxFrontierSize: 1,
            elapsedMs: nowMs() - start,
            extra: { restarts: attempt },
          }),
        });
      }
      if (climb.bestH < globalBestH) {
        globalBestH = climb.bestH;
        globalBestState = climb.state;
        globalBestActions = climb.actions;
      }
    }

    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status: "local_optimum",
      solved: false,
      initialState,
      finalState: globalBestState,
      actions: globalBestActions,
      pathCost: globalBestActions.length,
      heuristicName: this.heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: totalExpanded,
        nodesGenerated: totalGenerated,
        maxFrontierSize: 1,
        elapsedMs: nowMs() - start,
        extra: { best_h: globalBestH, restarts },
      }),
    });
  }
}

export class SimulatedAnnealingSolver extends Solver {
  constructor(
    environment,
    {
      heuristic = "linear_conflict",
      initialTemp = 12.0,
      coolingRate = 0.995,
      minTemp = 0.05,
      maxIterations = 3000,
      seed = 42,
    } = {}
  ) {
    super(environment);
    this.name = "Simulated Annealing";
    this.category = "local";
    this.heuristicName = heuristic;
    this.heuristicFn = getHeuristic(heuristic);
    this.initialTemp = initialTemp;
    this.coolingRate = coolingRate;
    this.minTemp = minTemp;
    this.maxIterations = maxIterations;
    this.rng = new SeededRNG(seed);
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const start = nowMs();
    let state = initialState;
    let currentH = this.heuristicFn(state);
    const actions = [];
    let bestState = state;
    let bestH = currentH;
    let bestActions = [];
    let lastAction = null;
    let temp = this.initialTemp;
    let expanded = 0;
    let generated = 1;

    if (this.env.goalTest(state)) {
      return new SearchResult({
        algorithm: this.name,
        category: this.category,
        status: "solved",
        solved: true,
        initialState,
        finalState: state,
        actions: [],
        pathCost: 0,
        heuristicName: this.heuristicName,
        metrics: new SearchMetrics({ nodesGenerated: 1, maxFrontierSize: 1, elapsedMs: nowMs() - start }),
      });
    }

    for (let i = 0; i < this.maxIterations; i++) {
      if (temp < this.minTemp) break;
      expanded++;
      let choices = this.env.validActions(state, lastAction);
      if (choices.length === 0) choices = this.env.validActions(state);
      const act = this.rng.choice(choices);
      const nxt = this.env.result(state, act);
      generated++;
      const nxtH = this.heuristicFn(nxt);
      const delta = nxtH - currentH;

      if (delta <= 0 || this.rng.random() < Math.exp(-delta / Math.max(temp, 1e-9))) {
        state = nxt;
        currentH = nxtH;
        actions.push(act);
        lastAction = act;
        if (nxtH < bestH) {
          bestH = nxtH;
          bestState = state;
          bestActions = actions.slice();
        }
        if (this.env.goalTest(state)) {
          return new SearchResult({
            algorithm: this.name,
            category: this.category,
            status: "solved",
            solved: true,
            initialState,
            finalState: state,
            actions,
            pathCost: actions.length,
            heuristicName: this.heuristicName,
            metrics: new SearchMetrics({
              nodesExpanded: expanded,
              nodesGenerated: generated,
              maxFrontierSize: 1,
              elapsedMs: nowMs() - start,
              extra: { final_temp: Number(temp.toFixed(4)) },
            }),
          });
        }
      }
      temp *= this.coolingRate;
    }

    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status: "local_optimum",
      solved: false,
      initialState,
      finalState: bestState,
      actions: bestActions,
      pathCost: bestActions.length,
      heuristicName: this.heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: expanded,
        nodesGenerated: generated,
        maxFrontierSize: 1,
        elapsedMs: nowMs() - start,
        extra: { best_h: bestH, final_temp: Number(temp.toFixed(4)) },
      }),
    });
  }
}

export class LocalBeamSolver extends Solver {
  constructor(
    environment,
    { heuristic = "linear_conflict", beamWidth = 12, maxSteps = 200 } = {}
  ) {
    super(environment);
    this.name = "Local Beam Search";
    this.category = "local";
    this.heuristicName = heuristic;
    this.heuristicFn = getHeuristic(heuristic);
    this.beamWidth = Math.max(1, beamWidth);
    this.maxSteps = maxSteps;
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const start = nowMs();
    const root = new Node(initialState);
    const h0 = this.heuristicFn(initialState);
    if (this.env.goalTest(initialState)) {
      return new SearchResult({
        algorithm: this.name,
        category: this.category,
        status: "solved",
        solved: true,
        initialState,
        finalState: initialState,
        actions: [],
        pathCost: 0,
        heuristicName: this.heuristicName,
        metrics: new SearchMetrics({ nodesGenerated: 1, maxFrontierSize: 1, elapsedMs: nowMs() - start }),
      });
    }

    let beam = [{ h: h0, node: root }];
    const seen = new Set([initialState.key]);
    let bestH = h0;
    let bestNode = root;
    let expanded = 0;
    let generated = 1;

    for (let step = 0; step < this.maxSteps; step++) {
      const candidates = [];
      let tie = 0;
      for (const { node } of beam) {
        expanded++;
        for (const child of this.env.expand(node)) {
          if (seen.has(child.state.key)) continue;
          seen.add(child.state.key);
          generated++;
          if (this.env.goalTest(child.state)) {
            return new SearchResult({
              algorithm: this.name,
              category: this.category,
              status: "solved",
              solved: true,
              initialState,
              finalState: child.state,
              actions: child.reconstructActions(),
              pathCost: child.pathCost,
              heuristicName: this.heuristicName,
              metrics: new SearchMetrics({
                nodesExpanded: expanded,
                nodesGenerated: generated,
                maxFrontierSize: this.beamWidth,
                elapsedMs: nowMs() - start,
                extra: { beam_width: this.beamWidth },
              }),
            });
          }
          const ch = this.heuristicFn(child.state);
          if (ch < bestH) {
            bestH = ch;
            bestNode = child;
          }
          candidates.push({ h: ch, tie: tie++, node: child });
        }
      }
      if (candidates.length === 0) break;
      candidates.sort((a, b) => (a.h !== b.h ? a.h - b.h : a.tie - b.tie));
      beam = candidates.slice(0, this.beamWidth).map((c) => ({ h: c.h, node: c.node }));
    }

    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status: "local_optimum",
      solved: false,
      initialState,
      finalState: bestNode.state,
      actions: bestNode.reconstructActions(),
      pathCost: bestNode.pathCost,
      heuristicName: this.heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: expanded,
        nodesGenerated: generated,
        maxFrontierSize: this.beamWidth,
        elapsedMs: nowMs() - start,
        extra: { best_h: bestH, beam_width: this.beamWidth },
      }),
    });
  }
}
