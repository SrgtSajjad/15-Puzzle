"""Informed (heuristic) search algorithms: Greedy Best-First, A*, Weighted A*, IDA*."""

from __future__ import annotations

import heapq
import time
from typing import Callable, Optional

from ..environment import PuzzleEnvironment
from ..heuristics import HeuristicFn, get_heuristic
from ..solver_base import SearchMetrics, SearchResult, Solver
from ..state import Node, PuzzleState


class _BestFirstBase(Solver):
    """Shared priority-queue best-first search driver for GBFS, A*, and Weighted A*."""

    category = "informed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        weight: float = 1.0,
        use_path_cost: bool = True,
        max_nodes: int = 150_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(environment)
        self.heuristic_name = heuristic
        self.heuristic_fn: HeuristicFn = get_heuristic(heuristic)
        self.weight = weight
        self.use_path_cost = use_path_cost
        self.max_nodes = max_nodes
        self.max_time_ms = max_time_ms

    def _priority(self, g: int, h: int) -> float:
        return (g if self.use_path_cost else 0) + self.weight * h

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state, heuristic_name=self.heuristic_name)

        start = time.perf_counter()
        root = Node(state=initial_state)
        h0 = self.heuristic_fn(initial_state)
        best_node = root
        best_h = h0

        # Heap tuple: (f, h, tie_id, node) -> prefers lower h when f ties
        heap: list[tuple[float, int, int, Node]] = [(self._priority(0, h0), h0, 0, root)]
        best_g: dict[tuple[int, ...], int] = {initial_state.tiles: 0}
        tie = 1
        expanded = 0
        generated = 1
        max_frontier = 1

        while heap:
            if expanded >= self.max_nodes or (time.perf_counter() - start) * 1000.0 > self.max_time_ms:
                return SearchResult(
                    algorithm=self.name,
                    category=self.category,
                    status="limit_reached",
                    solved=False,
                    initial_state=initial_state,
                    final_state=best_node.state,
                    actions=best_node.reconstruct_actions(),
                    path_cost=best_node.path_cost,
                    heuristic_name=self.heuristic_name,
                    metrics=SearchMetrics(
                        nodes_expanded=expanded,
                        nodes_generated=generated,
                        max_frontier_size=max_frontier,
                        elapsed_ms=(time.perf_counter() - start) * 1000.0,
                        extra={"weight": self.weight, "best_h": best_h},
                    ),
                )

            _, h_val, _, node = heapq.heappop(heap)
            if self.use_path_cost and node.path_cost > best_g.get(node.state.tiles, node.path_cost + 1):
                continue

            if h_val < best_h:
                best_h = h_val
                best_node = node

            if self.env.goal_test(node.state):
                return SearchResult(
                    algorithm=self.name,
                    category=self.category,
                    status="solved",
                    solved=True,
                    initial_state=initial_state,
                    final_state=node.state,
                    actions=node.reconstruct_actions(),
                    path_cost=node.path_cost,
                    heuristic_name=self.heuristic_name,
                    metrics=SearchMetrics(
                        nodes_expanded=expanded,
                        nodes_generated=generated,
                        max_frontier_size=max_frontier,
                        elapsed_ms=(time.perf_counter() - start) * 1000.0,
                        extra={"weight": self.weight},
                    ),
                )

            expanded += 1
            for child in self.env.expand(node):
                key = child.state.tiles
                if self.use_path_cost:
                    prev = best_g.get(key)
                    if prev is not None and child.path_cost >= prev:
                        continue
                    best_g[key] = child.path_cost
                else:
                    if key in best_g:
                        continue
                    best_g[key] = child.path_cost

                ch = self.heuristic_fn(child.state)
                cf = self._priority(child.path_cost, ch)
                heapq.heappush(heap, (cf, ch, tie, child))
                tie += 1
                generated += 1

            if len(heap) > max_frontier:
                max_frontier = len(heap)

        return SearchResult(
            algorithm=self.name,
            category=self.category,
            status="not_found",
            solved=False,
            initial_state=initial_state,
            final_state=best_node.state,
            actions=best_node.reconstruct_actions(),
            path_cost=best_node.path_cost,
            heuristic_name=self.heuristic_name,
            metrics=SearchMetrics(
                nodes_expanded=expanded,
                nodes_generated=generated,
                max_frontier_size=max_frontier,
                elapsed_ms=(time.perf_counter() - start) * 1000.0,
            ),
        )


class GreedyBestFirstSolver(_BestFirstBase):
    """Greedy Best-First Search: f(n) = h(n)."""

    name = "Greedy Best-First"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        max_nodes: int = 150_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(
            environment=environment,
            heuristic=heuristic,
            weight=1.0,
            use_path_cost=False,
            max_nodes=max_nodes,
            max_time_ms=max_time_ms,
        )


class AStarSolver(_BestFirstBase):
    """A* Search: f(n) = g(n) + h(n)."""

    name = "A*"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        max_nodes: int = 150_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(
            environment=environment,
            heuristic=heuristic,
            weight=1.0,
            use_path_cost=True,
            max_nodes=max_nodes,
            max_time_ms=max_time_ms,
        )


class WeightedAStarSolver(_BestFirstBase):
    """Weighted A* Search: f(n) = g(n) + w * h(n) (w >= 1)."""

    name = "Weighted A*"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        weight: float = 1.5,
        max_nodes: int = 150_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        if weight < 1.0:
            raise ValueError("Weighted A* weight must be >= 1.0")
        super().__init__(
            environment=environment,
            heuristic=heuristic,
            weight=weight,
            use_path_cost=True,
            max_nodes=max_nodes,
            max_time_ms=max_time_ms,
        )


class IDAStarSolver(Solver):
    """Iterative Deepening A* (optimal with admissible heuristics and O(d) memory)."""

    name = "IDA*"
    category = "informed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        max_nodes: int = 500_000,
        max_time_ms: float = 8_000.0,
    ) -> None:
        super().__init__(environment)
        self.heuristic_name = heuristic
        self.heuristic_fn: HeuristicFn = get_heuristic(heuristic)
        self.max_nodes = max_nodes
        self.max_time_ms = max_time_ms

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state, heuristic_name=self.heuristic_name)

        start = time.perf_counter()
        deadline = start + self.max_time_ms / 1000.0
        root = Node(state=initial_state)
        threshold = self.heuristic_fn(initial_state)
        expanded = 0
        generated = 1
        max_depth_reached = 0
        on_path: set[tuple[int, ...]] = {initial_state.tiles}
        aborted = False
        solution_node: Optional[Node] = None
        thresholds_visited: list[int] = []

        def dfs(node: Node, g: int, bound: int) -> int:
            nonlocal expanded, generated, max_depth_reached, aborted, solution_node
            if expanded >= self.max_nodes or time.perf_counter() > deadline:
                aborted = True
                return -1

            if node.depth > max_depth_reached:
                max_depth_reached = node.depth

            h = self.heuristic_fn(node.state)
            f = g + h
            if f > bound:
                return f
            if self.env.goal_test(node.state):
                solution_node = node
                return 0

            expanded += 1
            min_excess = 10**9
            # Move ordering by child h speeds up pruning without changing optimality
            children = self.env.expand(node)
            scored: list[tuple[int, Node]] = []
            for child in children:
                if child.state.tiles in on_path:
                    continue
                scored.append((self.heuristic_fn(child.state), child))
            scored.sort(key=lambda pair: pair[0])

            for _, child in scored:
                generated += 1
                key = child.state.tiles
                on_path.add(key)
                res = dfs(child, g + 1, bound)
                if solution_node is not None or aborted:
                    return res
                on_path.remove(key)
                if res < min_excess:
                    min_excess = res

            return min_excess

        while True:
            thresholds_visited.append(threshold)
            next_bound = dfs(root, 0, threshold)
            if solution_node is not None:
                return SearchResult(
                    algorithm=self.name,
                    category=self.category,
                    status="solved",
                    solved=True,
                    initial_state=initial_state,
                    final_state=solution_node.state,
                    actions=solution_node.reconstruct_actions(),
                    path_cost=solution_node.path_cost,
                    heuristic_name=self.heuristic_name,
                    metrics=SearchMetrics(
                        nodes_expanded=expanded,
                        nodes_generated=generated,
                        max_frontier_size=max_depth_reached + 1,
                        elapsed_ms=(time.perf_counter() - start) * 1000.0,
                        extra={"thresholds": thresholds_visited},
                    ),
                )
            if aborted or next_bound >= 10**9:
                status = "limit_reached" if aborted else "not_found"
                return SearchResult(
                    algorithm=self.name,
                    category=self.category,
                    status=status,
                    solved=False,
                    initial_state=initial_state,
                    final_state=initial_state,
                    actions=[],
                    path_cost=0,
                    heuristic_name=self.heuristic_name,
                    metrics=SearchMetrics(
                        nodes_expanded=expanded,
                        nodes_generated=generated,
                        max_frontier_size=max_depth_reached + 1,
                        elapsed_ms=(time.perf_counter() - start) * 1000.0,
                        extra={"thresholds": thresholds_visited},
                    ),
                )
            threshold = next_bound
