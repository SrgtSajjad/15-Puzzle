# 4×4 15-Puzzle — University AI Course Search & Evolutionary Computation Project

An academic-grade implementation, mathematical formulation, reproducible evaluation suite, and interactive **2D / 3D** web visualizer for the **4×4 15-Puzzle** across all four classic AI Search paradigms: **Uninformed (Blind) Search**, **Informed (Heuristic) Search**, **Local Search**, and a **Darwinian Genetic Algorithm**.

**Live Web Demo (GitHub Pages):** [https://srgtsajjad.github.io/15-Puzzle/](https://srgtsajjad.github.io/15-Puzzle/)

---

## Course Deliverables Index

| Course Deliverable | Description | Repository Path |
|---|---|---|
| **1. Problem & Environment (OOP)** | `PuzzleEnvironment`, `PuzzleState`, `Action`, solvability parity checker, scrambles, fixed-length sequence evaluator | [`python/puzzle15/`](python/puzzle15/) & [`docs/js/core/`](docs/js/core/) |
| **2. Search Algorithms (4 Families)** | Uninformed (`BFS`, `UCS`, `DFS`, `DLS`, `IDDFS`), Informed (`GBFS`, `A*`, `Weighted A*`, `IDA*`), Local (`HC` 3×, `SA`, `Beam`), Darwinian `GA` | [`python/puzzle15/solvers/`](python/puzzle15/solvers/) & [`docs/js/solvers/`](docs/js/solvers/) |
| **3. Problem Formulation Docs** | Formal PEAS, state space ($16!/2$), $b$ vs. $b^*$, mathematical proof of 4×4 solvability parity | [`reports/PROBLEM_AND_FORMULATION.md`](reports/PROBLEM_AND_FORMULATION.md) |
| **4. Heuristics & GA Fitness Proofs** | Problem relaxations, Admissibility / Consistency / Dominance proofs ($h_3 \ge h_2 \ge h_1$), GA fitness & operators | [`reports/HEURISTICS_AND_FITNESS_DESIGN.md`](reports/HEURISTICS_AND_FITNESS_DESIGN.md) |
| **5. Evaluation & Plot Runner** | 33-instance multi-depth experiment, $b^*$ bisection solver, Greedy-vs-Optimal & GA ablations, Matplotlib figure generator | [`python/evaluate_report.py`](python/evaluate_report.py) & [`python/benchmark.py`](python/benchmark.py) |
| **6. Performance Report & Figures** | Full empirical tables ($b^*$, `Greedy_opt_ratio` histogram, scatter plots, GA convergence curves) | [`reports/EVALUATION_AND_REPORT.md`](reports/EVALUATION_AND_REPORT.md) & [`reports/figures/`](reports/figures/) |
| **7. Interactive 2D/3D Web Studio** | Zero-backend static app with 2D & 3D orbit boards, manual play HUD, async *Solve At All Cost*, live benchmarks | [`docs/index.html`](docs/index.html) |
| **8. Automated Test Suites** | Python `unittest` suite (21 tests) & Node.js parity + async tests (6 suites) | [`python/tests/`](python/tests/) & [`docs/js/tests/run_tests.mjs`](docs/js/tests/run_tests.mjs) |
| **9. AI Chat Transcripts** | Clean chronological log of all user prompts and assistant responses for course submission | [`reports/AI_CHAT_TRANSCRIPTS.md`](reports/AI_CHAT_TRANSCRIPTS.md) |

---

## Project Structure

```text
15-Puzzle/
├── .gitignore
├── README.md
├── docs/                           # GitHub Pages static web app (zero backend, zero CDN)
│   ├── index.html
│   ├── styles/main.css
│   └── js/
│       ├── core/                   # SeededRNG, PuzzleEnvironment, Heuristics, SolverBase
│       ├── solvers/                # Uninformed, Informed, Local, Genetic Algorithm, AsyncRunner
│       ├── ui/                     # Board2D, Board3D, SVG Charts, Playback, App controller
│       └── tests/run_tests.mjs     # Node.js unit test suite
├── python/                         # Zero-dependency Python 3.13 core OOP implementation
│   ├── puzzle15/                   # Actions, State, Node, Environment, Heuristics, Solvers
│   ├── cli.py                      # Interactive CLI demo
│   ├── benchmark.py                # Multi-seed JSON/CSV benchmark runner
│   ├── evaluate_report.py          # Full experiment suite + Effective b* + Matplotlib figures
│   └── tests/                      # Python unittest suite
└── reports/                        # Academic English Markdown reports, datasets & figures
    ├── PROBLEM_AND_FORMULATION.md
    ├── HEURISTICS_AND_FITNESS_DESIGN.md
    ├── EVALUATION_AND_REPORT.md
    ├── AI_CHAT_TRANSCRIPTS.md
    ├── evaluation_results.json
    └── figures/                    # Generated PNG plots (fig1 .. fig5)
```

---

## Quick Start & Verification Commands

### 1. Python CLI, Evaluation & Unit Tests

Run from `15-Puzzle/python`:

```powershell
# Run all Python unit tests
python -m unittest discover -s tests -v

# Solve a preset via CLI (A* with Manhattan + Linear Conflict)
python cli.py --preset medium --algorithm astar --heuristic linear_conflict --trace

# Run the Darwinian Genetic Algorithm via CLI
python cli.py --scramble-depth 8 --algorithm ga --pop-size 50 --seq-len 24 --generations 120 --selection tournament --tournament-k 4 --crossover two_point --seed 42

# Run the 33-instance evaluation & regenerate all figures in reports/figures/
python evaluate_report.py --json-out ../reports/evaluation_results.json --figures-dir ../reports/figures
```

### 2. JavaScript Unit Tests (Node.js)

Run from `15-Puzzle`:

```powershell
node --test docs/js/tests/run_tests.mjs
```

### 3. Local Web App Preview

```powershell
python -m http.server 8765 -d docs
```
Open `http://localhost:8765` in your browser, or visit the live deployment at [https://srgtsajjad.github.io/15-Puzzle/](https://srgtsajjad.github.io/15-Puzzle/).
