import { Node } from "../core/puzzle.js";
import { MinHeap, SearchMetrics, SearchResult, Solver, nowMs } from "../core/solver_base.js";

function makeResult(
  solver,
  status,
  solved,
  initialState,
  bestNode,
  nodesExpanded,
  nodesGenerated,
  maxFrontier,
  startMs,
  extra = {}
) {
  const actions = bestNode.reconstructActions();
  return new SearchResult({
    algorithm: solver.name,
    category: solver.category,
    status,
    solved,
    initialState,
    finalState: bestNode.state,
    actions,
    pathCost: bestNode.pathCost,
    metrics: new SearchMetrics({
      nodesExpanded,
      nodesGenerated,
      maxFrontierSize: maxFrontier,
      elapsedMs: nowMs() - startMs,
      extra,
    }),
  });
}

export class BFSSolver extends Solver {
  constructor(environment, { maxNodes = 100000, maxTimeMs = 5000 } = {}) {
    super(environment);
    this.name = "BFS";
    this.category = "uninformed";
    this.maxNodes = maxNodes;
    this.maxTimeMs = maxTimeMs;
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState);
    }
    const start = nowMs();
    const root = new Node(initialState);
    if (this.env.goalTest(initialState)) {
      return makeResult(this, "solved", true, initialState, root, 0, 1, 1, start);
    }

    const queue = [root];
    let head = 0;
    const visited = new Set([initialState.key]);
    let expanded = 0;
    let generated = 1;
    let maxFrontier = 1;

    while (head < queue.length) {
      if (expanded >= this.maxNodes || nowMs() - start > this.maxTimeMs) {
        return makeResult(
          this, "limit_reached", false, initialState, queue[head],
          expanded, generated, maxFrontier, start
        );
      }
      const node = queue[head++];
      expanded++;
      for (const child of this.env.expand(node)) {
        if (visited.has(child.state.key)) continue;
        generated++;
        if (this.env.goalTest(child.state)) {
          return makeResult(
            this, "solved", true, initialState, child,
            expanded, generated, maxFrontier, start
          );
        }
        visited.add(child.state.key);
        queue.push(child);
        const activeSize = queue.length - head;
        if (activeSize > maxFrontier) maxFrontier = activeSize;
      }
    }

    return makeResult(this, "not_found", false, initialState, root, expanded, generated, maxFrontier, start);
  }
}

export class UCSSolver extends Solver {
  constructor(environment, { maxNodes = 100000, maxTimeMs = 5000 } = {}) {
    super(environment);
    this.name = "UCS";
    this.category = "uninformed";
    this.maxNodes = maxNodes;
    this.maxTimeMs = maxTimeMs;
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState);
    }
    const start = nowMs();
    const root = new Node(initialState);
    const heap = new MinHeap((a, b) => (a.g !== b.g ? a.g - b.g : a.tie - b.tie));
    heap.push({ g: 0, tie: 0, node: root });
    const bestCost = new Map([[initialState.key, 0]]);
    let tie = 1;
    let expanded = 0;
    let generated = 1;
    let maxFrontier = 1;

    while (heap.size > 0) {
      if (expanded >= this.maxNodes || nowMs() - start > this.maxTimeMs) {
        return makeResult(
          this, "limit_reached", false, initialState, heap.peek().node,
          expanded, generated, maxFrontier, start
        );
      }
      const { g, node } = heap.pop();
      if (g > (bestCost.get(node.state.key) ?? Infinity)) continue;
      if (this.env.goalTest(node.state)) {
        return makeResult(this, "solved", true, initialState, node, expanded, generated, maxFrontier, start);
      }
      expanded++;
      for (const child of this.env.expand(node)) {
        const key = child.state.key;
        const prev = bestCost.get(key);
        if (prev === undefined || child.pathCost < prev) {
          bestCost.set(key, child.pathCost);
          heap.push({ g: child.pathCost, tie: tie++, node: child });
          generated++;
        }
      }
      if (heap.size > maxFrontier) maxFrontier = heap.size;
    }

    return makeResult(this, "not_found", false, initialState, root, expanded, generated, maxFrontier, start);
  }
}

function runDepthLimited(env, initialState, depthLimit, maxNodes, deadlineMs) {
  const root = new Node(initialState);
  const stack = [root];
  const bestDepth = new Map([[initialState.key, 0]]);
  let expanded = 0;
  let generated = 1;
  let maxStack = 1;
  let cutoffOccurred = false;
  let bestSeen = root;

  while (stack.length > 0) {
    if (expanded >= maxNodes || nowMs() > deadlineMs) {
      return { status: "limit_reached", node: bestSeen, expanded, generated, maxStack };
    }
    const node = stack.pop();
    if (env.goalTest(node.state)) {
      return { status: "solved", node, expanded, generated, maxStack };
    }
    if (node.depth >= depthLimit) {
      cutoffOccurred = true;
      bestSeen = node;
      continue;
    }
    expanded++;
    const children = env.expand(node);
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const prevDepth = bestDepth.get(child.state.key);
      if (prevDepth === undefined || child.depth < prevDepth) {
        bestDepth.set(child.state.key, child.depth);
        stack.push(child);
        generated++;
      }
    }
    if (stack.length > maxStack) maxStack = stack.length;
  }

  return {
    status: cutoffOccurred ? "cutoff" : "not_found",
    node: bestSeen,
    expanded,
    generated,
    maxStack,
  };
}

export class DLSSolver extends Solver {
  constructor(environment, { depthLimit = 20, maxNodes = 100000, maxTimeMs = 5000 } = {}) {
    super(environment);
    this.name = "DLS";
    this.category = "uninformed";
    this.depthLimit = depthLimit;
    this.maxNodes = maxNodes;
    this.maxTimeMs = maxTimeMs;
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState);
    }
    const start = nowMs();
    const res = runDepthLimited(this.env, initialState, this.depthLimit, this.maxNodes, start + this.maxTimeMs);
    return makeResult(
      this, res.status, res.status === "solved", initialState, res.node,
      res.expanded, res.generated, res.maxStack, start,
      { depth_limit: this.depthLimit }
    );
  }
}

export class DFSSolver extends DLSSolver {
  constructor(environment, { maxDepth = 30, maxNodes = 100000, maxTimeMs = 5000 } = {}) {
    super(environment, { depthLimit: maxDepth, maxNodes, maxTimeMs });
    this.name = "DFS";
  }
}

export class IDDFSSolver extends Solver {
  constructor(environment, { maxDepth = 40, maxNodes = 200000, maxTimeMs = 5000 } = {}) {
    super(environment);
    this.name = "IDDFS";
    this.category = "uninformed";
    this.maxDepth = maxDepth;
    this.maxNodes = maxNodes;
    this.maxTimeMs = maxTimeMs;
  }

  solve(initialState) {
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState);
    }
    const start = nowMs();
    const deadline = start + this.maxTimeMs;
    let totalExpanded = 0;
    let totalGenerated = 0;
    let maxStack = 1;
    let lastNode = new Node(initialState);

    for (let depth = 0; depth <= this.maxDepth; depth++) {
      const remNodes = Math.max(1, this.maxNodes - totalExpanded);
      const res = runDepthLimited(this.env, initialState, depth, remNodes, deadline);
      totalExpanded += res.expanded;
      totalGenerated += res.generated;
      if (res.maxStack > maxStack) maxStack = res.maxStack;
      lastNode = res.node;

      if (res.status === "solved") {
        return makeResult(
          this, "solved", true, initialState, res.node,
          totalExpanded, totalGenerated, maxStack, start,
          { solved_depth: depth }
        );
      }
      if (res.status === "limit_reached" || totalExpanded >= this.maxNodes || nowMs() > deadline) {
        return makeResult(
          this, "limit_reached", false, initialState, lastNode,
          totalExpanded, totalGenerated, maxStack, start,
          { last_depth: depth }
        );
      }
      if (res.status === "not_found") {
        return makeResult(
          this, "not_found", false, initialState, lastNode,
          totalExpanded, totalGenerated, maxStack, start
        );
      }
    }

    return makeResult(
      this, "cutoff", false, initialState, lastNode,
      totalExpanded, totalGenerated, maxStack, start,
      { max_depth: this.maxDepth }
    );
  }
}
