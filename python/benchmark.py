"""Multi-seed experiment & benchmark runner across all 15-Puzzle search families."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from puzzle15 import FitnessConfig, PuzzleEnvironment
from puzzle15.solvers import (
    AStarSolver,
    BFSSolver,
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


def run_benchmark_suite(seeds: list[int] | None = None) -> dict[str, Any]:
    """Run standardized experiments across Easy, Medium, and Classic presets."""
    env = PuzzleEnvironment()
    test_seeds = seeds or [11, 22, 33]

    suites: list[tuple[str, int]] = [
        ("easy_d8", 8),
        ("medium_d16", 16),
        ("hard_d28", 28),
    ]

    records: list[dict[str, Any]] = []
    for suite_name, depth in suites:
        for seed in test_seeds:
            board, _ = env.generate_scramble(depth=depth, seed=seed)
            solvers = [
                BFSSolver(env, max_nodes=40_000, max_time_ms=1500.0),
                UCSSolver(env, max_nodes=40_000, max_time_ms=1500.0),
                IDDFSSolver(env, max_depth=min(depth + 2, 22), max_nodes=60_000, max_time_ms=1500.0),
                GreedyBestFirstSolver(env, heuristic="linear_conflict", max_nodes=40_000, max_time_ms=1500.0),
                AStarSolver(env, heuristic="manhattan", max_nodes=50_000, max_time_ms=2000.0),
                AStarSolver(env, heuristic="linear_conflict", max_nodes=50_000, max_time_ms=2000.0),
                WeightedAStarSolver(env, heuristic="linear_conflict", weight=1.5, max_nodes=50_000, max_time_ms=2000.0),
                IDAStarSolver(env, heuristic="linear_conflict", max_nodes=120_000, max_time_ms=2500.0),
                HillClimbingSolver(env, variant="steepest", heuristic="linear_conflict", seed=seed),
                SimulatedAnnealingSolver(env, heuristic="linear_conflict", max_iterations=2500, seed=seed),
                LocalBeamSolver(env, heuristic="linear_conflict", beam_width=16, max_steps=150),
                GeneticAlgorithmSolver(
                    env,
                    config=GAConfig(
                        population_size=50,
                        sequence_length=max(24, depth + 12),
                        num_generations=80,
                        selection_method="tournament",
                        tournament_k=4,
                        crossover_type="two_point",
                        seed=seed,
                        fitness_config=FitnessConfig(heuristic_name="linear_conflict"),
                    ),
                ),
            ]

            for solver in solvers:
                res = solver.solve(board)
                label = res.algorithm
                if res.heuristic_name:
                    label = f"{res.algorithm} [{res.heuristic_name}]"
                records.append({
                    "suite": suite_name,
                    "scramble_depth": depth,
                    "seed": seed,
                    "algorithm": label,
                    "category": res.category,
                    "status": res.status,
                    "solved": res.solved,
                    "path_cost": res.path_cost,
                    "nodes_expanded": res.metrics.nodes_expanded,
                    "nodes_generated": res.metrics.nodes_generated,
                    "elapsed_ms": round(res.metrics.elapsed_ms, 3),
                })

    # Aggregate summary by (suite, algorithm)
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for rec in records:
        grouped.setdefault((rec["suite"], rec["algorithm"]), []).append(rec)

    summary: list[dict[str, Any]] = []
    for (suite_name, algo_name), rows in grouped.items():
        solved_rows = [r for r in rows if r["solved"]]
        n = len(rows)
        summary.append({
            "suite": suite_name,
            "algorithm": algo_name,
            "category": rows[0]["category"],
            "runs": n,
            "solve_rate": round(len(solved_rows) / n, 3),
            "avg_path_cost_solved": round(
                sum(r["path_cost"] for r in solved_rows) / len(solved_rows), 2
            ) if solved_rows else None,
            "avg_nodes_expanded": round(sum(r["nodes_expanded"] for r in rows) / n, 1),
            "avg_elapsed_ms": round(sum(r["elapsed_ms"] for r in rows) / n, 3),
        })

    return {"records": records, "summary": summary}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run 15-Puzzle Search Benchmark Suite")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("../reports/benchmark_summary.json"),
        help="Path to write JSON benchmark report",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Optional path to write CSV summary table",
    )
    args = parser.parse_args()

    report = run_benchmark_suite()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote benchmark JSON to {args.output} ({len(report['records'])} runs)")

    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", newline="", encoding="utf-8") as fh:
            fieldnames = list(report["summary"][0].keys())
            writer = csv.DictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(report["summary"])
        print(f"Wrote benchmark CSV to {args.csv}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
