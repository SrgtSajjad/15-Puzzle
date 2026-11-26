"""Action definitions for the 4x4 15-Puzzle environment."""

from __future__ import annotations

from enum import Enum


class Action(str, Enum):
    """Blank-tile movement actions in the 4x4 15-Puzzle.

    Each action moves the blank (`0`) one cell in the named direction,
    which equivalently slides the adjacent tile into the blank from the
    opposite direction.
    """

    UP = "UP"
    DOWN = "DOWN"
    LEFT = "LEFT"
    RIGHT = "RIGHT"

    @property
    def delta(self) -> tuple[int, int]:
        """Return the (d_row, d_col) offset for moving the blank tile."""
        return _DELTAS[self]

    @property
    def inverse(self) -> Action:
        """Return the opposite action that cancels this move."""
        return _INVERSES[self]

    @property
    def short_code(self) -> str:
        """Return single-letter badge code (U, D, L, R)."""
        return self.value[0]


_DELTAS: dict[Action, tuple[int, int]] = {
    Action.UP: (-1, 0),
    Action.DOWN: (1, 0),
    Action.LEFT: (0, -1),
    Action.RIGHT: (0, 1),
}

_INVERSES: dict[Action, Action] = {
    Action.UP: Action.DOWN,
    Action.DOWN: Action.UP,
    Action.LEFT: Action.RIGHT,
    Action.RIGHT: Action.LEFT,
}

ALL_ACTIONS: tuple[Action, ...] = (
    Action.UP,
    Action.DOWN,
    Action.LEFT,
    Action.RIGHT,
)
