"""15-Puzzle environment: transitions, solvability, scrambles, and sequences."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Callable, Iterable, Optional, Sequence

from .actions import ALL_ACTIONS, Action
from .state import GOAL_TILES, GRID_SIZE, NUM_CELLS, Node, PuzzleState

DIFFICULTY_PRESETS: dict[str, dict[str, object]] = {
    "easy": {
        "label": "Easy (Depth ~10)",
        "depth": 10,
        "seed": 101,
        "tiles": None,
    },
    "medium": {
        "label": "Medium (Depth ~22)",
        "depth": 22,
        "seed": 202,
        "tiles": None,
    },
    "hard": {
        "label": "Hard (Depth ~40)",
        "depth": 40,
        "seed": 303,
        "tiles": None,
    },
    "classic": {
        "label": "Classic Benchmark (Depth 20)",
        "depth": 20,
        "seed": 404,
        "tiles": (
            5, 1, 2, 4,
            9, 6, 3, 8,
            13, 10, 7, 11,
            14, 15, 12, 0,
        ),
    },
}


@dataclass(frozen=True, slots=True)
class SequenceEvaluation:
    """Outcome of executing an action sequence from an initial state."""

    solved: bool
    final_state: PuzzleState
    path_cost: int
    steps_executed: int
    invalid_moves: int
    distance: int
    misplaced_tiles: int
    linear_conflicts: int
    conflict_count: int
    trajectory: tuple[PuzzleState, ...]
    executed_actions: tuple[Action, ...]


def count_inversions(tiles: Sequence[int]) -> int:
    """Count tile inversions in row-major order, ignoring blank (0)."""
    non_zero = [t for t in tiles if t != 0]
    inversions = 0
    for i in range(len(non_zero)):
        ti = non_zero[i]
        for j in range(i + 1, len(non_zero)):
            if ti > non_zero[j]:
                inversions += 1
    return inversions


def is_solvable_tiles(tiles: Iterable[int]) -> tuple[bool, int, int]:
    """Check 4x4 15-Puzzle solvability and return (solvable, inversions, blank_row_bottom).

    For an even-width (4x4) grid, a state is solvable iff:
        (inversions + blank_row_from_bottom) % 2 == 1
    where blank_row_from_bottom is 1-indexed from the bottom row (goal has 0 + 1 = 1).
    """
    state = PuzzleState.from_iterable(tiles)
    inversions = count_inversions(state.tiles)
    blank_row_bottom = state.blank_row_from_bottom
    solvable = (inversions + blank_row_bottom) % 2 == 1
    return solvable, inversions, blank_row_bottom


class PuzzleEnvironment:
    """Formal AI Search Problem formulation for the 4x4 15-Puzzle."""

    def __init__(self, goal_state: Optional[PuzzleState] = None) -> None:
        self.goal_state: PuzzleState = goal_state or PuzzleState.goal()

    def goal_test(self, state: PuzzleState) -> bool:
        """Return True iff the given state matches the goal configuration."""
        return state.tiles == self.goal_state.tiles

    def is_solvable(self, state: PuzzleState | Iterable[int]) -> bool:
        """Return True iff the state is reachable from the goal state."""
        tiles = state.tiles if isinstance(state, PuzzleState) else state
        solvable, _, _ = is_solvable_tiles(tiles)
        return solvable

    def valid_actions(
        self,
        state: PuzzleState,
        exclude_inverse_of: Optional[Action] = None,
    ) -> list[Action]:
        """Return legal actions from `state`, optionally pruning immediate inverses."""
        r, c = state.blank_row, state.blank_col
        valid: list[Action] = []
        for action in ALL_ACTIONS:
            if exclude_inverse_of is not None and action == exclude_inverse_of.inverse:
                continue
            dr, dc = action.delta
            nr, nc = r + dr, c + dc
            if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                valid.append(action)
        return valid

    def is_valid_action(self, state: PuzzleState, action: Action) -> bool:
        """Return True iff `action` keeps the blank within the 4x4 grid."""
        dr, dc = action.delta
        nr, nc = state.blank_row + dr, state.blank_col + dc
        return 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE

    def result(self, state: PuzzleState, action: Action) -> PuzzleState:
        """Transition function returning the successor state for a valid action."""
        dr, dc = action.delta
        nr, nc = state.blank_row + dr, state.blank_col + dc
        if not (0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE):
            raise ValueError(f"Illegal action {action.value} from blank index {state.blank_index}")
        target_idx = nr * GRID_SIZE + nc
        mutable = list(state.tiles)
        mutable[state.blank_index], mutable[target_idx] = (
            mutable[target_idx],
            mutable[state.blank_index],
        )
        return PuzzleState(tiles=tuple(mutable), blank_index=target_idx)

    def step_cost(
        self,
        state: PuzzleState,
        action: Action,
        next_state: PuzzleState,
    ) -> int:
        """Unit transition cost (1 per tile slide)."""
        return 1

    def path_cost(self, actions: Sequence[Action]) -> int:
        """Total path cost for a sequence of unit-cost actions."""
        return len(actions)

    def expand(self, node: Node, avoid_backtrack: bool = True) -> list[Node]:
        """Generate child search nodes from `node`."""
        last_action = node.action if avoid_backtrack else None
        children: list[Node] = []
        for action in self.valid_actions(node.state, exclude_inverse_of=last_action):
            next_state = self.result(node.state, action)
            cost = node.path_cost + self.step_cost(node.state, action, next_state)
            children.append(
                Node(
                    state=next_state,
                    parent=node,
                    action=action,
                    path_cost=cost,
                    depth=node.depth + 1,
                )
            )
        return children

    def generate_scramble(
        self,
        depth: int = 20,
        seed: Optional[int] = None,
        rng: Optional[random.Random] = None,
        avoid_backtrack: bool = True,
    ) -> tuple[PuzzleState, list[Action]]:
        """Generate a guaranteed-solvable board by applying `depth` random moves from goal."""
        if depth < 0:
            raise ValueError("Scramble depth must be non-negative.")
        generator = rng or random.Random(seed)
        state = self.goal_state
        last_action: Optional[Action] = None
        scramble_actions: list[Action] = []
        for _ in range(depth):
            choices = self.valid_actions(
                state, exclude_inverse_of=last_action if avoid_backtrack else None
            )
            action = generator.choice(choices)
            state = self.result(state, action)
            scramble_actions.append(action)
            last_action = action
        return state, scramble_actions

    def get_preset(self, name: str) -> PuzzleState:
        """Return one of the standard difficulty presets (easy, medium, hard, classic)."""
        key = name.lower()
        if key not in DIFFICULTY_PRESETS:
            raise ValueError(f"Unknown preset {name!r}. Choose from {list(DIFFICULTY_PRESETS)}")
        spec = DIFFICULTY_PRESETS[key]
        if spec["tiles"] is not None:
            return PuzzleState.from_iterable(spec["tiles"])  # type: ignore[arg-type]
        state, _ = self.generate_scramble(
            depth=int(spec["depth"]),  # type: ignore[arg-type]
            seed=int(spec["seed"]),    # type: ignore[arg-type]
        )
        return state

    def generate_random_sequence(
        self,
        length: int,
        rng: random.Random,
        initial_state: Optional[PuzzleState] = None,
        avoid_inverse: bool = True,
        valid_only: bool = True,
    ) -> list[Action]:
        """Generate a fixed-length random action sequence.

        When `valid_only` and `initial_state` are provided, walks valid transitions
        from `initial_state` (still respecting `avoid_inverse` when possible),
        producing executable trajectories with zero wall-bumps.
        """
        if length < 0:
            raise ValueError("Sequence length must be non-negative.")
        seq: list[Action] = []
        state = initial_state
        last_action: Optional[Action] = None
        for _ in range(length):
            if valid_only and state is not None:
                choices = self.valid_actions(
                    state, exclude_inverse_of=last_action if avoid_inverse else None
                )
                if not choices:
                    choices = self.valid_actions(state)
                action = rng.choice(choices)
                state = self.result(state, action)
            else:
                choices = [
                    a for a in ALL_ACTIONS
                    if not (avoid_inverse and last_action is not None and a == last_action.inverse)
                ]
                action = rng.choice(choices)
            seq.append(action)
            last_action = action
        return seq

    def repair_sequence(
        self,
        initial_state: PuzzleState,
        sequence: Sequence[Action],
        rng: Optional[random.Random] = None,
    ) -> list[Action]:
        """Replace out-of-bounds actions with valid transitions along the trajectory."""
        state = initial_state
        repaired: list[Action] = []
        last_action: Optional[Action] = None
        for action in sequence:
            if self.is_valid_action(state, action):
                chosen = action
            else:
                candidates = self.valid_actions(state, exclude_inverse_of=last_action)
                if not candidates:
                    candidates = self.valid_actions(state)
                chosen = rng.choice(candidates) if rng is not None else candidates[0]
            repaired.append(chosen)
            state = self.result(state, chosen)
            last_action = chosen
        return repaired

    def evaluate_sequence(
        self,
        initial_state: PuzzleState,
        sequence: Sequence[Action],
        distance_fn: Callable[[PuzzleState], int],
        misplaced_fn: Callable[[PuzzleState], int],
        linear_conflict_fn: Callable[[PuzzleState], int],
        record_trajectory: bool = False,
    ) -> SequenceEvaluation:
        """Simulate a fixed-length action sequence, halting early upon reaching the goal."""
        state = initial_state
        valid_steps = 0
        invalid_moves = 0
        trajectory: list[PuzzleState] = [state] if record_trajectory else []
        executed: list[Action] = []

        if self.goal_test(state):
            return SequenceEvaluation(
                solved=True,
                final_state=state,
                path_cost=0,
                steps_executed=0,
                invalid_moves=0,
                distance=0,
                misplaced_tiles=0,
                linear_conflicts=0,
                conflict_count=0,
                trajectory=(state,) if record_trajectory else (),
                executed_actions=(),
            )

        solved = False
        for action in sequence:
            if self.is_valid_action(state, action):
                state = self.result(state, action)
                valid_steps += 1
                executed.append(action)
                if record_trajectory:
                    trajectory.append(state)
                if self.goal_test(state):
                    solved = True
                    break
            else:
                invalid_moves += 1

        if solved:
            dist = 0
            misplaced = 0
            lin_conf = 0
            conflict = 0
        else:
            dist = distance_fn(state)
            misplaced = misplaced_fn(state)
            lin_conf = linear_conflict_fn(state)
            conflict = misplaced + 2 * lin_conf

        return SequenceEvaluation(
            solved=solved,
            final_state=state,
            path_cost=valid_steps,
            steps_executed=valid_steps + invalid_moves,
            invalid_moves=invalid_moves,
            distance=dist,
            misplaced_tiles=misplaced,
            linear_conflicts=lin_conf,
            conflict_count=conflict,
            trajectory=tuple(trajectory),
            executed_actions=tuple(executed),
        )
