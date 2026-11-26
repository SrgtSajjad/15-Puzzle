"""Unit tests for Effective Branching Factor bisection and evaluation helpers."""

from __future__ import annotations

import unittest

from evaluate_report import count_action_axes, effective_branching_factor
from puzzle15 import Action


class TestEvaluationMetrics(unittest.TestCase):
    def test_effective_branching_factor_exact_polynomial(self) -> None:
        # If b* = 2.0 and d = 4 -> 1 + 2 + 4 + 8 + 16 = 31 => N = 30
        b = effective_branching_factor(30, 4)
        self.assertAlmostEqual(b, 2.0, places=5)

        # If N == d -> linear path => b* = 1.0
        self.assertEqual(effective_branching_factor(10, 10), 1.0)
        self.assertEqual(effective_branching_factor(0, 0), 0.0)

    def test_count_action_axes(self) -> None:
        v, h = count_action_axes([Action.UP, Action.LEFT, Action.DOWN, Action.RIGHT, Action.UP])
        self.assertEqual(v, 3)
        self.assertEqual(h, 2)


if __name__ == "__main__":
    unittest.main()
