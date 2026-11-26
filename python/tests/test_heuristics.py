"""Unit tests for heuristics and GA fitness evaluation invariants."""

from __future__ import annotations

import unittest

from puzzle15 import (
    Action,
    Evaluator,
    FitnessConfig,
    PuzzleEnvironment,
    PuzzleState,
    conflict_count,
    linear_conflict_count,
    manhattan_distance,
    manhattan_linear_conflict,
    misplaced_tiles,
)


class TestHeuristicsAndFitness(unittest.TestCase):
    def setUp(self) -> None:
        self.env = PuzzleEnvironment()
        self.goal = PuzzleState.goal()
        self.evaluator = Evaluator(self.env, FitnessConfig())

    def test_zero_on_goal(self) -> None:
        self.assertEqual(misplaced_tiles(self.goal), 0)
        self.assertEqual(manhattan_distance(self.goal), 0)
        self.assertEqual(linear_conflict_count(self.goal), 0)
        self.assertEqual(manhattan_linear_conflict(self.goal), 0)
        self.assertEqual(conflict_count(self.goal), 0)

    def test_linear_conflict_detection(self) -> None:
        # Swap 1 and 2 in row 0, and 5 and 9 in col 0 -> row conflict + col conflict
        board = PuzzleState.from_iterable(
            [2, 1, 3, 4, 9, 6, 7, 8, 5, 10, 11, 12, 13, 14, 15, 0]
        )
        self.assertEqual(linear_conflict_count(board), 2)
        self.assertEqual(
            manhattan_linear_conflict(board),
            manhattan_distance(board) + 4,
        )

    def test_solved_fitness_strictly_beats_unsolved_and_prefers_shorter_paths(self) -> None:
        start = self.env.result(self.goal, Action.UP)
        short_solve = [Action.DOWN]
        long_solve = [Action.LEFT, Action.RIGHT, Action.DOWN]
        unsolved = [Action.UP, Action.LEFT, Action.LEFT]

        f_short = self.evaluator.fitness(start, short_solve)
        f_long = self.evaluator.fitness(start, long_solve)
        f_unsolved = self.evaluator.fitness(start, unsolved)

        self.assertTrue(f_short.evaluation.solved)
        self.assertTrue(f_long.evaluation.solved)
        self.assertFalse(f_unsolved.evaluation.solved)

        self.assertGreater(f_short.fitness, f_long.fitness)
        self.assertGreater(f_long.fitness, f_unsolved.fitness)


if __name__ == "__main__":
    unittest.main()
