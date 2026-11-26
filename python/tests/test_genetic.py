"""Unit tests for the Darwinian Genetic Algorithm solver."""

from __future__ import annotations

import unittest

from puzzle15 import FitnessConfig, PuzzleEnvironment
from puzzle15.solvers import GAConfig, GeneticAlgorithmSolver


class TestGeneticAlgorithm(unittest.TestCase):
    def setUp(self) -> None:
        self.env = PuzzleEnvironment()
        self.board_d6, _ = self.env.generate_scramble(depth=6, seed=14)

    def test_select_returns_half_population_pairs(self) -> None:
        cfg = GAConfig(population_size=50, sequence_length=16, selection_method="tournament", tournament_k=4)
        ga = GeneticAlgorithmSolver(self.env, config=cfg)
        pop = ga.generate_population(self.board_d6)
        pairs = ga.select(self.board_d6, pop)
        self.assertEqual(len(pairs), 25)
        for p1, p2 in pairs:
            self.assertEqual(len(p1), 16)
            self.assertEqual(len(p2), 16)

    def test_roulette_and_two_point_crossover(self) -> None:
        cfg = GAConfig(
            population_size=40,
            sequence_length=14,
            selection_method="roulette",
            crossover_type="two_point",
            mutation_type="swap",
            seed=77,
        )
        ga = GeneticAlgorithmSolver(self.env, config=cfg)
        pop = ga.generate_population(self.board_d6)
        pairs = ga.select(self.board_d6, pop)
        self.assertEqual(len(pairs), 20)
        c1, c2 = ga.crossover(pairs[0][0], pairs[0][1], initial_state=self.board_d6)
        self.assertEqual(len(c1), 14)
        self.assertEqual(len(c2), 14)

    def test_ga_solves_easy_scramble_and_is_deterministic(self) -> None:
        cfg = GAConfig(
            population_size=50,
            sequence_length=18,
            num_generations=80,
            mutation_rate=0.2,
            crossover_type="single_point",
            selection_method="tournament",
            tournament_k=4,
            seed=42,
            fitness_config=FitnessConfig(large_constant=10000.0),
        )
        res1 = GeneticAlgorithmSolver(self.env, config=cfg).solve(self.board_d6)
        res2 = GeneticAlgorithmSolver(self.env, config=cfg).solve(self.board_d6)

        self.assertTrue(res1.solved)
        self.assertEqual(res1.metrics.extra["final_conflict_count"], 0)
        self.assertIsNotNone(res1.metrics.extra["goal_reached_generation"])
        self.assertEqual(res1.actions, res2.actions)
        self.assertEqual(res1.path_cost, res2.path_cost)
        self.assertEqual(len(res1.history), 80)


if __name__ == "__main__":
    unittest.main()
