"""Unit tests for Local Search algorithms."""

from __future__ import annotations

import unittest

from puzzle15 import PuzzleEnvironment
from puzzle15.solvers import (
    HillClimbingSolver,
    LocalBeamSolver,
    SimulatedAnnealingSolver,
)


class TestLocalSearch(unittest.TestCase):
    def setUp(self) -> None:
        self.env = PuzzleEnvironment()
        self.board_d6, _ = self.env.generate_scramble(depth=6, seed=9)

    def test_local_search_trajectories_are_valid(self) -> None:
        solvers = [
            HillClimbingSolver(self.env, variant="steepest", seed=42),
            HillClimbingSolver(self.env, variant="stochastic", seed=42),
            HillClimbingSolver(self.env, variant="random_restart", seed=42),
            SimulatedAnnealingSolver(self.env, max_iterations=1000, seed=42),
            LocalBeamSolver(self.env, beam_width=10, max_steps=50),
        ]
        for solver in solvers:
            res = solver.solve(self.board_d6)
            curr = self.board_d6
            for act in res.actions:
                curr = self.env.result(curr, act)
            self.assertEqual(curr, res.final_state)
            self.assertEqual(res.path_cost, len(res.actions))
            if res.solved:
                self.assertTrue(self.env.goal_test(res.final_state))

    def test_local_beam_solves_easy_scramble(self) -> None:
        res = LocalBeamSolver(self.env, beam_width=12, max_steps=30).solve(self.board_d6)
        self.assertTrue(res.solved)


if __name__ == "__main__":
    unittest.main()
