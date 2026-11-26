# Problem Formulation & Simulation Environment: 4×4 15-Puzzle

## 1. PEAS & Task Environment Classification

Following Russell & Norvig (*Artificial Intelligence: A Modern Approach*, Chapter 3), the 4×4 15-Puzzle is modeled as a classical single-agent deterministic search environment:

- **Performance Measure:** Minimize total path cost $g(n)$ (number of tile slides to reach the goal state) alongside computational efficiency (nodes expanded $N$, effective branching factor $b^*$, memory footprint, and wall-clock runtime).
- **Environment:** A $4 \times 4$ grid containing 15 uniquely numbered tiles $\{1, 2, \dots, 15\}$ and 1 blank space (`0`).
- **Actuators:** Four discrete blank-movement actions (`UP`, `DOWN`, `LEFT`, `RIGHT`), each sliding the adjacent tile into the blank cell from the opposite direction.
- **Sensors:** Full observation of the 16-cell board configuration at every time step.

| Environment Property | Classification | Justification |
|---|---|---|
| Observability | **Fully Observable** | The entire $4 \times 4$ board vector is known without hidden state. |
| Determinism | **Deterministic** | `result(state, action)` maps any `(state, action)` pair to a unique successor state. |
| Episodic vs. Sequential | **Sequential** | Every move changes future legal actions and remaining distance to the goal. |
| Static vs. Dynamic | **Static** | The board does not mutate while the search agent plans. |
| Discrete vs. Continuous | **Discrete** | Finite state space ($16!/2$ reachable boards) and 4 discrete actions. |
| Agents | **Single-Agent** | One solver operates on the puzzle board. |

---

## 2. Formal Search Problem Tuple $(S, s_0, A, T, G, c)$

1. **State Representation (`PuzzleState`):**
   - An immutable length-16 row-major tuple `(Python)` / frozen array `(JavaScript)` representing a permutation of $\{0, 1, \dots, 15\}$, paired with a cached `blank_index` ($0 \le \text{blank\_index} < 16$).
   - Row and column coordinates are derived in $O(1)$: `row = idx // 4`, `col = idx % 4`, and 1-based bottom-up blank row `blank_row_from_bottom = 4 - blank_row`.

2. **Canonical Goal State ($s_{\text{goal}}$) & Goal Test (`goal_test`):**
   ```text
    1   2   3   4
    5   6   7   8
    9  10  11  12
   13  14  15   0
   ```
   `goal_test(state)` returns `True` if and only if `state.tiles == (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0)`.

3. **Action Space (`Action`):**
   - `UP`: $\Delta = (-1, 0)$ (blank moves up; tile above slides down)
   - `DOWN`: $\Delta = (+1, 0)$ (blank moves down; tile below slides up)
   - `LEFT`: $\Delta = (0, -1)$ (blank moves left; tile to the left slides right)
   - `RIGHT`: $\Delta = (0, +1)$ (blank moves right; tile to the right slides left)
   - `valid_actions(state, exclude_inverse_of)` filters out-of-bounds transitions and optionally prunes the immediate inverse move (`UP ↔ DOWN`, `LEFT ↔ RIGHT`) to prevent trivial 2-step cycles.

4. **Transition Model & Unit Cost:**
   - `result(state, action)` swaps the blank cell with the target cell at `(blank_row + dr, blank_col + dc)` and returns a new immutable `PuzzleState`.
   - Step cost is uniform: $c(s, a, s') = 1$. Thus `path_cost` equals the action count along the trajectory.

5. **Fixed-Length Action Sequence Evaluator (`evaluate_sequence`):**
   - For evolutionary search (Darwinian Genetic Algorithm), candidate solutions are represented as fixed-length sequences $A = (a_1, a_2, \dots, a_L) \in \{\text{UP}, \text{DOWN}, \text{LEFT}, \text{RIGHT}\}^L$.
   - Starting from $s_0$, `evaluate_sequence` executes valid actions sequentially and **halts immediately** if `goal_test(s_t)` becomes `True`, recording the exact `path_cost = valid_steps` to goal rather than penalizing trailing genes. Out-of-bounds genes leave the board unchanged and increment `invalid_moves`.

---

## 3. State Space Cardinality & Branching Factor

- **Total Permutations:** $16! = 20,922,789,888,000$.
- **Reachable State Space:** Only half of all permutations can reach $s_{\text{goal}}$ via legal slides:
  $$|S_{\text{reachable}}| = \frac{16!}{2} = 10,461,394,944,000 \approx 1.046 \times 10^{13}$$
- **Raw Branching Factor:**
  - 4 corner blank positions: $b = 2$
  - 8 edge non-corner positions: $b = 3$
  - 4 interior positions: $b = 4$
  - Average raw branching factor: $\bar{b} = \frac{4(2) + 8(3) + 4(4)}{16} = 3.0$.
- **Pruned Branching Factor:** Excluding the immediate inverse move reduces the average branching factor to $\approx 2.0$–$2.13$ (matching our empirical IDDFS effective branching factor $b^* = 2.139$).

---

## 4. Mathematical Proof of the 4×4 Solvability Parity Invariant

**Theorem:** *A 4×4 15-Puzzle configuration $\pi$ is reachable from the canonical goal state $s_{\text{goal}}$ if and only if:*
$$\bigl(\text{inv}(\pi) + r_{\text{bot}}(\pi)\bigr) \equiv 1 \pmod{2}$$
*where $\text{inv}(\pi) = |\{(i, j) : 1 \le i < j \le 15,\; t_i > t_j\}|$ is the inversion count among non-blank tiles in row-major order, and $r_{\text{bot}}(\pi) \in \{1, 2, 3, 4\}$ is the blank's 1-based row index from the bottom.*

**Proof (Invariance under Legal Moves):**
1. **Horizontal Move (`LEFT` / `RIGHT`):** Moving the blank left or right swaps `0` with an adjacent tile in the same row. Because `0` is ignored in $\text{inv}(\pi)$, the relative row-major ordering of all 15 numbered tiles is unchanged ($\Delta \text{inv} = 0$), and the blank remains in the same row ($\Delta r_{\text{bot}} = 0$). Thus $(\text{inv} + r_{\text{bot}}) \bmod 2$ is preserved.
2. **Vertical Move (`UP` / `DOWN`):** Moving the blank one row vertically changes $r_{\text{bot}}$ by $\pm 1$. In row-major order, the displaced tile jumps past exactly $W - 1 = 3$ intermediate tiles (since grid width $W = 4$). Comparing the displaced tile against each of those 3 tiles flips 3 pairwise order relations: either $0, 1, 2,$ or $3$ inversions are added while the remaining $3 - k$ inversions are removed, giving a net change $\Delta \text{inv} = k - (3 - k) = 2k - 3$, which is **always odd**. Therefore:
   $$\Delta(\text{inv} + r_{\text{bot}}) = \underbrace{(2k - 3)}_{\text{odd}} + \underbrace{(\pm 1)}_{\text{odd}} \equiv 0 \pmod{2}$$
3. **Goal State Parity:** In $s_{\text{goal}}$, tiles $(1, \dots, 15)$ are sorted ($\text{inv} = 0$) and the blank sits in the bottom row ($r_{\text{bot}} = 1$), so $(0 + 1) \bmod 2 = 1$.
4. **Conclusion:** Every reachable state has odd $(\text{inv} + r_{\text{bot}})$. Conversely, classic permutation group parity (Story, 1879) proves the alternating group $A_{15}$ acts transitively when blank position is fixed, establishing sufficiency. $\blacksquare$

---

## 5. Cross-Language OOP Architecture (Python & JavaScript Parity)

Both the Python library (`python/puzzle15/`) and the zero-backend browser engine (`docs/js/`) share an identical object-oriented design:

| Abstraction | Python Module | JavaScript Module | Responsibility |
|---|---|---|---|
| `Action` | `puzzle15/actions.py` | `docs/js/core/puzzle.js` | Directions, `(dr, dc)` deltas, inverse moves, short codes |
| `PuzzleState`, `Node` | `puzzle15/state.py` | `docs/js/core/puzzle.js` | Immutable board state, blank coordinates, tree parent links |
| `PuzzleEnvironment` | `puzzle15/environment.py` | `docs/js/core/puzzle.js` | `valid_actions`, `result`, `is_solvable`, scrambles, `evaluate_sequence` |
| `Evaluator`, `FitnessConfig` | `puzzle15/heuristics.py` | `docs/js/core/heuristics.js` | $h_1, h_2, h_3$, `conflict_count`, Darwinian GA fitness |
| `Solver`, `SearchResult` | `puzzle15/solver_base.py` | `docs/js/core/solver_base.js` | Abstract solver interface and unified telemetry payload |
| Uninformed Solvers | `puzzle15/solvers/uninformed.py` | `docs/js/solvers/uninformed.js` | `BFSSolver`, `UCSSolver`, `DLSSolver`, `DFSSolver`, `IDDFSSolver` |
| Informed Solvers | `puzzle15/solvers/informed.py` | `docs/js/solvers/informed.js` | `GreedyBestFirstSolver`, `AStarSolver`, `WeightedAStarSolver`, `IDAStarSolver` |
| Local Search | `puzzle15/solvers/local.py` | `docs/js/solvers/local.js` | `HillClimbingSolver` (3 variants), `SimulatedAnnealingSolver`, `LocalBeamSolver` |
| Evolutionary | `puzzle15/solvers/genetic.py` | `docs/js/solvers/genetic.js` | `GeneticAlgorithmSolver` (Roulette & $k$-Tournament, 1/2-pt crossover, mutation) |
