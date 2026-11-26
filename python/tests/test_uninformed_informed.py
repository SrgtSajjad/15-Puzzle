"""Unit tests for Uninformed and Informed search solvers."""

from __future__ import annotations

import unittest

from puzzle15 import PuzzleEnvironment, PuzzleState
from puzzle15.solvers import (
    AStarSolver,
    BFSSolver,
    DFSSolver,
    DLSSolver,
    GreedyBestFirstSolver,
    IDAStarSolver,
    IDDFSSolver,
    UCSSolver,
    WeightedAStarSolver,
)


class TestUninformedAndInformedSolvers(unittest.TestCase):
    def setUp(self) -> None:
        self.env = PuzzleEnvironment()
        self.board_d8, _ = self.env.generate_scramble(depth=8, seed=19)

    def _verify_solution_path(self, initial: PuzzleState, actions: list) -> None:
        state = initial
        for act in actions:
            state = self.env.result(state, act)
        self.assertTrue(self.env.goal_test(state))

    def test_all_uninformed_solvers_solve_depth8(self) -> None:
        solvers = [
            BFSSolver(self.env),
            UCSSolver(self.env),
            DLSSolver(self.env, depth_limit=10),
            DFSSolver(self.env, max_depth=12),
            IDDFSSolver(self.env, max_depth=12),
        ]
        optimal_cost = None
        for solver in solvers:
            res = solver.solve(self.board_d8)
            self.assertTrue(res.solved, f"{solver.name} failed: {res.status}")
            self._verify_solution_path(self.board_d8, res.actions)
            if solver.name in ("BFS", "UCS", "IDDFS"):
                if optimal_cost is None:
                    optimal_cost = res.path_cost
                else:
                    self.assertEqual(res.path_cost, optimal_cost)

    def test_all_informed_solvers_solve_and_match_optimal(self) -> None:
        bfs_res = BFSSolver(self.env).solve(self.board_d8)
        for heuristic in ("misplaced", "manhattan", "linear_conflict"):
            astar_res = AStarSolver(self.env, heuristic=heuristic).solve(self.board_d8)
            ida_res = IDAStarSolver(self.env, heuristic=heuristic).solve(self.board_d8)
            self.assertTrue(astar_res.solved)
            self.assertTrue(ida_res.solved)
            self.assertEqual(astar_res.path_cost, bfs_res.path_cost)
            self.assertEqual(ida_res.path_cost, bfs_res.path_cost)
            self._verify_solution_path(self.board_d8, astar_res.actions)
            self._verify_solution_path(self.board_d8, ida_res.actions)

        gbfs_res = GreedyBestFirstSolver(self.env).solve(self.board_d8)
        wastar_res = WeightedAStarSolver(self.env, weight=1.5).solve(self.board_d8)
        self.assertTrue(gbfs_res.solved)
        self.assertTrue(wastar_res.solved)
        self._verify_solution_path(self.board_d8, gbfs_res.actions)
        self._verify_solution_path(self.board_d8, wastar_res.actions)

    def test_idastar_solves_medium_board(self) -> None:
        medium = self.env.get_preset("medium")
        res = IDAStarSolver(self.env, heuristic="linear_conflict").solve(medium)
        self.assertTrue(res.solved)
        self._verify_solution_path(medium, res.actions)

    def test_unsolvable_board_rejected_immediately(self) -> None:
        unsolvable = PuzzleState.from_iterable(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0]
        )
        res = AStarSolver(self.env).solve(unsolvable)
        self.assertFalse(res.solved)
        self.assertEqual(res.status, "unsolvable")


if __name__ == "__main__":
    unittest.main()
