"""Immutable 15-Puzzle state and search-tree node representations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from .actions import Action

GRID_SIZE = 4
NUM_CELLS = GRID_SIZE * GRID_SIZE
GOAL_TILES: tuple[int, ...] = (
    1, 2, 3, 4,
    5, 6, 7, 8,
    9, 10, 11, 12,
    13, 14, 15, 0,
)


@dataclass(frozen=True, slots=True)
class PuzzleState:
    """Immutable row-major state representation for the 4x4 15-Puzzle."""

    tiles: tuple[int, ...]
    blank_index: int

    @classmethod
    def from_iterable(cls, values: Iterable[int]) -> PuzzleState:
        """Construct a validated PuzzleState from an iterable of 16 ints."""
        tiles = tuple(int(v) for v in values)
        if len(tiles) != NUM_CELLS or set(tiles) != set(range(NUM_CELLS)):
            raise ValueError(
                f"State must be a permutation of 0..{NUM_CELLS - 1}; got {tiles!r}"
            )
        return cls(tiles=tiles, blank_index=tiles.index(0))

    @classmethod
    def goal(cls) -> PuzzleState:
        """Return the canonical goal state."""
        return cls(tiles=GOAL_TILES, blank_index=NUM_CELLS - 1)

    @property
    def blank_row(self) -> int:
        """Zero-based row index of the blank from the top (0..3)."""
        return self.blank_index // GRID_SIZE

    @property
    def blank_col(self) -> int:
        """Zero-based column index of the blank from the left (0..3)."""
        return self.blank_index % GRID_SIZE

    @property
    def blank_row_from_bottom(self) -> int:
        """One-based row index of the blank counting from the bottom (1..4)."""
        return GRID_SIZE - self.blank_row

    def to_matrix(self) -> list[list[int]]:
        """Return a 4x4 nested list representation."""
        return [
            list(self.tiles[r * GRID_SIZE : (r + 1) * GRID_SIZE])
            for r in range(GRID_SIZE)
        ]

    def format_grid(self) -> str:
        """Format the board as an aligned 4x4 ASCII block."""
        lines = []
        for row in self.to_matrix():
            lines.append(" ".join(" ." if v == 0 else f"{v:2d}" for v in row))
        return "\n".join(lines)


@dataclass(slots=True)
class Node:
    """Search tree node linking state, parent, action, path cost, and depth."""

    state: PuzzleState
    parent: Optional[Node] = None
    action: Optional[Action] = None
    path_cost: int = 0
    depth: int = 0

    def reconstruct_actions(self) -> list[Action]:
        """Trace actions from the root node down to this node."""
        actions: list[Action] = []
        curr: Optional[Node] = self
        while curr is not None and curr.action is not None:
            actions.append(curr.action)
            curr = curr.parent
        actions.reverse()
        return actions

    def reconstruct_states(self) -> list[PuzzleState]:
        """Trace states from the root node down to this node."""
        states: list[PuzzleState] = []
        curr: Optional[Node] = self
        while curr is not None:
            states.append(curr.state)
            curr = curr.parent
        states.reverse()
        return states
