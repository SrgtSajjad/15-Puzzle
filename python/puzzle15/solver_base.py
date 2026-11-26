"""Abstract Solver interface and standardized search result telemetry."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from .actions import Action
from .environment import PuzzleEnvironment
from .state import PuzzleState


@dataclass(slots=True)
class SearchMetrics:
    """Telemetry collected during a search or metaheuristic run."""

    nodes_expanded: int = 0
    nodes_generated: int = 0
    max_frontier_size: int = 0
    elapsed_ms: float = 0.0
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SearchResult:
    """Unified output structure returned by all 15-Puzzle solvers."""

    algorithm: str
    category: str
    status: str  # "solved", "limit_reached", "cutoff", "local_optimum", "unsolvable", "not_found"
    solved: bool
    initial_state: PuzzleState
    final_state: PuzzleState
    actions: list[Action]
    path_cost: int
    metrics: SearchMetrics
    heuristic_name: Optional[str] = None
    history: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize the result into a JSON-compatible dictionary."""
        return {
            "algorithm": self.algorithm,
            "category": self.category,
            "status": self.status,
            "solved": self.solved,
            "initial_tiles": list(self.initial_state.tiles),
            "final_tiles": list(self.final_state.tiles),
            "actions": [a.value for a in self.actions],
            "path_cost": self.path_cost,
            "heuristic_name": self.heuristic_name,
            "metrics": {
                "nodes_expanded": self.metrics.nodes_expanded,
                "nodes_generated": self.metrics.nodes_generated,
                "max_frontier_size": self.metrics.max_frontier_size,
                "elapsed_ms": round(self.metrics.elapsed_ms, 3),
                "extra": self.metrics.extra,
            },
            "history": self.history,
        }


class Solver(ABC):
    """Abstract base class for all 15-Puzzle search and metaheuristic solvers."""

    name: str = "BaseSolver"
    category: str = "abstract"

    def __init__(self, environment: PuzzleEnvironment) -> None:
        self.env = environment

    @abstractmethod
    def solve(self, initial_state: PuzzleState) -> SearchResult:
        """Execute search starting from `initial_state` and return SearchResult."""

    def _unsolvable_result(
        self, initial_state: PuzzleState, heuristic_name: Optional[str] = None
    ) -> SearchResult:
        return SearchResult(
            algorithm=self.name,
            category=self.category,
            status="unsolvable",
            solved=False,
            initial_state=initial_state,
            final_state=initial_state,
            actions=[],
            path_cost=0,
            metrics=SearchMetrics(),
            heuristic_name=heuristic_name,
        )
