"""Uninformed (blind) search algorithms for the 4x4 15-Puzzle."""

from __future__ import annotations

import heapq
import time
from collections import deque
from typing import Optional

from ..environment import PuzzleEnvironment
from ..solver_base import SearchMetrics, SearchResult, Solver
from ..state import Node, PuzzleState


def _make_result(
    solver: Solver,
    status: str,
    solved: bool,
    initial_state: PuzzleState,
    best_node: Node,
    nodes_expanded: int,
    nodes_generated: int,
    max_frontier: int,
    start_time: float,
    extra: Optional[dict[str, object]] = None,
) -> SearchResult:
    actions = best_node.reconstruct_actions()
    return SearchResult(
        algorithm=solver.name,
        category=solver.category,
        status=status,
        solved=solved,
        initial_state=initial_state,
        final_state=best_node.state,
        actions=actions,
        path_cost=best_node.path_cost,
        metrics=SearchMetrics(
            nodes_expanded=nodes_expanded,
            nodes_generated=nodes_generated,
            max_frontier_size=max_frontier,
            elapsed_ms=(time.perf_counter() - start_time) * 1000.0,
            extra=extra or {},
        ),
    )


class BFSSolver(Solver):
    """Breadth-First Search (optimal for unit step costs, bounded by node/time limits)."""

    name = "BFS"
    category = "uninformed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        max_nodes: int = 100_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(environment)
        self.max_nodes = max_nodes
        self.max_time_ms = max_time_ms

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state)

        start = time.perf_counter()
        root = Node(state=initial_state)
        if self.env.goal_test(initial_state):
            return _make_result(self, "solved", True, initial_state, root, 0, 1, 1, start)

        frontier: deque[Node] = deque([root])
        visited: set[tuple[int, ...]] = {initial_state.tiles}
        expanded = 0
        generated = 1
        max_frontier = 1

        while frontier:
            if expanded >= self.max_nodes or (time.perf_counter() - start) * 1000.0 > self.max_time_ms:
                return _make_result(
                    self, "limit_reached", False, initial_state, frontier[0],
                    expanded, generated, max_frontier, start,
                )

            node = frontier.popleft()
            expanded += 1
            for child in self.env.expand(node):
                if child.state.tiles in visited:
                    continue
                generated += 1
                if self.env.goal_test(child.state):
                    return _make_result(
                        self, "solved", True, initial_state, child,
                        expanded, generated, max_frontier, start,
                    )
                visited.add(child.state.tiles)
                frontier.append(child)
                if len(frontier) > max_frontier:
                    max_frontier = len(frontier)

        return _make_result(
            self, "not_found", False, initial_state, root,
            expanded, generated, max_frontier, start,
        )


class UCSSolver(Solver):
    """Uniform-Cost Search using a min-heap ordered by path cost g(n)."""

    name = "UCS"
    category = "uninformed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        max_nodes: int = 100_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(environment)
        self.max_nodes = max_nodes
        self.max_time_ms = max_time_ms

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state)

        start = time.perf_counter()
        root = Node(state=initial_state)
        heap: list[tuple[int, int, Node]] = [(0, 0, root)]
        best_cost: dict[tuple[int, ...], int] = {initial_state.tiles: 0}
        tie = 1
        expanded = 0
        generated = 1
        max_frontier = 1

        while heap:
            if expanded >= self.max_nodes or (time.perf_counter() - start) * 1000.0 > self.max_time_ms:
                return _make_result(
                    self, "limit_reached", False, initial_state, heap[0][2],
                    expanded, generated, max_frontier, start,
                )

            g, _, node = heapq.heappop(heap)
            if g > best_cost.get(node.state.tiles, g + 1):
                continue

            if self.env.goal_test(node.state):
                return _make_result(
                    self, "solved", True, initial_state, node,
                    expanded, generated, max_frontier, start,
                )

            expanded += 1
            for child in self.env.expand(node):
                key = child.state.tiles
                if child.path_cost < best_cost.get(key, child.path_cost + 1):
                    best_cost[key] = child.path_cost
                    heapq.heappush(heap, (child.path_cost, tie, child))
                    tie += 1
                    generated += 1
            if len(heap) > max_frontier:
                max_frontier = len(heap)

        return _make_result(
            self, "not_found", False, initial_state, root,
            expanded, generated, max_frontier, start,
        )


def _run_depth_limited(
    env: PuzzleEnvironment,
    initial_state: PuzzleState,
    depth_limit: int,
    max_nodes: int,
    deadline: float,
) -> tuple[str, Node, int, int, int]:
    """Iterative depth-limited graph search returning (status, node, expanded, generated, max_stack)."""
    root = Node(state=initial_state)
    stack: list[Node] = [root]
    best_depth: dict[tuple[int, ...], int] = {initial_state.tiles: 0}
    expanded = 0
    generated = 1
    max_stack = 1
    cutoff_occurred = False
    best_seen = root

    while stack:
        if expanded >= max_nodes or time.perf_counter() > deadline:
            return "limit_reached", best_seen, expanded, generated, max_stack

        node = stack.pop()
        if env.goal_test(node.state):
            return "solved", node, expanded, generated, max_stack

        if node.depth >= depth_limit:
            cutoff_occurred = True
            best_seen = node
            continue

        expanded += 1
        children = env.expand(node)
        for child in reversed(children):
            key = child.state.tiles
            prev_depth = best_depth.get(key)
            if prev_depth is None or child.depth < prev_depth:
                best_depth[key] = child.depth
                stack.append(child)
                generated += 1
        if len(stack) > max_stack:
            max_stack = len(stack)

    return ("cutoff" if cutoff_occurred else "not_found"), best_seen, expanded, generated, max_stack


class DLSSolver(Solver):
    """Depth-Limited Search (DFS capped at `depth_limit`)."""

    name = "DLS"
    category = "uninformed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        depth_limit: int = 20,
        max_nodes: int = 100_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(environment)
        self.depth_limit = depth_limit
        self.max_nodes = max_nodes
        self.max_time_ms = max_time_ms

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state)

        start = time.perf_counter()
        deadline = start + self.max_time_ms / 1000.0
        status, node, expanded, generated, max_stack = _run_depth_limited(
            self.env, initial_state, self.depth_limit, self.max_nodes, deadline
        )
        return _make_result(
            self, status, status == "solved", initial_state, node,
            expanded, generated, max_stack, start,
            extra={"depth_limit": self.depth_limit},
        )


class DFSSolver(DLSSolver):
    """Depth-First Search with bounded depth to stay finite on the 15-Puzzle."""

    name = "DFS"
    category = "uninformed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        max_depth: int = 30,
        max_nodes: int = 100_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(
            environment=environment,
            depth_limit=max_depth,
            max_nodes=max_nodes,
            max_time_ms=max_time_ms,
        )


class IDDFSSolver(Solver):
    """Iterative Deepening Depth-First Search (optimal for unit costs, O(bd) memory)."""

    name = "IDDFS"
    category = "uninformed"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        max_depth: int = 40,
        max_nodes: int = 200_000,
        max_time_ms: float = 5_000.0,
    ) -> None:
        super().__init__(environment)
        self.max_depth = max_depth
        self.max_nodes = max_nodes
        self.max_time_ms = max_time_ms

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state)

        start = time.perf_counter()
        deadline = start + self.max_time_ms / 1000.0
        total_expanded = 0
        total_generated = 0
        max_stack = 1
        last_node = Node(state=initial_state)

        for depth in range(self.max_depth + 1):
            remaining_nodes = max(1, self.max_nodes - total_expanded)
            status, node, exp, gen, stack_sz = _run_depth_limited(
                self.env, initial_state, depth, remaining_nodes, deadline
            )
            total_expanded += exp
            total_generated += gen
            if stack_sz > max_stack:
                max_stack = stack_sz
            last_node = node

            if status == "solved":
                return _make_result(
                    self, "solved", True, initial_state, node,
                    total_expanded, total_generated, max_stack, start,
                    extra={"solved_depth": depth},
                )
            if status == "limit_reached" or total_expanded >= self.max_nodes or time.perf_counter() > deadline:
                return _make_result(
                    self, "limit_reached", False, initial_state, last_node,
                    total_expanded, total_generated, max_stack, start,
                    extra={"last_depth": depth},
                )
            if status == "not_found":
                return _make_result(
                    self, "not_found", False, initial_state, last_node,
                    total_expanded, total_generated, max_stack, start,
                )

        return _make_result(
            self, "cutoff", False, initial_state, last_node,
            total_expanded, total_generated, max_stack, start,
            extra={"max_depth": self.max_depth},
        )
