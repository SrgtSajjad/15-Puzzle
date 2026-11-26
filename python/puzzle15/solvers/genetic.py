"""Darwinian Genetic Algorithm solver operating on fixed-length action sequences."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Optional, Sequence

from ..actions import ALL_ACTIONS, Action
from ..environment import PuzzleEnvironment
from ..heuristics import Evaluator, FitnessConfig, FitnessResult
from ..solver_base import SearchMetrics, SearchResult, Solver
from ..state import PuzzleState


@dataclass(slots=True)
class GAConfig:
    """Hyperparameters for the fixed-length action-sequence Genetic Algorithm."""

    population_size: int = 50
    sequence_length: int = 36
    num_generations: int = 120
    mutation_rate: float = 0.15
    crossover_rate: float = 0.85
    crossover_type: str = "single_point"   # "single_point" | "two_point"
    mutation_type: str = "point"           # "point" | "swap" | "segment"
    selection_method: str = "tournament"   # "roulette" | "tournament"
    tournament_k: int = 4
    elitism_count: int = 2
    avoid_inverse: bool = True
    repair_sequences: bool = True
    seed: int = 42
    fitness_config: FitnessConfig = field(default_factory=FitnessConfig)


class GeneticAlgorithmSolver(Solver):
    """Darwinian Genetic Algorithm evolving fixed-length action sequences."""

    name = "Genetic Algorithm"
    category = "evolutionary"

    def __init__(
        self,
        environment: PuzzleEnvironment,
        config: Optional[GAConfig] = None,
    ) -> None:
        super().__init__(environment)
        self.config = config or GAConfig()
        self.evaluator = Evaluator(environment, self.config.fitness_config)
        self.rng = random.Random(self.config.seed)

    def generate_population(self, initial_state: PuzzleState) -> list[list[Action]]:
        """Initialize `population_size` random action sequences of length L."""
        return [
            self.env.generate_random_sequence(
                length=self.config.sequence_length,
                rng=self.rng,
                initial_state=initial_state,
                avoid_inverse=self.config.avoid_inverse,
                valid_only=True,
            )
            for _ in range(self.config.population_size)
        ]

    def fitness(self, initial_state: PuzzleState, sequence: Sequence[Action]) -> FitnessResult:
        """Evaluate a chromosome sequence using the configured Evaluator."""
        return self.evaluator.fitness(initial_state, sequence)

    def _roulette_pick_index(self, fitness_scores: list[float]) -> int:
        """Fitness-proportionate roulette selection via normalized probability sum."""
        min_score = min(fitness_scores)
        shift = (1.0 - min_score) if min_score <= 0.0 else 0.0
        weights = [score + shift for score in fitness_scores]
        total = sum(weights)
        if total <= 0.0:
            return self.rng.randrange(len(fitness_scores))

        threshold = self.rng.random() * total
        cumulative = 0.0
        for idx, weight in enumerate(weights):
            cumulative += weight
            if cumulative >= threshold:
                return idx
        return len(weights) - 1

    def _tournament_pick_index(self, fitness_scores: list[float]) -> int:
        """Select the fittest candidate among `tournament_k` random samples."""
        k = min(max(1, self.config.tournament_k), len(fitness_scores))
        candidates = self.rng.sample(range(len(fitness_scores)), k)
        return max(candidates, key=lambda idx: fitness_scores[idx])

    def select(
        self,
        initial_state: PuzzleState,
        population: Sequence[Sequence[Action]],
        evaluated: Optional[Sequence[FitnessResult]] = None,
    ) -> list[tuple[list[Action], list[Action]]]:
        """Select parent pairs `(population_size // 2)` by calling `fitness()` internally."""
        results = list(evaluated) if evaluated is not None else [
            self.fitness(initial_state, seq) for seq in population
        ]
        scores = [res.fitness for res in results]
        num_pairs = max(1, len(population) // 2)
        method = self.config.selection_method.lower()

        pairs: list[tuple[list[Action], list[Action]]] = []
        for _ in range(num_pairs):
            if method == "roulette":
                i1 = self._roulette_pick_index(scores)
                i2 = self._roulette_pick_index(scores)
            elif method == "tournament":
                i1 = self._tournament_pick_index(scores)
                i2 = self._tournament_pick_index(scores)
            else:
                raise ValueError(
                    f"Unknown selection method {self.config.selection_method!r}. "
                    "Use 'roulette' or 'tournament'."
                )
            pairs.append((list(population[i1]), list(population[i2])))
        return pairs

    def crossover(
        self,
        parent_a: Sequence[Action],
        parent_b: Sequence[Action],
        initial_state: Optional[PuzzleState] = None,
    ) -> tuple[list[Action], list[Action]]:
        """Perform single-point or two-point crossover on two parent sequences."""
        length = min(len(parent_a), len(parent_b))
        if length < 2 or self.rng.random() > self.config.crossover_rate:
            return list(parent_a), list(parent_b)

        ctype = self.config.crossover_type.lower()
        if ctype == "single_point":
            pt = self.rng.randint(1, length - 1)
            child_a = list(parent_a[:pt]) + list(parent_b[pt:])
            child_b = list(parent_b[:pt]) + list(parent_a[pt:])
        elif ctype == "two_point":
            p1, p2 = sorted(self.rng.sample(range(1, length), 2)) if length > 2 else (1, 1)
            child_a = list(parent_a[:p1]) + list(parent_b[p1:p2]) + list(parent_a[p2:])
            child_b = list(parent_b[:p1]) + list(parent_a[p1:p2]) + list(parent_b[p2:])
        else:
            raise ValueError(f"Unknown crossover type {self.config.crossover_type!r}")

        if self.config.repair_sequences and initial_state is not None:
            child_a = self.env.repair_sequence(initial_state, child_a, rng=self.rng)
            child_b = self.env.repair_sequence(initial_state, child_b, rng=self.rng)
        return child_a, child_b

    def mutate(
        self,
        sequence: Sequence[Action],
        initial_state: Optional[PuzzleState] = None,
    ) -> list[Action]:
        """Apply stochastic mutation (`point`, `swap`, or `segment`) using seeded RNG."""
        seq = list(sequence)
        if not seq or self.rng.random() > self.config.mutation_rate:
            return seq

        mtype = self.config.mutation_type.lower()
        n = len(seq)
        if mtype == "point":
            idx = self.rng.randrange(n)
            alternatives = [a for a in ALL_ACTIONS if a != seq[idx]]
            seq[idx] = self.rng.choice(alternatives)
        elif mtype == "swap":
            if n >= 2:
                i, j = self.rng.sample(range(n), 2)
                seq[i], seq[j] = seq[j], seq[i]
        elif mtype == "segment":
            seg_len = min(n, max(2, n // 6))
            start = self.rng.randint(0, n - seg_len)
            for offset in range(seg_len):
                seq[start + offset] = self.rng.choice(ALL_ACTIONS)
        else:
            raise ValueError(f"Unknown mutation type {self.config.mutation_type!r}")

        if self.config.repair_sequences and initial_state is not None:
            seq = self.env.repair_sequence(initial_state, seq, rng=self.rng)
        return seq

    def solve(self, initial_state: PuzzleState) -> SearchResult:
        """Run Darwinian generational evolution and track conflict_count == 0."""
        heuristic_name = self.config.fitness_config.heuristic_name
        if not self.env.is_solvable(initial_state):
            return self._unsolvable_result(initial_state, heuristic_name=heuristic_name)

        start = time.perf_counter()
        self.rng = random.Random(self.config.seed)

        if self.env.goal_test(initial_state):
            return SearchResult(
                algorithm=self.name,
                category=self.category,
                status="solved",
                solved=True,
                initial_state=initial_state,
                final_state=initial_state,
                actions=[],
                path_cost=0,
                heuristic_name=heuristic_name,
                metrics=SearchMetrics(0, 1, self.config.population_size, 0.0),
            )

        population = self.generate_population(initial_state)
        total_evaluations = 0
        history: list[dict[str, float | int | bool]] = []
        best_sequence: list[Action] = list(population[0])
        best_result: Optional[FitnessResult] = None
        goal_reached_generation: Optional[int] = None

        for gen in range(self.config.num_generations):
            evaluated = [self.fitness(initial_state, seq) for seq in population]
            total_evaluations += len(evaluated)

            best_idx = max(range(len(evaluated)), key=lambda i: evaluated[i].fitness)
            gen_best = evaluated[best_idx]

            if best_result is None or gen_best.fitness > best_result.fitness:
                best_result = gen_best
                best_sequence = list(population[best_idx])

            solved_in_gen = [res for res in evaluated if res.evaluation.conflict_count == 0]
            if solved_in_gen and goal_reached_generation is None:
                goal_reached_generation = gen

            mean_fit = sum(r.fitness for r in evaluated) / len(evaluated)
            min_conflicts = min(r.evaluation.conflict_count for r in evaluated)
            min_distance = min(r.evaluation.distance for r in evaluated)
            best_solved_cost = (
                min(r.evaluation.path_cost for r in solved_in_gen)
                if solved_in_gen
                else gen_best.evaluation.path_cost
            )

            history.append({
                "generation": gen,
                "best_fitness": round(gen_best.fitness, 3),
                "mean_fitness": round(mean_fit, 3),
                "min_conflicts": min_conflicts,
                "min_distance": min_distance,
                "best_path_cost": best_solved_cost,
                "solved_count": len(solved_in_gen),
                "goal_reached": bool(solved_in_gen),
            })

            # Build next generation
            ranked = sorted(
                range(len(population)),
                key=lambda i: evaluated[i].fitness,
                reverse=True,
            )
            elite_n = min(self.config.elitism_count, len(population))
            next_pop: list[list[Action]] = [list(population[i]) for i in ranked[:elite_n]]

            parent_pairs = self.select(initial_state, population, evaluated=evaluated)
            pair_idx = 0
            while len(next_pop) < self.config.population_size:
                p_a, p_b = parent_pairs[pair_idx % len(parent_pairs)]
                pair_idx += 1
                c_a, c_b = self.crossover(p_a, p_b, initial_state=initial_state)
                c_a = self.mutate(c_a, initial_state=initial_state)
                c_b = self.mutate(c_b, initial_state=initial_state)
                next_pop.append(c_a)
                if len(next_pop) < self.config.population_size:
                    next_pop.append(c_b)

            population = next_pop

        assert best_result is not None
        final_eval = self.evaluator.evaluate_sequence(
            initial_state, best_sequence, record_trajectory=True
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return SearchResult(
            algorithm=self.name,
            category=self.category,
            status="solved" if final_eval.solved else "limit_reached",
            solved=final_eval.solved,
            initial_state=initial_state,
            final_state=final_eval.final_state,
            actions=list(final_eval.executed_actions),
            path_cost=final_eval.path_cost,
            heuristic_name=heuristic_name,
            metrics=SearchMetrics(
                nodes_expanded=total_evaluations,
                nodes_generated=total_evaluations,
                max_frontier_size=self.config.population_size,
                elapsed_ms=elapsed_ms,
                extra={
                    "best_fitness": round(best_result.fitness, 3),
                    "final_conflict_count": final_eval.conflict_count,
                    "final_distance": final_eval.distance,
                    "goal_reached_generation": goal_reached_generation,
                    "selection_method": self.config.selection_method,
                    "crossover_type": self.config.crossover_type,
                    "mutation_type": self.config.mutation_type,
                    "generations": self.config.num_generations,
                },
            ),
            history=history,
        )
