"""Unit tests for PuzzleState, PuzzleEnvironment, solvability, and sequences."""

from __future__ import annotations

import random
import unittest

from puzzle15 import (
    Action,
    PuzzleEnvironment,
    PuzzleState,
    conflict_count,
    linear_conflict_count,
    manhattan_distance,
    misplaced_tiles,
)


class TestPuzzleEnvironment(unittest.TestCase):
    def setUp(self) -> None:
        self.env = PuzzleEnvironment()
        self.goal = PuzzleState.goal()

    def test_goal_state_is_solvable_and_passes_goal_test(self) -> None:
        self.assertTrue(self.env.goal_test(self.goal))
        self.assertTrue(self.env.is_solvable(self.goal))

    def test_single_swap_flips_solvability(self) -> None:
        # Swapping tiles 14 and 15 makes the 15-puzzle famously unsolvable
        unsolvable = PuzzleState.from_iterable(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0]
        )
        self.assertFalse(self.env.is_solvable(unsolvable))

    def test_valid_actions_and_transitions(self) -> None:
        valid = set(self.env.valid_actions(self.goal))
        self.assertEqual(valid, {Action.UP, Action.LEFT})

        moved_up = self.env.result(self.goal, Action.UP)
        self.assertEqual(moved_up.tiles[11], 0)
        self.assertEqual(moved_up.tiles[15], 12)
        self.assertTrue(self.env.is_solvable(moved_up))

        back = self.env.result(moved_up, Action.DOWN)
        self.assertEqual(back, self.goal)

    def test_illegal_action_raises(self) -> None:
        with self.assertRaises(ValueError):
            self.env.result(self.goal, Action.DOWN)

    def test_scramble_is_always_solvable(self) -> None:
        rng = random.Random(7)
        for depth in (5, 15, 35):
            board, moves = self.env.generate_scramble(depth=depth, rng=rng)
            self.assertEqual(len(moves), depth)
            self.assertTrue(self.env.is_solvable(board))

    def test_evaluate_sequence_stops_early_on_goal(self) -> None:
        # Two moves from goal: UP then LEFT; inverse to solve is RIGHT then DOWN
        s1 = self.env.result(self.goal, Action.UP)
        s2 = self.env.result(s1, Action.LEFT)
        seq = [Action.RIGHT, Action.DOWN, Action.UP, Action.LEFT, Action.UP]
        res = self.env.evaluate_sequence(
            initial_state=s2,
            sequence=seq,
            distance_fn=manhattan_distance,
            misplaced_fn=misplaced_tiles,
            linear_conflict_fn=linear_conflict_count,
            record_trajectory=True,
        )
        self.assertTrue(res.solved)
        self.assertEqual(res.path_cost, 2)
        self.assertEqual(res.conflict_count, 0)
        self.assertEqual(len(res.executed_actions), 2)
        self.assertEqual(res.final_state, self.goal)
        self.assertEqual(conflict_count(res.final_state), 0)

    def test_generate_random_sequence_avoids_inverses(self) -> None:
        rng = random.Random(123)
        board, _ = self.env.generate_scramble(depth=12, rng=rng)
        seq = self.env.generate_random_sequence(
            length=25, rng=rng, initial_state=board, avoid_inverse=True, valid_only=True
        )
        self.assertEqual(len(seq), 25)
        for a, b in zip(seq, seq[1:]):
            self.assertNotEqual(a.inverse, b)


if __name__ == "__main__":
    unittest.main()
