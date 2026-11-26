export function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class SearchMetrics {
  constructor({
    nodesExpanded = 0,
    nodesGenerated = 0,
    maxFrontierSize = 0,
    elapsedMs = 0,
    extra = {},
  } = {}) {
    this.nodesExpanded = nodesExpanded;
    this.nodesGenerated = nodesGenerated;
    this.maxFrontierSize = maxFrontierSize;
    this.elapsedMs = elapsedMs;
    this.extra = extra;
  }
}

export class SearchResult {
  constructor({
    algorithm,
    category,
    status,
    solved,
    initialState,
    finalState,
    actions,
    pathCost,
    metrics,
    heuristicName = null,
    history = [],
  }) {
    this.algorithm = algorithm;
    this.category = category;
    this.status = status;
    this.solved = solved;
    this.initialState = initialState;
    this.finalState = finalState;
    this.actions = actions;
    this.pathCost = pathCost;
    this.metrics = metrics;
    this.heuristicName = heuristicName;
    this.history = history;
  }

  toJSON() {
    return {
      algorithm: this.algorithm,
      category: this.category,
      status: this.status,
      solved: this.solved,
      initial_tiles: Array.from(this.initialState.tiles),
      final_tiles: Array.from(this.finalState.tiles),
      actions: this.actions.slice(),
      path_cost: this.pathCost,
      heuristic_name: this.heuristicName,
      metrics: {
        nodes_expanded: this.metrics.nodesExpanded,
        nodes_generated: this.metrics.nodesGenerated,
        max_frontier_size: this.metrics.maxFrontierSize,
        elapsed_ms: Number(this.metrics.elapsedMs.toFixed(3)),
        extra: this.metrics.extra,
      },
      history: this.history,
    };
  }
}

export class Solver {
  constructor(environment) {
    this.env = environment;
    this.name = "BaseSolver";
    this.category = "abstract";
  }

  unsolvableResult(initialState, heuristicName = null) {
    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status: "unsolvable",
      solved: false,
      initialState,
      finalState: initialState,
      actions: [],
      pathCost: 0,
      metrics: new SearchMetrics(),
      heuristicName,
    });
  }
}

/**
 * Binary min-heap priority queue with custom comparator.
 */
export class MinHeap {
  constructor(compareFn) {
    this.data = [];
    this.compare = compareFn;
  }

  get size() {
    return this.data.length;
  }

  peek() {
    return this.data[0];
  }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.compare(this.data[idx], this.data[parent]) >= 0) break;
      [this.data[idx], this.data[parent]] = [this.data[parent], this.data[idx]];
      idx = parent;
    }
  }

  _sinkDown(idx) {
    const n = this.data.length;
    while (true) {
      let smallest = idx;
      const left = idx * 2 + 1;
      const right = left + 1;
      if (left < n && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === idx) break;
      [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
      idx = smallest;
    }
  }
}
