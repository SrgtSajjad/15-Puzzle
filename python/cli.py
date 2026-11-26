"""Command-line demo and solver runner for the 4x4 15-Puzzle AI Search project."""

from __future__ import annotations

import argparse
import json
from typing import Sequence

from puzzle15 import FitnessConfig, PuzzleEnvironment, PuzzleState, Solver
from puzzle15.solvers import (
    AStarSolver,
    BFSSolver,
    DFSSolver,
    DLSSolver,
    GAConfig,
    GeneticAlgorithmSolver,
    GreedyBestFirstSolver,
    HillClimbingSolver,
    IDAStarSolver,
    IDDFSSolver,
    LocalBeamSolver,
    SimulatedAnnealingSolver,
    UCSSolver,
    WeightedAStarSolver,
)


def build_solver(args: argparse.Namespace, env: PuzzleEnvironment) -> Solver:
    """Instantiate the requested solver with CLI hyperparameters."""
    algo = args.algorithm.lower()
    if algo == "bfs":
        return BFSSolver(env, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "dfs":
        return DFSSolver(env, max_depth=args.depth_limit, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "dls":
        return DLSSolver(env, depth_limit=args.depth_limit, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "iddfs":
        return IDDFSSolver(env, max_depth=args.depth_limit, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "ucs":
        return UCSSolver(env, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "gbfs":
        return GreedyBestFirstSolver(env, heuristic=args.heuristic, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "astar":
        return AStarSolver(env, heuristic=args.heuristic, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "wastar":
        return WeightedAStarSolver(env, heuristic=args.heuristic, weight=args.weight, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "idastar":
        return IDAStarSolver(env, heuristic=args.heuristic, max_nodes=args.max_nodes, max_time_ms=args.max_time_ms)
    if algo == "hc_steepest":
        return HillClimbingSolver(env, variant="steepest", heuristic=args.heuristic, seed=args.seed)
    if algo == "hc_stochastic":
        return HillClimbingSolver(env, variant="stochastic", heuristic=args.heuristic, seed=args.seed)
    if algo == "hc_restart":
        return HillClimbingSolver(env, variant="random_restart", heuristic=args.heuristic, seed=args.seed)
    if algo == "sa":
        return SimulatedAnnealingSolver(env, heuristic=args.heuristic, seed=args.seed)
    if algo == "beam":
        return LocalBeamSolver(env, heuristic=args.heuristic, beam_width=args.beam_width)
    if algo == "ga":
        fit_cfg = FitnessConfig(
            large_constant=args.large_constant,
            heuristic_name=args.heuristic,
        )
        ga_cfg = GAConfig(
            population_size=args.pop_size,
            sequence_length=args.seq_len,
            num_generations=args.generations,
            mutation_rate=args.mutation_rate,
            crossover_type=args.crossover,
            mutation_type=args.mutation,
            selection_method=args.selection,
            tournament_k=args.tournament_k,
            seed=args.seed,
            fitness_config=fit_cfg,
        )
        return GeneticAlgorithmSolver(env, config=ga_cfg)
    raise ValueError(f"Unsupported algorithm {args.algorithm!r}")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="4x4 15-Puzzle AI Search & Genetic Algorithm CLI Demo"
    )
    parser.add_argument("--preset", choices=["easy", "medium", "hard", "classic"], default="easy")
    parser.add_argument("--board", type=str, default=None, help="Comma-separated 16 tiles (0..15)")
    parser.add_argument("--scramble-depth", type=int, default=None, help="Override preset with random scramble depth")
    parser.add_argument(
        "--algorithm",
        choices=[
            "bfs", "dfs", "dls", "iddfs", "ucs",
            "gbfs", "astar", "wastar", "idastar",
            "hc_steepest", "hc_stochastic", "hc_restart", "sa", "beam", "ga",
        ],
        default="astar",
    )
    parser.add_argument("--heuristic", choices=["misplaced", "manhattan", "linear_conflict"], default="linear_conflict")
    parser.add_argument("--weight", type=float, default=1.5, help="Weight for Weighted A*")
    parser.add_argument("--depth-limit", type=int, default=28, help="Depth limit for DFS/DLS/IDDFS")
    parser.add_argument("--beam-width", type=int, default=12, help="Beam width for Local Beam Search")
    parser.add_argument("--max-nodes", type=int, default=150_000)
    parser.add_argument("--max-time-ms", type=float, default=5_000.0)
    # GA arguments
    parser.add_argument("--pop-size", type=int, default=50)
    parser.add_argument("--seq-len", type=int, default=36)
    parser.add_argument("--generations", type=int, default=120)
    parser.add_argument("--mutation-rate", type=float, default=0.15)
    parser.add_argument("--crossover", choices=["single_point", "two_point"], default="single_point")
    parser.add_argument("--mutation", choices=["point", "swap", "segment"], default="point")
    parser.add_argument("--selection", choices=["roulette", "tournament"], default="tournament")
    parser.add_argument("--tournament-k", type=int, default=4)
    parser.add_argument("--large-constant", type=float, default=10000.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--json", action="store_true", help="Emit full SearchResult JSON")
    parser.add_argument("--trace", action="store_true", help="Print step-by-step board transitions")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    env = PuzzleEnvironment()

    if args.board:
        tiles = [int(x.strip()) for x in args.board.split(",")]
        initial = PuzzleState.from_iterable(tiles)
    elif args.scramble_depth is not None:
        initial, _ = env.generate_scramble(depth=args.scramble_depth, seed=args.seed)
    else:
        initial = env.get_preset(args.preset)

    solver = build_solver(args, env)
    result = solver.solve(initial)

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    print("=== 4x4 15-Puzzle AI Search Demo ===")
    print(f"Algorithm : {result.algorithm} ({result.category})")
    if result.heuristic_name:
        print(f"Heuristic : {result.heuristic_name}")
    print(f"Solvable  : {env.is_solvable(initial)}")
    print("Initial State:")
    print(initial.format_grid())
    print("-" * 36)
    print(f"Status         : {result.status}")
    print(f"Solved         : {result.solved}")
    print(f"Path Cost      : {result.path_cost}")
    print(f"Nodes Expanded : {result.metrics.nodes_expanded}")
    print(f"Nodes Generated: {result.metrics.nodes_generated}")
    print(f"Max Frontier   : {result.metrics.max_frontier_size}")
    print(f"Elapsed (ms)   : {result.metrics.elapsed_ms:.3f}")
    if result.metrics.extra:
        print(f"Extra Metrics  : {result.metrics.extra}")
    if result.actions:
        print(f"Actions ({len(result.actions)}): {' '.join(a.short_code for a in result.actions)}")

    if args.trace and result.actions:
        print("\n--- Step-by-Step Trajectory ---")
        curr = initial
        for idx, action in enumerate(result.actions, start=1):
            curr = env.result(curr, action)
            print(f"Step {idx}: {action.value}")
            print(curr.format_grid())
            print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
