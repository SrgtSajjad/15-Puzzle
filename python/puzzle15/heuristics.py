"""Admissible heuristics, conflict metrics, and GA fitness evaluator."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Sequence

from .actions import Action
from .environment import PuzzleEnvironment, SequenceEvaluation
from .state import GOAL_TILES, GRID_SIZE, PuzzleState

# Precompute goal (row, col) lookup for tiles 1..15
_GOAL_POS: dict[int, tuple[int, int]] = {
    tile: (idx // GRID_SIZE, idx % GRID_SIZE)
    for idx, tile in enumerate(GOAL_TILES)
    if tile != 0
}


def misplaced_tiles(state: PuzzleState) -> int:
    """Hamming distance: number of non-blank tiles not in their goal position."""
    count = 0
    for idx, tile in enumerate(state.tiles):
        if tile != 0 and tile != GOAL_TILES[idx]:
            count += 1
    return count


def manhattan_distance(state: PuzzleState) -> int:
    """Sum of L1 Manhattan distances of tiles 1..15 from their goal coordinates."""
    total = 0
    for idx, tile in enumerate(state.tiles):
        if tile == 0:
            continue
        r, c = idx // GRID_SIZE, idx % GRID_SIZE
        gr, gc = _GOAL_POS[tile]
        total += abs(r - gr) + abs(c - gc)
    return total


def _count_line_conflicts(line_goal_positions: list[int]) -> int:
    """Count pairwise order inversions among tiles already in their target line."""
    conflicts = 0
    n = len(line_goal_positions)
    for i in range(n):
        gi = line_goal_positions[i]
        for j in range(i + 1, n):
            if gi > line_goal_positions[j]:
                conflicts += 1
    return conflicts


def linear_conflict_count(state: PuzzleState) -> int:
    """Count row and column linear conflicts in the 4x4 grid."""
    tiles = state.tiles
    conflicts = 0

    for row in range(GRID_SIZE):
        in_goal_row: list[int] = []
        base = row * GRID_SIZE
        for col in range(GRID_SIZE):
            tile = tiles[base + col]
            if tile != 0:
                gr, gc = _GOAL_POS[tile]
                if gr == row:
                    in_goal_row.append(gc)
        conflicts += _count_line_conflicts(in_goal_row)

    for col in range(GRID_SIZE):
        in_goal_col: list[int] = []
        for row in range(GRID_SIZE):
            tile = tiles[row * GRID_SIZE + col]
            if tile != 0:
                gr, gc = _GOAL_POS[tile]
                if gc == col:
                    in_goal_col.append(gr)
        conflicts += _count_line_conflicts(in_goal_col)

    return conflicts


def manhattan_linear_conflict(state: PuzzleState) -> int:
    """Admissible & consistent heuristic: Manhattan + 2 * Linear Conflicts."""
    return manhattan_distance(state) + 2 * linear_conflict_count(state)


def conflict_count(state: PuzzleState) -> int:
    """Composite goal-conflict metric: misplaced_tiles + 2 * linear_conflicts.

    Equals 0 if and only if `state` is the goal state.
    """
    return misplaced_tiles(state) + 2 * linear_conflict_count(state)


HeuristicFn = Callable[[PuzzleState], int]

HEURISTIC_REGISTRY: dict[str, HeuristicFn] = {
    "misplaced": misplaced_tiles,
    "manhattan": manhattan_distance,
    "linear_conflict": manhattan_linear_conflict,
}


def get_heuristic(name: str) -> HeuristicFn:
    """Look up a heuristic function by canonical identifier."""
    key = name.lower()
    if key not in HEURISTIC_REGISTRY:
        raise ValueError(
            f"Unknown heuristic {name!r}. Available: {list(HEURISTIC_REGISTRY)}"
        )
    return HEURISTIC_REGISTRY[key]


@dataclass(frozen=True, slots=True)
class FitnessConfig:
    """Hyperparameters governing the Darwinian Genetic Algorithm fitness function."""

    large_constant: float = 10000.0
    base_constant: float = 5000.0
    w_dist: float = 15.0
    w_conflict: float = 10.0
    w_cost: float = 1.0
    w_invalid: float = 5.0
    heuristic_name: str = "linear_conflict"


@dataclass(frozen=True, slots=True)
class FitnessResult:
    """Detailed evaluation and scalar fitness score of an action sequence."""

    fitness: float
    evaluation: SequenceEvaluation


class Evaluator:
    """Encapsulates state heuristics and GA sequence fitness evaluation."""

    def __init__(
        self,
        environment: PuzzleEnvironment,
        fitness_config: FitnessConfig | None = None,
    ) -> None:
        self.env = environment
        self.config = fitness_config or FitnessConfig()
        self.distance_fn = get_heuristic(self.config.heuristic_name)

    def evaluate_state(self, state: PuzzleState, heuristic_name: str | None = None) -> dict[str, int]:
        """Compute all distance and conflict metrics for a single board state."""
        fn = get_heuristic(heuristic_name) if heuristic_name else self.distance_fn
        manh = manhattan_distance(state)
        misp = misplaced_tiles(state)
        lin = linear_conflict_count(state)
        return {
            "distance": fn(state),
            "manhattan": manh,
            "misplaced": misp,
            "linear_conflicts": lin,
            "manhattan_linear_conflict": manh + 2 * lin,
            "conflict_count": misp + 2 * lin,
        }

    def evaluate_sequence(
        self,
        initial_state: PuzzleState,
        sequence: Sequence[Action],
        record_trajectory: bool = False,
    ) -> SequenceEvaluation:
        """Simulate a fixed-length action sequence against the configured heuristic."""
        return self.env.evaluate_sequence(
            initial_state=initial_state,
            sequence=sequence,
            distance_fn=self.distance_fn,
            misplaced_fn=misplaced_tiles,
            linear_conflict_fn=linear_conflict_count,
            record_trajectory=record_trajectory,
        )

    def fitness(
        self,
        initial_state: PuzzleState,
        sequence: Sequence[Action],
        record_trajectory: bool = False,
    ) -> FitnessResult:
        """Compute Darwinian GA fitness for an action sequence.

        - Solved (`goal_test` reached): `LARGE_CONSTANT - path_cost`
        - Unsolved: `BASE_CONSTANT - (w_dist * distance + w_conflict * conflict_count + w_cost * path_cost + w_invalid * invalid_moves)`
        """
        eval_res = self.evaluate_sequence(
            initial_state, sequence, record_trajectory=record_trajectory
        )
        cfg = self.config
        if eval_res.solved:
            score = cfg.large_constant - float(eval_res.path_cost)
        else:
            penalty = (
                cfg.w_dist * eval_res.distance
                + cfg.w_conflict * eval_res.conflict_count
                + cfg.w_cost * eval_res.path_cost
                + cfg.w_invalid * eval_res.invalid_moves
            )
            score = cfg.base_constant - penalty
        return FitnessResult(fitness=score, evaluation=eval_res)
