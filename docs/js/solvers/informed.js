import { getHeuristic } from "../core/heuristics.js";
import { Node } from "../core/puzzle.js";
import { MinHeap, SearchMetrics, SearchResult, Solver, nowMs } from "../core/solver_base.js";

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

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, this.heuristicName);
    }
    const start = nowMs();
    const root = new Node(initialState);
    const h0 = this.heuristicFn(initialState);
    let bestNode = root;
    let bestH = h0;

    const heap = new MinHeap((a, b) => {
      if (a.f !== b.f) return a.f - b.f;
      if (a.h !== b.h) return a.h - b.h;
      return a.tie - b.tie;
    });
    heap.push({ f: this.priority(0, h0), h: h0, tie: 0, node: root });
    const bestG = new Map([[initialState.key, 0]]);
    let tie = 1;
    let expanded = 0;
    let generated = 1;
    let maxFrontier = 1;

    while (heap.size > 0) {
      if (expanded >= this.maxNodes || nowMs() - start > this.maxTimeMs) {
        return new SearchResult({
          algorithm: this.name,
          category: this.category,
          status: "limit_reached",
          solved: false,
          initialState,
          finalState: bestNode.state,
          actions: bestNode.reconstructActions(),
          pathCost: bestNode.pathCost,
          heuristicName: this.heuristicName,
          metrics: new SearchMetrics({
            nodesExpanded: expanded,
            nodesGenerated: generated,
            maxFrontierSize: maxFrontier,
            elapsedMs: nowMs() - start,
            extra: { weight: this.weight, best_h: bestH },
          }),
        });
      }

      const { h, node } = heap.pop();
      if (this.usePathCost && node.pathCost > (bestG.get(node.state.key) ?? Infinity)) {
        continue;
      }
      if (h < bestH) {
        bestH = h;
        bestNode = node;
      }
      if (this.env.goalTest(node.state)) {
        return new SearchResult({
          algorithm: this.name,
          category: this.category,
          status: "solved",
          solved: true,
          initialState,
          finalState: node.state,
          actions: node.reconstructActions(),
          pathCost: node.pathCost,
          heuristicName: this.heuristicName,
          metrics: new SearchMetrics({
            nodesExpanded: expanded,
            nodesGenerated: generated,
            maxFrontierSize: maxFrontier,
            elapsedMs: nowMs() - start,
            extra: { weight: this.weight },
          }),
        });
      }

      expanded++;
      for (const child of this.env.expand(node)) {
        const key = child.state.key;
        const prev = bestG.get(key);
        if (this.usePathCost) {
          if (prev !== undefined && child.pathCost >= prev) continue;
          bestG.set(key, child.pathCost);
        } else {
          if (prev !== undefined) continue;
          bestG.set(key, child.pathCost);
        }
        const ch = this.heuristicFn(child.state);
        heap.push({
          f: this.priority(child.pathCost, ch),
          h: ch,
          tie: tie++,
          node: child,
        });
        generated++;
      }
      if (heap.size > maxFrontier) maxFrontier = heap.size;
    }

    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status: "not_found",
      solved: false,
      initialState,
      finalState: bestNode.state,
      actions: bestNode.reconstructActions(),
      pathCost: bestNode.pathCost,
      heuristicName: this.heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: expanded,
        nodesGenerated: generated,
        maxFrontierSize: maxFrontier,
        elapsedMs: nowMs() - start,
      }),
    });
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
      const children = this.env.expand(node);
      const scored = [];
      for (const child of children) {
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
        return new SearchResult({
          algorithm: this.name,
          category: this.category,
          status: "solved",
          solved: true,
          initialState,
          finalState: solutionNode.state,
          actions: solutionNode.reconstructActions(),
          pathCost: solutionNode.pathCost,
          heuristicName: this.heuristicName,
          metrics: new SearchMetrics({
            nodesExpanded: expanded,
            nodesGenerated: generated,
            maxFrontierSize: maxDepthReached + 1,
            elapsedMs: nowMs() - start,
            extra: { thresholds },
          }),
        });
      }
      if (aborted || nextBound === Infinity) {
        return new SearchResult({
          algorithm: this.name,
          category: this.category,
          status: aborted ? "limit_reached" : "not_found",
          solved: false,
          initialState,
          finalState: initialState,
          actions: [],
          pathCost: 0,
          heuristicName: this.heuristicName,
          metrics: new SearchMetrics({
            nodesExpanded: expanded,
            nodesGenerated: generated,
            maxFrontierSize: maxDepthReached + 1,
            elapsedMs: nowMs() - start,
            extra: { thresholds },
          }),
        });
      }
      threshold = nextBound;
    }
  }
}
