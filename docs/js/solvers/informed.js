import { getHeuristic } from "../core/heuristics.js";
import { Node } from "../core/puzzle.js";
import { MinHeap, SearchMetrics, SearchResult, Solver, nowMs } from "../core/solver_base.js";

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class BestFirstBase extends Solver {
  constructor(
    environment,
    {
      heuristic = "linear_conflict",
      weight = 1.0,
      usePathCost = true,
      maxNodes = 150000,
      maxTimeMs = 5000,
    } = {}
  ) {
    super(environment);
    this.category = "informed";
    this.heuristicName = heuristic;
    this.heuristicFn = getHeuristic(heuristic);
    this.weight = Number(weight);
    this.usePathCost = usePathCost;
    this.maxNodes = maxNodes;
    this.maxTimeMs = maxTimeMs;
  }

  priority(g, h) {
    return (this.usePathCost ? g : 0) + this.weight * h;
  }

  _createState(initialState) {
    const start = nowMs();
    const root = new Node(initialState);
    const h0 = this.heuristicFn(initialState);
    const heap = new MinHeap((a, b) => {
      if (a.f !== b.f) return a.f - b.f;
      if (a.h !== b.h) return a.h - b.h;
      return a.tie - b.tie;
    });
    heap.push({ f: this.priority(0, h0), h: h0, tie: 0, node: root });
    return {
      start,
      root,
      bestNode: root,
      bestH: h0,
      heap,
      bestG: new Map([[initialState.key, 0]]),
      tie: 1,
      expanded: 0,
      generated: 1,
      maxFrontier: 1,
    };
  }

  _buildResult(initialState, ctx, status, solved, extra = {}) {
    const finalNode = status === "solved" ? ctx.solvedNode : ctx.bestNode;
    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status,
      solved,
      initialState,
      finalState: finalNode.state,
      actions: finalNode.reconstructActions(),
      pathCost: finalNode.pathCost,
      heuristicName: this.heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: ctx.expanded,
        nodesGenerated: ctx.generated,
        maxFrontierSize: ctx.maxFrontier,
        elapsedMs: nowMs() - ctx.start,
        extra: { weight: this.weight, best_h: ctx.bestH, ...extra },
      }),
    });
  }

  _stepNode(ctx) {
    const { h, node } = ctx.heap.pop();
    if (this.usePathCost && node.pathCost > (ctx.bestG.get(node.state.key) ?? Infinity)) {
      return null;
    }
    if (h < ctx.bestH) {
      ctx.bestH = h;
      ctx.bestNode = node;
    }
    if (this.env.goalTest(node.state)) {
      ctx.solvedNode = node;
      return "solved";
    }
    ctx.expanded++;
    for (const child of this.env.expand(node)) {
      const key = child.state.key;
      const prev = ctx.bestG.get(key);
      if (this.usePathCost) {
        if (prev !== undefined && child.pathCost >= prev) continue;
        ctx.bestG.set(key, child.pathCost);
      } else {
        if (prev !== undefined) continue;
        ctx.bestG.set(key, child.pathCost);
      }
      const ch = this.heuristicFn(child.state);
      ctx.heap.push({
        f: this.priority(child.pathCost, ch),
        h: ch,
        tie: ctx.tie++,
        node: child,
      });
      ctx.generated++;
    }
    if (ctx.heap.size > ctx.maxFrontier) ctx.maxFrontier = ctx.heap.size;
    return null;
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const ctx = this._createState(initialState);
    while (ctx.heap.size > 0) {
      if (ctx.expanded >= this.maxNodes || nowMs() - ctx.start > this.maxTimeMs) {
        return this._buildResult(initialState, ctx, "limit_reached", false);
      }
      if (this._stepNode(ctx) === "solved") {
        return this._buildResult(initialState, ctx, "solved", true);
      }
    }
    return this._buildResult(initialState, ctx, "not_found", false);
  }

  async solveAsync(initialState, { signal = null, onProgress = null, chunkSize = 2500 } = {}) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const ctx = this._createState(initialState);
    let sinceYield = 0;

    while (ctx.heap.size > 0) {
      if (signal?.aborted) {
        return this._buildResult(initialState, ctx, "terminated", false);
      }
      if (ctx.expanded >= this.maxNodes || nowMs() - ctx.start > this.maxTimeMs) {
        return this._buildResult(initialState, ctx, "limit_reached", false);
      }
      if (this._stepNode(ctx) === "solved") {
        return this._buildResult(initialState, ctx, "solved", true);
      }
      if (++sinceYield >= chunkSize) {
        sinceYield = 0;
        if (onProgress) {
          onProgress({
            algorithm: this.name,
            nodesExpanded: ctx.expanded,
            nodesGenerated: ctx.generated,
            bestH: ctx.bestH,
            elapsedMs: nowMs() - ctx.start,
          });
        }
        await yieldToEventLoop();
      }
    }
    return this._buildResult(initialState, ctx, "not_found", false);
  }
}

export class GreedyBestFirstSolver extends BestFirstBase {
  constructor(environment, opts = {}) {
    super(environment, { ...opts, weight: 1.0, usePathCost: false });
    this.name = "Greedy Best-First";
  }
}

export class AStarSolver extends BestFirstBase {
  constructor(environment, opts = {}) {
    super(environment, { ...opts, weight: 1.0, usePathCost: true });
    this.name = "A*";
  }
}

export class WeightedAStarSolver extends BestFirstBase {
  constructor(environment, opts = {}) {
    const w = opts.weight !== undefined ? Number(opts.weight) : 1.5;
    if (w < 1.0) throw new Error("Weighted A* weight must be >= 1.0");
    super(environment, { ...opts, weight: w, usePathCost: true });
    this.name = "Weighted A*";
  }
}

export class IDAStarSolver extends Solver {
  constructor(
    environment,
    { heuristic = "linear_conflict", maxNodes = 500000, maxTimeMs = 8000 } = {}
  ) {
    super(environment);
    this.name = "IDA*";
    this.category = "informed";
    this.heuristicName = heuristic;
    this.heuristicFn = getHeuristic(heuristic);
    this.maxNodes = maxNodes;
    this.maxTimeMs = maxTimeMs;
  }

  _buildResult(initialState, status, solved, finalState, actions, pathCost, expanded, generated, maxDepth, start, thresholds) {
    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status,
      solved,
      initialState,
      finalState,
      actions,
      pathCost,
      heuristicName: this.heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: expanded,
        nodesGenerated: generated,
        maxFrontierSize: maxDepth + 1,
        elapsedMs: nowMs() - start,
        extra: { thresholds },
      }),
    });
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const start = nowMs();
    const deadline = start + this.maxTimeMs;
    const root = new Node(initialState);
    let threshold = this.heuristicFn(initialState);
    let expanded = 0;
    let generated = 1;
    let maxDepthReached = 0;
    const onPath = new Set([initialState.key]);
    let aborted = false;
    let solutionNode = null;
    const thresholds = [];

    const dfs = (node, g, bound) => {
      if (expanded >= this.maxNodes || nowMs() > deadline) {
        aborted = true;
        return -1;
      }
      if (node.depth > maxDepthReached) maxDepthReached = node.depth;
      const h = this.heuristicFn(node.state);
      const f = g + h;
      if (f > bound) return f;
      if (this.env.goalTest(node.state)) {
        solutionNode = node;
        return 0;
      }
      expanded++;
      let minExcess = Infinity;
      const scored = [];
      for (const child of this.env.expand(node)) {
        if (!onPath.has(child.state.key)) {
          scored.push({ h: this.heuristicFn(child.state), child });
        }
      }
      scored.sort((a, b) => a.h - b.h);

      for (const { child } of scored) {
        generated++;
        const key = child.state.key;
        onPath.add(key);
        const res = dfs(child, g + 1, bound);
        if (solutionNode !== null || aborted) return res;
        onPath.delete(key);
        if (res < minExcess) minExcess = res;
      }
      return minExcess;
    };

    while (true) {
      thresholds.push(threshold);
      const nextBound = dfs(root, 0, threshold);
      if (solutionNode !== null) {
        return this._buildResult(
          initialState, "solved", true, solutionNode.state,
          solutionNode.reconstructActions(), solutionNode.pathCost,
          expanded, generated, maxDepthReached, start, thresholds
        );
      }
      if (aborted || nextBound === Infinity) {
        return this._buildResult(
          initialState, aborted ? "limit_reached" : "not_found", false,
          initialState, [], 0, expanded, generated, maxDepthReached, start, thresholds
        );
      }
      threshold = nextBound;
    }
  }

  async solveAsync(initialState, { signal = null, onProgress = null, chunkSize = 3500 } = {}) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const start = nowMs();
    const deadline = start + this.maxTimeMs;
    const root = new Node(initialState);
    let threshold = this.heuristicFn(initialState);
    let expanded = 0;
    let generated = 1;
    let maxDepthReached = 0;
    const thresholds = [];
    let sinceYield = 0;

    while (true) {
      thresholds.push(threshold);
      const onPath = new Set([initialState.key]);
      const stack = [{ node: root, g: 0, childIdx: 0, scored: null, minExcess: Infinity }];
      let nextBound = Infinity;
      let solutionNode = null;
      let statusAbort = null;

      while (stack.length > 0) {
        if (signal?.aborted) {
          statusAbort = "terminated";
          break;
        }
        if (expanded >= this.maxNodes || nowMs() > deadline) {
          statusAbort = "limit_reached";
          break;
        }

        const frame = stack[stack.length - 1];
        if (frame.node.depth > maxDepthReached) maxDepthReached = frame.node.depth;

        if (frame.scored === null) {
          const h = this.heuristicFn(frame.node.state);
          const f = frame.g + h;
          if (f > threshold) {
            stack.pop();
            if (frame.node !== root) onPath.delete(frame.node.state.key);
            if (stack.length > 0) {
              const parent = stack[stack.length - 1];
              if (f < parent.minExcess) parent.minExcess = f;
            } else {
              nextBound = f;
            }
            continue;
          }
          if (this.env.goalTest(frame.node.state)) {
            solutionNode = frame.node;
            break;
          }
          expanded++;
          sinceYield++;
          const scored = [];
          for (const child of this.env.expand(frame.node)) {
            if (!onPath.has(child.state.key)) {
              scored.push({ h: this.heuristicFn(child.state), child });
            }
          }
          scored.sort((a, b) => a.h - b.h);
          frame.scored = scored;
        }

        if (frame.childIdx < frame.scored.length) {
          const child = frame.scored[frame.childIdx++].child;
          generated++;
          onPath.add(child.state.key);
          stack.push({ node: child, g: frame.g + 1, childIdx: 0, scored: null, minExcess: Infinity });
        } else {
          stack.pop();
          if (frame.node !== root) onPath.delete(frame.node.state.key);
          if (stack.length > 0) {
            const parent = stack[stack.length - 1];
            if (frame.minExcess < parent.minExcess) parent.minExcess = frame.minExcess;
          } else {
            nextBound = frame.minExcess;
          }
        }

        if (sinceYield >= chunkSize) {
          sinceYield = 0;
          if (onProgress) {
            onProgress({
              algorithm: this.name,
              threshold,
              nodesExpanded: expanded,
              nodesGenerated: generated,
              elapsedMs: nowMs() - start,
            });
          }
          await yieldToEventLoop();
        }
      }

      if (solutionNode !== null) {
        return this._buildResult(
          initialState, "solved", true, solutionNode.state,
          solutionNode.reconstructActions(), solutionNode.pathCost,
          expanded, generated, maxDepthReached, start, thresholds
        );
      }
      if (statusAbort || nextBound === Infinity) {
        return this._buildResult(
          initialState, statusAbort || "not_found", false,
          initialState, [], 0, expanded, generated, maxDepthReached, start, thresholds
        );
      }
      threshold = nextBound;
    }
  }
}
