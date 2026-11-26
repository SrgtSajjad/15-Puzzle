# 4×4 15-Puzzle — University AI Course Search & Evolutionary Computation Project

An academic-grade implementation, experimental benchmark suite, and interactive **2D / 3D** web visualizer for the **4×4 15-Puzzle** across all four classic AI Search paradigms: **Uninformed (Blind) Search**, **Informed (Heuristic) Search**, **Local Search**, and a **Darwinian Genetic Algorithm**.

---

## Project Structure

```text
15-Puzzle/
├── README.md
├── docs/                           # GitHub Pages static web app (zero backend)
│   ├── index.html
│   ├── styles/main.css
│   └── js/
│       ├── core/                   # SeededRNG, PuzzleEnvironment, Heuristics, SolverBase
│       ├── solvers/                # Uninformed, Informed, Local, Genetic Algorithm
│       ├── ui/                     # Board2D, Board3D, SVG Charts, Playback, App controller
│       └── tests/run_tests.mjs     # Node.js unit test suite
├── python/                         # Zero-dependency Python 3.13 OOP implementation
│   ├── puzzle15/                   # Actions, State, Node, Environment, Heuristics, Solvers
│   ├── cli.py                      # Interactive CLI demo
│   ├── benchmark.py                # Multi-seed experiment runner -> JSON/CSV
│   └── tests/                      # Python unittest suite
└── reports/                        # Formal AI course documentation & benchmark outputs
    ├── PROBLEM_AND_FORMULATION.md
    ├── ALGORITHMS_AND_ANALYSIS.md
    ├── benchmark_summary.json
    └── benchmark_summary.csv
```

---

## Quick Start

### 1. Python Library, CLI & Unit Tests

Run from `15-Puzzle/python`:

```powershell
# Run all 19 unit tests
python -m unittest discover -s tests -v

# Solve a preset using A* with Manhattan + Linear Conflict
python cli.py --preset medium --algorithm astar --heuristic linear_conflict --trace

# Solve using IDA* on Hard preset
python cli.py --preset hard --algorithm idastar --heuristic linear_conflict

# Run the Darwinian Genetic Algorithm with custom hyperparameters
python cli.py --scramble-depth 8 --algorithm ga --pop-size 50 --seq-len 24 --generations 120 --selection tournament --tournament-k 4 --crossover two_point --seed 42

# Run multi-seed benchmarks across Easy, Medium, and Hard suites
python benchmark.py --output ../reports/benchmark_summary.json --csv ../reports/benchmark_summary.csv
```

### 2. JavaScript Unit Tests (Node.js)

Run from `15-Puzzle`:

```powershell
node --test docs/js/tests/run_tests.mjs
```

### 3. Static Web App (Local & GitHub Pages)

The `docs/` directory is completely static (native ES modules, zero build step, zero external CDNs).

- **Local preview:**
  ```powershell
  python -m http.server 8765 -d docs
  ```
  Then open `http://localhost:8765`.
- **GitHub Pages deployment:**
  In your GitHub repository settings, go to **Settings → Pages → Build and deployment**, select **Deploy from a branch**, choose your branch and `/docs` folder, and save.

---

## Key Features

- **Consistent OOP Architecture (Python & JS):** `Action`, `PuzzleState`, `Node`, `PuzzleEnvironment`, `Evaluator`, `Solver`, and `GeneticAlgorithmSolver`.
- **4×4 Solvability Validation:** Verifies permutation validity and parity invariant `(inversions + blank_row_from_bottom) % 2 == 1` in real time.
- **All 4 Search Families:**
  - *Uninformed:* BFS, UCS, DFS, DLS, IDDFS
  - *Informed:* Greedy Best-First, A*, Weighted A*, IDA* (`misplaced`, `manhattan`, `linear_conflict`)
  - *Local Search:* Hill Climbing (Steepest-Ascent, Stochastic, Random-Restart), Simulated Annealing, Local Beam Search
  - *Evolutionary:* Darwinian Genetic Algorithm on fixed-length action sequences with Roulette Wheel & `k`-Tournament (`k=4`) selection, 1-point & 2-point crossover, point/swap/segment mutation, elitism, and per-generation convergence telemetry.
- **Synchronized 2D & 3D Rotatable Visualization:** Interactive 2D grid with per-tile Manhattan & Linear Conflict overlays paired with a pointer-orbitable 3D extruded tile board, step-by-step playback, custom 4×4 board editor, SVG charts, and JSON/CSV export.
