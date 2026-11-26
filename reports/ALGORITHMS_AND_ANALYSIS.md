# Search Algorithms & Experimental Analysis

## 1. Implemented Algorithm Families

| Category | Algorithm | Complete? | Optimal? | Memory Complexity | Notes |
|---|---|---|---|---|---|
| **Uninformed** | BFS | Yes* | Yes (unit cost) | $O(b^d)$ | Exhaustive level-by-level frontier; impractical beyond $d \approx 14$. |
| **Uninformed** | UCS | Yes* | Yes | $O(b^d)$ | Min-heap ordered by $g(n)$; equivalent to BFS under unit costs with heap overhead. |
| **Uninformed** | DFS / DLS | No / Yes (if $d \le \ell$) | No | $O(b\ell)$ | Uses best-depth cycle pruning; bounded depth $\ell$ avoids infinite exploration. |
| **Uninformed** | IDDFS | Yes* | Yes | $O(bd)$ | Linear memory, optimal, re-expands upper tree levels. |
| **Informed** | Greedy Best-First | No (bounded) | No | $O(b^d)$ | Fast $f(n) = h(n)$, often produces longer suboptimal paths. |
| **Informed** | A* | Yes* | Yes (admissible $h$) | $O(b^d)$ | Optimal $f(n) = g(n) + h(n)$; stores closed & frontier tables. |
| **Informed** | Weighted A* | Yes* | $\le w \cdot C^*$ | $O(b^d)$ pruned | Trades optimality for sharp reduction in expansions via $f = g + w \cdot h$. |
| **Informed** | IDA* | Yes* | Yes (admissible $h$) | $O(bd)$ | Thresholds on $f$-cost + move ordering; scalable to deep 4×4 boards. |
| **Local** | Hill Climbing (3 variants) | No | No | $O(1)$ | Steepest-Ascent, Stochastic, Random-Restart; stalls on plateaus/local optima. |
| **Local** | Simulated Annealing | No | No | $O(1)$ | Escapes shallow local minima via geometric cooling $T_{k+1} = \alpha T_k$. |
| **Local** | Local Beam Search | No | No | $O(k)$ | Retains top-$k$ distinct frontier states per ply; mitigates single-path greediness. |
| **Evolutionary** | Darwinian GA | No | No | $O(\text{pop} \cdot L)$ | Fixed-length action sequences, Roulette / 4-Tournament, 1/2-point crossover, mutation. |

*\*Subject to configured node/time bounds on hard $4 \times 4$ instances.*

---

## 2. Empirical Benchmark Results (Python Suite, 3 Seeds × 3 Depths = 108 Runs)

Executed via `python benchmark.py --output ../reports/benchmark_summary.json --csv ../reports/benchmark_summary.csv`:

### Easy Suite (Scramble Depth 8)
- **Uninformed (`BFS`, `UCS`, `IDDFS`):** 100% solved at optimal cost `8.0`, expanding `519.3` (BFS), `1089.0` (UCS), and `978.7` (IDDFS) nodes on average.
- **Informed (`A*`, `IDA*`, `Weighted A*`, `GBFS`):** 100% solved at cost `8.0` expanding just `8.0` nodes (`0.08–0.28 ms`).
- **Local & Evolutionary:** `Local Beam (k=16)` solved 100% (cost `8.0`, `75.3` nodes); `Hill Climbing (Steepest)` solved `66.7%`; `Genetic Algorithm` (`pop=50, gen=80`) solved `100%` with average path cost `8.67`.

### Medium Suite (Scramble Depth 16)
- **Uninformed:** `BFS` (`33.3%`, avg `35,289.7` nodes) and `IDDFS` (`33.3%`, avg `58,070.0` nodes) begin hitting node limits (`40k–60k`).
- **Informed:**
  - `A* [manhattan]`: `100%` solved, avg cost `15.33`, avg `44.7` nodes (`0.400 ms`).
  - `A* [linear_conflict]`: `100%` solved, avg cost `15.33`, avg `36.0` nodes (`0.740 ms`).
  - `Greedy Best-First [linear_conflict]`: `100%` solved, but avg cost degrades to `30.0` (`146.7` nodes).

### Hard Suite (Scramble Depth 28)
- **Uninformed (`BFS`, `UCS`, `IDDFS`):** `0%` solved within `40,000–60,000` node budget due to exponential frontier growth.
- **Informed:**
  - `A* [manhattan]`: `100%` solved, avg cost `23.33`, avg `764.7` nodes (`6.744 ms`).
  - `A* [linear_conflict]`: `100%` solved, avg cost `23.33`, avg `269.7` nodes (**64.7% fewer expansions** than Manhattan alone, `5.158 ms`).
  - `Weighted A* [w=1.5, linear_conflict]`: `100%` solved, avg cost `24.0`, avg `197.7` nodes (`3.868 ms`).
  - `IDA* [linear_conflict]`: `100%` solved, avg cost `23.33`, avg `519.3` nodes (`18.06 ms`), using $O(d)$ memory.
- **Local Search & GA:**
  - `Local Beam Search [k=16]`: `100%` solved, avg cost `34.67`, `499.7` nodes.
  - `Hill Climbing` and `Simulated Annealing` stall in heuristic local optima (`0%` at depth 28).
  - `Genetic Algorithm`: `0%` at depth 28 with `pop=50, gen=80`, illustrating **epistasis** in blind action-sequence crossover—modifying an early move rotates the entire downstream trajectory, whereas informed tree search (`A*`/`IDA*`) exploits additive state-space admissibility.
