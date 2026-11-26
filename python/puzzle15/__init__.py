"""Academic 4x4 15-Puzzle OOP AI Search package."""

from .actions import ALL_ACTIONS, Action
from .environment import (
    DIFFICULTY_PRESETS,
    PuzzleEnvironment,
    SequenceEvaluation,
    count_inversions,
    is_solvable_tiles,
)
from .heuristics import (
    HEURISTIC_REGISTRY,
    Evaluator,
    FitnessConfig,
    FitnessResult,
    conflict_count,
    get_heuristic,
    linear_conflict_count,
    manhattan_distance,
    manhattan_linear_conflict,
    misplaced_tiles,
)
from .solver_base import SearchMetrics, SearchResult, Solver
from .state import GOAL_TILES, GRID_SIZE, NUM_CELLS, Node, PuzzleState

__all__ = [
    "ALL_ACTIONS",
    "Action",
    "DIFFICULTY_PRESETS",
    "Evaluator",
    "FitnessConfig",
    "FitnessResult",
    "GOAL_TILES",
    "GRID_SIZE",
    "HEURISTIC_REGISTRY",
    "NUM_CELLS",
    "Node",
    "PuzzleEnvironment",
    "PuzzleState",
    "SearchMetrics",
    "SearchResult",
    "SequenceEvaluation",
    "Solver",
    "conflict_count",
    "count_inversions",
    "get_heuristic",
    "is_solvable_tiles",
    "linear_conflict_count",
    "manhattan_distance",
    "manhattan_linear_conflict",
    "misplaced_tiles",
]
