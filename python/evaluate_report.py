"""Reproducible empirical evaluation and publication-ready figure generator.

Runs multi-depth 4x4 15-Puzzle experiments across all four search families,
computes Effective Branching Factor (b*) via bisection, evaluates Greedy vs.
Optimal solution ratios, analyzes vertical vs. horizontal action symmetry,
performs Darwinian GA selection/crossover ablations, and writes JSON metrics
plus publication-ready charts to `reports/figures/`.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path
from typing import Any

from puzzle15 import Action, FitnessConfig, PuzzleEnvironment
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
    WeightedAStarSolver,
)


def effective_branching_factor(
    nodes_expanded: int, depth: int, tol: float = 1e-9, max_iter: int = 100
) -> float:
    """Solve N + 1 = 1 + b* + (b*)^2 + ... + (b*)^d for b* >= 1.0 using bisection."""
    if depth <= 0:
        return 0.0
    if nodes_expanded <= depth:
        return 1.0

    target = float(nodes_expanded + 1)

    def poly_sum(b: float) -> float:
        if abs(b - 1.0) < 1e-12:
            return float(depth + 1)
        total = 1.0
        term = 1.0
        for _ in range(depth):
            term *= b
            total += term
        return total

    low = 1.0
    high = max(2.0, float(nodes_expanded) ** (1.0 / depth) + 1.0)
    while poly_sum(high) < target:
        high *= 2.0

    for _ in range(max_iter):
        mid = 0.5 * (low + high)
        val = poly_sum(mid)
        if abs(val - target) <= tol or (high - low) <= tol:
            return round(mid, 6)
        if val < target:
            low = mid
        else:
            high = mid
    return round(0.5 * (low + high), 6)


def count_action_axes(actions: list[Action]) -> tuple[int, int]:
    """Return (vertical_count, horizontal_count) for a solution action sequence."""
    vertical = sum(1 for a in actions if a in (Action.UP, Action.DOWN))
    horizontal = sum(1 for a in actions if a in (Action.LEFT, Action.RIGHT))
    return vertical, horizontal


def run_experiments(
    depths: list[int] | None = None,
    seeds: list[int] | None = None,
) -> dict[str, Any]:
    """Run standardized multi-depth experiments and GA ablations."""
    env = PuzzleEnvironment()
    exp_depths = depths or [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
    exp_seeds = seeds or [101, 202, 303]

    instance_records: list[dict[str, Any]] = []
    algorithm_runs: list[dict[str, Any]] = []

    for depth in exp_depths:
        for seed in exp_seeds:
            board, _ = env.generate_scramble(depth=depth, seed=seed)

            # Exact optimal baseline via IDA* (Manhattan + Linear Conflict)
            opt_res = IDAStarSolver(
                env, heuristic="linear_conflict", max_nodes=500_000, max_time_ms=8_000.0
            ).solve(board)
            assert opt_res.solved, f"Baseline IDA* failed on depth={depth}, seed={seed}"
            d_star = opt_res.path_cost
            v_cnt, h_cnt = count_action_axes(opt_res.actions)

            greedy_res = GreedyBestFirstSolver(
                env, heuristic="linear_conflict", max_nodes=80_000, max_time_ms=3_000.0
            ).solve(board)
            greedy_cost = greedy_res.path_cost if greedy_res.solved else None
            greedy_ratio = (
                round(greedy_cost / d_star, 4)
                if (greedy_cost is not None and d_star > 0)
                else (1.0 if greedy_cost == 0 else None)
            )

            instance_records.append({
                "scramble_depth": depth,
                "seed": seed,
                "optimal_cost": d_star,
                "vertical_actions": v_cnt,
                "horizontal_actions": h_cnt,
                "greedy_cost": greedy_cost,
                "greedy_solved": greedy_res.solved,
                "greedy_opt_ratio": greedy_ratio,
                "greedy_nodes": greedy_res.metrics.nodes_expanded,
            })

            solvers = [
                ("BFS", BFSSolver(env, max_nodes=40_000, max_time_ms=1_500.0)),
                ("IDDFS", IDDFSSolver(env, max_depth=max(depth + 2, 16), max_nodes=60_000, max_time_ms=1_500.0)),
                ("A* (Misplaced)", AStarSolver(env, heuristic="misplaced", max_nodes=80_000, max_time_ms=3_000.0)),
                ("A* (Manhattan)", AStarSolver(env, heuristic="manhattan", max_nodes=80_000, max_time_ms=3_000.0)),
                ("A* (Linear Conflict)", AStarSolver(env, heuristic="linear_conflict", max_nodes=80_000, max_time_ms=3_000.0)),
                ("Weighted A* (w=1.5)", WeightedAStarSolver(env, heuristic="linear_conflict", weight=1.5, max_nodes=80_000, max_time_ms=3_000.0)),
                ("IDA* (Linear Conflict)", None),  # Reuse exact baseline opt_res
                ("Greedy Best-First", None),       # Reuse greedy_res
                ("Hill Climbing (Steepest)", HillClimbingSolver(env, variant="steepest", heuristic="linear_conflict", seed=seed)),
                ("Hill Climbing (Restart)", HillClimbingSolver(env, variant="random_restart", heuristic="linear_conflict", seed=seed)),
                ("Simulated Annealing", SimulatedAnnealingSolver(env, heuristic="linear_conflict", max_iterations=2_500, seed=seed)),
                ("Local Beam (k=16)", LocalBeamSolver(env, heuristic="linear_conflict", beam_width=16, max_steps=160)),
            ]

            for label, solver in solvers:
                if label == "IDA* (Linear Conflict)":
                    res = opt_res
                elif label == "Greedy Best-First":
                    res = greedy_res
                else:
                    assert solver is not None
                    res = solver.solve(board)

                b_star = (
                    effective_branching_factor(res.metrics.nodes_expanded, d_star)
                    if res.solved
                    else None
                )
                algorithm_runs.append({
                    "scramble_depth": depth,
                    "seed": seed,
                    "optimal_cost": d_star,
                    "algorithm": label,
                    "category": res.category,
                    "status": res.status,
                    "solved": res.solved,
                    "path_cost": res.path_cost,
                    "nodes_expanded": res.metrics.nodes_expanded,
                    "nodes_generated": res.metrics.nodes_generated,
                    "elapsed_ms": round(res.metrics.elapsed_ms, 3),
                    "effective_b_star": b_star,
                })

    # GA Ablation across 4 selection/crossover configurations on depths [6, 8, 10] x 4 seeds
    ga_configs = [
        ("4-Tournament + 2-Point", "tournament", "two_point"),
        ("4-Tournament + 1-Point", "tournament", "single_point"),
        ("Roulette + 2-Point", "roulette", "two_point"),
        ("Roulette + 1-Point", "roulette", "single_point"),
    ]
    ga_depths = [6, 8, 10]
    ga_seeds = [11, 22, 33, 44]
    ga_runs: list[dict[str, Any]] = []
    ga_histories: dict[str, list[list[dict[str, Any]]]] = {cfg[0]: [] for cfg in ga_configs}

    for depth in ga_depths:
        for seed in ga_seeds:
            board, _ = env.generate_scramble(depth=depth, seed=seed)
            for label, selection, crossover in ga_configs:
                ga = GeneticAlgorithmSolver(
                    env,
                    config=GAConfig(
                        population_size=50,
                        sequence_length=24,
                        num_generations=80,
                        mutation_rate=0.18,
                        crossover_type=crossover,
                        selection_method=selection,
                        tournament_k=4,
                        seed=seed,
                        fitness_config=FitnessConfig(heuristic_name="linear_conflict"),
                    ),
                )
                res = ga.solve(board)
                ga_histories[label].append(res.history)
                ga_runs.append({
                    "config": label,
                    "scramble_depth": depth,
                    "seed": seed,
                    "solved": res.solved,
                    "path_cost": res.path_cost,
                    "best_fitness": res.metrics.extra.get("best_fitness"),
                    "final_conflict_count": res.metrics.extra.get("final_conflict_count"),
                    "goal_reached_generation": res.metrics.extra.get("goal_reached_generation"),
                    "elapsed_ms": round(res.metrics.elapsed_ms, 2),
                })

    # Aggregate statistics
    algo_summary = _summarize_algorithms(algorithm_runs)
    greedy_stats = _summarize_greedy_ratios(instance_records)
    ga_summary, ga_curves = _summarize_ga(ga_runs, ga_histories)

    return {
        "meta": {
            "num_instances": len(instance_records),
            "depths": exp_depths,
            "seeds": exp_seeds,
            "ga_instances": len(ga_depths) * len(ga_seeds),
        },
        "instances": instance_records,
        "algorithm_runs": algorithm_runs,
        "algorithm_summary": algo_summary,
        "greedy_stats": greedy_stats,
        "ga_runs": ga_runs,
        "ga_summary": ga_summary,
        "ga_mean_curves": ga_curves,
    }


def _summarize_algorithms(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in runs:
        grouped.setdefault(row["algorithm"], []).append(row)

    summary = []
    for algo, rows in grouped.items():
        solved = [r for r in rows if r["solved"]]
        b_vals = [r["effective_b_star"] for r in solved if r["effective_b_star"] is not None]
        summary.append({
            "algorithm": algo,
            "category": rows[0]["category"],
            "runs": len(rows),
            "solved_count": len(solved),
            "solve_rate": round(len(solved) / len(rows), 4),
            "mean_path_cost": round(statistics.mean(r["path_cost"] for r in solved), 2) if solved else None,
            "mean_nodes_expanded": round(statistics.mean(r["nodes_expanded"] for r in rows), 1),
            "mean_nodes_solved": round(statistics.mean(r["nodes_expanded"] for r in solved), 1) if solved else None,
            "mean_elapsed_ms": round(statistics.mean(r["elapsed_ms"] for r in rows), 2),
            "mean_b_star": round(statistics.mean(b_vals), 4) if b_vals else None,
            "max_b_star": round(max(b_vals), 4) if b_vals else None,
        })
    return summary


def _summarize_greedy_ratios(instances: list[dict[str, Any]]) -> dict[str, Any]:
    ratios = [r["greedy_opt_ratio"] for r in instances if r["greedy_opt_ratio"] is not None]
    bins = [
        ("1.00 (Optimal)", 0.999, 1.001),
        ("1.01 – 1.50", 1.001, 1.50),
        ("1.51 – 2.00", 1.50, 2.00),
        ("2.01 – 3.00", 2.00, 3.00),
        ("> 3.00", 3.00, 1e9),
    ]
    freq_table = []
    for label, lo, hi in bins:
        cnt = sum(1 for v in ratios if lo < v <= hi) if lo > 1.0 else sum(1 for v in ratios if lo <= v <= hi)
        freq_table.append({
            "bin": label,
            "count": cnt,
            "percentage": round(100.0 * cnt / max(1, len(ratios)), 1),
        })

    return {
        "count": len(ratios),
        "min": round(min(ratios), 4),
        "median": round(statistics.median(ratios), 4),
        "mean": round(statistics.mean(ratios), 4),
        "stdev": round(statistics.stdev(ratios), 4) if len(ratios) > 1 else 0.0,
        "max": round(max(ratios), 4),
        "frequency_table": freq_table,
    }


def _summarize_ga(
    ga_runs: list[dict[str, Any]],
    histories: dict[str, list[list[dict[str, Any]]]],
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, float]]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for r in ga_runs:
        grouped.setdefault(r["config"], []).append(r)

    summary = []
    curves: dict[str, list[dict[str, float]]] = {}
    for cfg_name, rows in grouped.items():
        solved = [r for r in rows if r["solved"]]
        gens = [r["goal_reached_generation"] for r in solved if r["goal_reached_generation"] is not None]
        summary.append({
            "config": cfg_name,
            "runs": len(rows),
            "solve_rate": round(len(solved) / len(rows), 4),
            "mean_best_fitness": round(statistics.mean(r["best_fitness"] for r in rows), 1),
            "mean_solved_cost": round(statistics.mean(r["path_cost"] for r in solved), 2) if solved else None,
            "mean_goal_generation": round(statistics.mean(gens), 1) if gens else None,
            "mean_final_conflict": round(statistics.mean(r["final_conflict_count"] for r in rows), 2),
        })

        hist_list = histories[cfg_name]
        num_gens = len(hist_list[0])
        curve = []
        for g in range(num_gens):
            curve.append({
                "generation": g,
                "mean_best_fitness": round(statistics.mean(h[g]["best_fitness"] for h in hist_list), 2),
                "mean_avg_fitness": round(statistics.mean(h[g]["mean_fitness"] for h in hist_list), 2),
                "mean_min_conflicts": round(statistics.mean(h[g]["min_conflicts"] for h in hist_list), 2),
            })
        curves[cfg_name] = curve

    return summary, curves


def generate_figures(data: dict[str, Any], out_dir: Path) -> list[str]:
    """Generate publication-ready charts in `reports/figures/` using Matplotlib."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out_dir.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({
        "font.size": 10,
        "axes.titlesize": 11.5,
        "axes.titleweight": "bold",
        "axes.grid": True,
        "grid.alpha": 0.28,
        "grid.linestyle": "--",
        "figure.facecolor": "white",
        "axes.facecolor": "#fafbfd",
    })

    saved: list[str] = []
    instances = data["instances"]
    runs = data["algorithm_runs"]

    # 1. Histogram of Greedy_opt_ratio
    ratios = [r["greedy_opt_ratio"] for r in instances if r["greedy_opt_ratio"] is not None]
    g_stats = data["greedy_stats"]
    fig, ax = plt.subplots(figsize=(7.2, 4.4), dpi=180)
    ax.hist(ratios, bins=12, color="#2563eb", edgecolor="#1e3a8a", alpha=0.82)
    ax.axvline(1.0, color="#059669", linestyle="-", linewidth=1.8, label="Optimal (ratio = 1.00)")
    ax.axvline(g_stats["mean"], color="#dc2626", linestyle="--", linewidth=1.8, label=f"Mean ({g_stats['mean']:.2f})")
    ax.axvline(g_stats["median"], color="#d97706", linestyle=":", linewidth=2.0, label=f"Median ({g_stats['median']:.2f})")
    ax.set_title("Distribution of Greedy-to-Optimal Cost Ratio (33 Solvable Instances)")
    ax.set_xlabel("Greedy_opt_ratio = Greedy Cost / Optimal Cost (d*)")
    ax.set_ylabel("Instance Frequency")
    ax.legend(frameon=True)
    fig.tight_layout()
    p1 = out_dir / "fig1_greedy_ratio_histogram.png"
    fig.savefig(p1)
    plt.close(fig)
    saved.append(p1.name)

    # 2. Scatter Plot 1: Greedy Cost vs Optimal Cost
    g_costs = [r["greedy_cost"] for r in instances if r["greedy_cost"] is not None]
    o_costs = [r["optimal_cost"] for r in instances if r["greedy_cost"] is not None]
    fig, ax = plt.subplots(figsize=(7.2, 4.6), dpi=180)
    ax.scatter(g_costs, o_costs, c="#2563eb", alpha=0.82, edgecolors="#0f172a", s=55, label="Instances")
    max_axis = max(max(g_costs), max(o_costs)) + 3
    ax.plot([0, max_axis], [0, max_axis], color="#059669", linestyle="--", linewidth=1.6, label="y = x (Optimal Boundary)")
    ax.set_title("Greedy Solution Cost vs. Optimal Solution Cost (d*)")
    ax.set_xlabel("Cost by Greedy Best-First Search (Moves)")
    ax.set_ylabel("Optimum Cost d* (IDA* / A*)")
    ax.set_xlim(0, max_axis)
    ax.set_ylim(0, max(o_costs) + 4)
    ax.legend(frameon=True)
    fig.tight_layout()
    p2 = out_dir / "fig2_scatter_greedy_vs_optimal.png"
    fig.savefig(p2)
    plt.close(fig)
    saved.append(p2.name)

    # 3. Scatter Plot 2: Optimal Actions to Goal vs Vertical & Horizontal Actions
    d_vals = [r["optimal_cost"] for r in instances]
    v_vals = [r["vertical_actions"] for r in instances]
    h_vals = [r["horizontal_actions"] for r in instances]
    fig, ax = plt.subplots(figsize=(7.2, 4.6), dpi=180)
    ax.scatter(d_vals, v_vals, c="#2563eb", marker="o", alpha=0.82, s=55, label="Vertical Actions (UP / DOWN)")
    ax.scatter(d_vals, h_vals, c="#d97706", marker="^", alpha=0.82, s=60, label="Horizontal Actions (LEFT / RIGHT)")
    d_max = max(d_vals) + 2
    ax.plot([0, d_max], [0, 0.5 * d_max], color="#475569", linestyle="--", linewidth=1.4, label="50% Symmetry Reference (y = 0.5x)")
    ax.set_title("Optimal Path Length vs. Vertical & Horizontal Action Counts")
    ax.set_xlabel("Total Optimal Actions to Goal State (d*)")
    ax.set_ylabel("Action Count by Axis")
    ax.legend(frameon=True)
    fig.tight_layout()
    p3 = out_dir / "fig3_scatter_actions_vertical_horizontal.png"
    fig.savefig(p3)
    plt.close(fig)
    saved.append(p3.name)

    # 4. Two-Panel Figure: Nodes Expanded vs Optimal Depth (log) & Effective Branching Factor b*
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.2, 4.8), dpi=180)
    plot_algos = [
        ("BFS", "#1d4ed8", "s"),
        ("IDDFS", "#60a5fa", "D"),
        ("A* (Misplaced)", "#f59e0b", "v"),
        ("A* (Manhattan)", "#10b981", "o"),
        ("A* (Linear Conflict)", "#047857", "^"),
        ("Weighted A* (w=1.5)", "#9333ea", "P"),
        ("IDA* (Linear Conflict)", "#0f766e", "*"),
    ]
    for name, color, marker in plot_algos:
        sub = [r for r in runs if r["algorithm"] == name and r["solved"]]
        if not sub:
            continue
        ax1.scatter(
            [r["optimal_cost"] for r in sub],
            [max(1, r["nodes_expanded"]) for r in sub],
            c=color, marker=marker, s=46, alpha=0.84, label=name,
        )
    ax1.set_yscale("log")
    ax1.set_title("Nodes Expanded vs. Optimal Depth d* (Solved Runs)")
    ax1.set_xlabel("Optimal Solution Depth (d*)")
    ax1.set_ylabel("Nodes Expanded (log scale)")
    ax1.legend(fontsize=8, frameon=True)

    b_rows = [
        s for s in data["algorithm_summary"]
        if s["mean_b_star"] is not None and s["algorithm"] in [p[0] for p in plot_algos]
    ]
    b_rows.sort(key=lambda r: r["mean_b_star"], reverse=True)
    labels = [r["algorithm"] for r in b_rows]
    b_means = [r["mean_b_star"] for r in b_rows]
    colors = [dict((p[0], p[1]) for p in plot_algos).get(lbl, "#2563eb") for lbl in labels]
    y_pos = range(len(labels))
    ax2.barh(list(y_pos), b_means, color=colors, alpha=0.88)
    ax2.set_yticks(list(y_pos))
    ax2.set_yticklabels(labels, fontsize=8.5)
    ax2.axvline(1.0, color="#0f172a", linestyle=":", linewidth=1.2)
    for idx, val in enumerate(b_means):
        ax2.text(val + 0.02, idx, f"{val:.3f}", va="center", fontsize=8.5, fontweight="bold")
    ax2.set_xlim(0, max(b_means) + 0.35)
    ax2.set_title("Mean Effective Branching Factor (b*)")
    ax2.set_xlabel("Effective Branching Factor b*")
    fig.tight_layout()
    p4 = out_dir / "fig4_scatter_nodes_and_bstar.png"
    fig.savefig(p4)
    plt.close(fig)
    saved.append(p4.name)

    # 5. GA Convergence & Selection/Crossover Ablation
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12.2, 4.6), dpi=180)
    ga_styles = {
        "4-Tournament + 2-Point": ("#059669", "-"),
        "4-Tournament + 1-Point": ("#2563eb", "--"),
        "Roulette + 2-Point": ("#9333ea", "-."),
        "Roulette + 1-Point": ("#d97706", ":"),
    }
    for cfg_name, curve in data["ga_mean_curves"].items():
        color, ls = ga_styles[cfg_name]
        gens = [c["generation"] for c in curve]
        ax1.plot(gens, [c["mean_best_fitness"] for c in curve], color=color, linestyle=ls, linewidth=2.0, label=cfg_name)
        ax2.plot(gens, [c["mean_min_conflicts"] for c in curve], color=color, linestyle=ls, linewidth=2.0, label=cfg_name)

    ax1.set_title("GA Mean Best Fitness Convergence (12 Instances)")
    ax1.set_xlabel("Generation")
    ax1.set_ylabel("Mean Best Fitness")
    ax1.legend(fontsize=8.2, frameon=True)

    ax2.set_title("GA Mean Minimum Conflict Count Convergence")
    ax2.set_xlabel("Generation")
    ax2.set_ylabel("Min conflict_count (0 = Goal)")
    ax2.legend(fontsize=8.2, frameon=True)
    fig.tight_layout()
    p5 = out_dir / "fig5_ga_convergence_and_ablation.png"
    fig.savefig(p5)
    plt.close(fig)
    saved.append(p5.name)

    return saved


def main() -> int:
    parser = argparse.ArgumentParser(description="Run 15-Puzzle empirical evaluation & generate figures")
    parser.add_argument(
        "--json-out",
        type=Path,
        default=Path("../reports/evaluation_results.json"),
    )
    parser.add_argument(
        "--figures-dir",
        type=Path,
        default=Path("../reports/figures"),
    )
    args = parser.parse_args()

    data = run_experiments()
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    figures = generate_figures(data, args.figures_dir)

    print(f"Evaluated {data['meta']['num_instances']} scramble instances across depths {data['meta']['depths']}.")
    print(f"Wrote metrics JSON to {args.json_out}")
    print(f"Generated {len(figures)} figures in {args.figures_dir}: {figures}")
    print("Greedy_opt_ratio stats:", data["greedy_stats"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
