"""Local search algorithms: Hill Climbing variants, Simulated Annealing, Local Beam."""

from __future__ import annotations

import math
import random
import time
from typing import Optional

from ..actions import Action
from ..environment import PuzzleEnvironment
from ..heuristics import HeuristicFn, get_heuristic
from ..solver_base import SearchMetrics, SearchResult, Solver
from ..state import Node, PuzzleState


class HillClimbingSolver(Solver):
    """Hill Climbing supporting `steepest`, `stochastic`, and `random_restart` variants."""

    category = "local"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        variant: str = "steepest",
        heuristic: str = "linear_conflict",
        max_steps: int = 300,
        max_sideways: int = 15,
        max_restarts: int = 10,
        restart_walk_length: int = 8,
        seed: int = 42,
    ) -> None:
        super().__init__(environment)
        v = variant.lower()
        if v not in ("steepest", "stochastic", "random_restart"):
            raise ValueError(f"Unknown Hill Climbing variant {variant!r}")
        self.variant = v
        self.name = f"Hill Climbing ({v.replace('_', ' ').title()})"
        self.heuristic_name = heuristic
        self.heuristic_fn: HeuristicFn = get_heuristic(heuristic)
        self.max_steps = max_steps
        self.max_sideways = max_sideways
        self.max_restarts = max_restarts
        self.restart_walk_length = restart_walk_length
        self.rng = random.Random(seed)

    def _climb_from(
        self,
        start_state: PuzzleState,
        prefix_actions: list[Action],
        step_budget: int,
    ) -> tuple[bool, PuzzleState, list[Action], int, int, int]:
        state = start_state
        actions = list(prefix_actions)
        current_h = self.heuristic_fn(state)
        best_state = state
        best_h = current_h
        best_actions = list(actions)
        last_action: Optional[Action] = actions[-1] if actions else None
        sideways = 0
        expanded = 0
        generated = 0

        for _ in range(step_budget):
            if self.env.goal_test(state):
                return True, state, actions, expanded, generated, 0

            expanded += 1
            valid = self.env.valid_actions(state, exclude_inverse_of=last_action)
            if not valid:
                valid = self.env.valid_actions(state)

            neighbors: list[tuple[int, Action, PuzzleState]] = []
            for act in valid:
                nxt = self.env.result(state, act)
                generated += 1
                neighbors.append((self.heuristic_fn(nxt), act, nxt))

            min_h = min(item[0] for item in neighbors)
            best_neighbors = [item for item in neighbors if item[0] == min_h]

            if self.variant == "stochastic":
                improving = [item for item in neighbors if item[0] < current_h]
                if improving:
                    chosen_h, chosen_act, chosen_state = self.rng.choice(improving)
                elif min_h == current_h and sideways < self.max_sideways:
                    chosen_h, chosen_act, chosen_state = self.rng.choice(best_neighbors)
                else:
                    break
            else:
                if min_h > current_h:
                    break
                if min_h == current_h:
                    if sideways >= self.max_sideways:
                        break
                    sideways += 1
                else:
                    sideways = 0
                chosen_h, chosen_act, chosen_state = self.rng.choice(best_neighbors)

            state = chosen_state
            actions.append(chosen_act)
            last_action = chosen_act
            current_h = chosen_h
            if chosen_h < best_h:
                best_h = chosen_h
                best_state = state
                best_actions = list(actions)

            if self.env.goal_test(state):
                return True, state, actions, expanded, generated, 0

        return False, best_state, best_actions, expanded, generated, best_h

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state, heuristic_name=self.heuristic_name)

        start = time.perf_counter()
        total_expanded = 0
        total_generated = 0
        global_best_state = initial_state
        global_best_actions: list[Action] = []
        global_best_h = self.heuristic_fn(initial_state)

        restarts = self.max_restarts if self.variant == "random_restart" else 0
        for attempt in range(restarts + 1):
            prefix: list[Action] = []
            seed_state = initial_state
            if attempt > 0:
                last_act: Optional[Action] = None
                for _ in range(self.restart_walk_length):
                    choices = self.env.valid_actions(seed_state, exclude_inverse_of=last_act)
                    if not choices:
                        choices = self.env.valid_actions(seed_state)
                    act = self.rng.choice(choices)
                    seed_state = self.env.result(seed_state, act)
                    prefix.append(act)
                    last_act = act
                    total_generated += 1
                    if self.env.goal_test(seed_state):
                        return SearchResult(
                            algorithm=self.name,
                            category=self.category,
                            status="solved",
                            solved=True,
                            initial_state=initial_state,
                            final_state=seed_state,
                            actions=prefix,
                            path_cost=len(prefix),
                            heuristic_name=self.heuristic_name,
                            metrics=SearchMetrics(
                                nodes_expanded=total_expanded,
                                nodes_generated=total_generated,
                                max_frontier_size=1,
                                elapsed_ms=(time.perf_counter() - start) * 1000.0,
                                extra={"restarts": attempt},
                            ),
                        )

            solved, b_state, b_actions, exp, gen, b_h = self._climb_from(
                seed_state, prefix, self.max_steps
            )
            total_expanded += exp
            total_generated += gen
            if solved:
                return SearchResult(
                    algorithm=self.name,
                    category=self.category,
                    status="solved",
                    solved=True,
                    initial_state=initial_state,
                    final_state=b_state,
                    actions=b_actions,
                    path_cost=len(b_actions),
                    heuristic_name=self.heuristic_name,
                    metrics=SearchMetrics(
                        nodes_expanded=total_expanded,
                        nodes_generated=total_generated,
                        max_frontier_size=1,
                        elapsed_ms=(time.perf_counter() - start) * 1000.0,
                        extra={"restarts": attempt},
                    ),
                )
            if b_h < global_best_h:
                global_best_h = b_h
                global_best_state = b_state
                global_best_actions = b_actions

        return SearchResult(
            algorithm=self.name,
            category=self.category,
            status="local_optimum",
            solved=False,
            initial_state=initial_state,
            final_state=global_best_state,
            actions=global_best_actions,
            path_cost=len(global_best_actions),
            heuristic_name=self.heuristic_name,
            metrics=SearchMetrics(
                nodes_expanded=total_expanded,
                nodes_generated=total_generated,
                max_frontier_size=1,
                elapsed_ms=(time.perf_counter() - start) * 1000.0,
                extra={"best_h": global_best_h, "restarts": restarts},
            ),
        )


class SimulatedAnnealingSolver(Solver):
    """Simulated Annealing with geometric cooling schedule."""

    name = "Simulated Annealing"
    category = "local"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        initial_temp: float = 12.0,
        cooling_rate: float = 0.995,
        min_temp: float = 0.05,
        max_iterations: int = 3_000,
        seed: int = 42,
    ) -> None:
        super().__init__(environment)
        self.heuristic_name = heuristic
        self.heuristic_fn: HeuristicFn = get_heuristic(heuristic)
        self.initial_temp = initial_temp
        self.cooling_rate = cooling_rate
        self.min_temp = min_temp
        self.max_iterations = max_iterations
        self.rng = random.Random(seed)

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state, heuristic_name=self.heuristic_name)

        start = time.perf_counter()
        state = initial_state
        current_h = self.heuristic_fn(state)
        actions: list[Action] = []
        best_state = state
        best_h = current_h
        best_actions: list[Action] = []
        last_action: Optional[Action] = None
        temp = self.initial_temp
        expanded = 0
        generated = 1

        if self.env.goal_test(state):
            return SearchResult(
                algorithm=self.name,
                category=self.category,
                status="solved",
                solved=True,
                initial_state=initial_state,
                final_state=state,
                actions=[],
                path_cost=0,
                heuristic_name=self.heuristic_name,
                metrics=SearchMetrics(0, 1, 1, (time.perf_counter() - start) * 1000.0),
            )

        for _ in range(self.max_iterations):
            if temp < self.min_temp:
                break
            expanded += 1
            choices = self.env.valid_actions(state, exclude_inverse_of=last_action)
            if not choices:
                choices = self.env.valid_actions(state)
            act = self.rng.choice(choices)
            nxt = self.env.result(state, act)
            generated += 1
            nxt_h = self.heuristic_fn(nxt)
            delta = nxt_h - current_h

            if delta <= 0 or self.rng.random() < math.exp(-delta / max(temp, 1e-9)):
                state = nxt
                current_h = nxt_h
                actions.append(act)
                last_action = act
                if nxt_h < best_h:
                    best_h = nxt_h
                    best_state = state
                    best_actions = list(actions)
                if self.env.goal_test(state):
                    return SearchResult(
                        algorithm=self.name,
                        category=self.category,
                        status="solved",
                        solved=True,
                        initial_state=initial_state,
                        final_state=state,
                        actions=actions,
                        path_cost=len(actions),
                        heuristic_name=self.heuristic_name,
                        metrics=SearchMetrics(
                            nodes_expanded=expanded,
                            nodes_generated=generated,
                            max_frontier_size=1,
                            elapsed_ms=(time.perf_counter() - start) * 1000.0,
                            extra={"final_temp": round(temp, 4)},
                        ),
                    )
            temp *= self.cooling_rate

        return SearchResult(
            algorithm=self.name,
            category=self.category,
            status="local_optimum",
            solved=False,
            initial_state=initial_state,
            final_state=best_state,
            actions=best_actions,
            path_cost=len(best_actions),
            heuristic_name=self.heuristic_name,
            metrics=SearchMetrics(
                nodes_expanded=expanded,
                nodes_generated=generated,
                max_frontier_size=1,
                elapsed_ms=(time.perf_counter() - start) * 1000.0,
                extra={"best_h": best_h, "final_temp": round(temp, 4)},
            ),
        )


class LocalBeamSolver(Solver):
    """Local Beam Search retaining the top-k best successors at each step."""

    name = "Local Beam Search"
    category = "local"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        heuristic: str = "linear_conflict",
        beam_width: int = 12,
        max_steps: int = 200,
    ) -> None:
        super().__init__(environment)
        self.heuristic_name = heuristic
        self.heuristic_fn: HeuristicFn = get_heuristic(heuristic)
        self.beam_width = max(1, beam_width)
        self.max_steps = max_steps

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state, heuristic_name=self.heuristic_name)

        start = time.perf_counter()
        root = Node(state=initial_state)
        h0 = self.heuristic_fn(initial_state)
        if self.env.goal_test(initial_state):
            return SearchResult(
                algorithm=self.name,
                category=self.category,
                status="solved",
                solved=True,
                initial_state=initial_state,
                final_state=initial_state,
                actions=[],
                path_cost=0,
                heuristic_name=self.heuristic_name,
                metrics=SearchMetrics(0, 1, 1, (time.perf_counter() - start) * 1000.0),
            )

        beam: list[tuple[int, Node]] = [(h0, root)]
        seen: set[tuple[int, ...]] = {initial_state.tiles}
        best_h = h0
        best_node = root
        expanded = 0
        generated = 1

        for _ in range(self.max_steps):
            candidates: list[tuple[int, int, Node]] = []
            tie = 0
            for _, node in beam:
                expanded += 1
                for child in self.env.expand(node):
                    key = child.state.tiles
                    if key in seen:
                        continue
                    seen.add(key)
                    generated += 1
                    if self.env.goal_test(child.state):
                        return SearchResult(
                            algorithm=self.name,
                            category=self.category,
                            status="solved",
                            solved=True,
                            initial_state=initial_state,
                            final_state=child.state,
                            actions=child.reconstruct_actions(),
                            path_cost=child.path_cost,
                            heuristic_name=self.heuristic_name,
                            metrics=SearchMetrics(
                                nodes_expanded=expanded,
                                nodes_generated=generated,
                                max_frontier_size=self.beam_width,
                                elapsed_ms=(time.perf_counter() - start) * 1000.0,
                                extra={"beam_width": self.beam_width},
                            ),
                        )
                    ch = self.heuristic_fn(child.state)
                    if ch < best_h:
                        best_h = ch
                        best_node = child
                    candidates.append((ch, tie, child))
                    tie += 1

            if not candidates:
                break
            candidates.sort(key=lambda item: (item[0], item[1]))
            beam = [(item[0], item[2]) for item in candidates[: self.beam_width]]

        return SearchResult(
            algorithm=self.name,
            category=self.category,
            status="local_optimum",
            solved=False,
            initial_state=initial_state,
            final_state=best_node.state,
            actions=best_node.reconstruct_actions(),
            path_cost=best_node.path_cost,
            heuristic_name=self.heuristic_name,
            metrics=SearchMetrics(
                nodes_expanded=expanded,
                nodes_generated=generated,
                max_frontier_size=self.beam_width,
                elapsed_ms=(time.perf_counter() - start) * 1000.0,
                extra={"best_h": best_h, "beam_width": self.beam_width},
            ),
        )
