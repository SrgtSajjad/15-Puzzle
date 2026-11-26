# Problem Formulation & Mathematical Specification: 4×4 15-Puzzle

## 1. Environment & PEAS Specification

- **Task Environment:** Fully observable, deterministic, sequential, static, discrete, single-agent.
- **State Space ($S$):** All reachable row-major permutations of $\{0, 1, \dots, 15\}$ on a $4 \times 4$ grid, where $0$ denotes the blank cell.
  - Total permutations: $16! = 20,922,789,888,000$.
  - Reachable component (half the parity space):
    $$|S_{\text{reachable}}| = \frac{16!}{2} = 10,461,394,944,000 \approx 1.046 \times 10^{13}$$
- **Canonical Goal State ($s_{\text{goal}}$):**
  ```text
   1   2   3   4
   5   6   7   8
   9  10  11  12
  13  14  15   0
  ```
- **Action Space ($A$):** $\text{Actions}(s) \subseteq \{\text{UP}, \text{DOWN}, \text{LEFT}, \text{RIGHT}\}$, defined as moving the blank (`0`) one cell in the corresponding direction (equivalently sliding the adjacent tile into the blank from the opposite direction).
- **Branching Factor:** Corner blank $b = 2$, edge blank $b = 3$, center blank $b = 4$ (average raw $b = 3.0$; after pruning immediate inverse moves, effective branching factor $b^* \approx 2.13$).
- **Transition Model & Cost:** `result(s, a)` swaps the blank with the adjacent target cell; unit step cost $c(s, a, s') = 1$, so path cost $g(n)$ equals the number of moves executed.

---

## 2. 4×4 Solvability Theorem

Let $\text{inv}(\pi)$ be the number of inversions among the non-zero tiles $(t_1, \dots, t_{15})$ in row-major order:
$$\text{inv}(\pi) = \bigl|\{(i, j) : 1 \le i < j \le 15,\; t_i > t_j\}\bigr|$$
Let $r_{\text{bot}} \in \{1, 2, 3, 4\}$ be the blank's row index counting **from the bottom** ($r_{\text{bot}} = 4 - r_{\text{top}}$).

- A horizontal blank move preserves both $\text{inv}(\pi)$ and $r_{\text{bot}}$.
- A vertical blank move changes $r_{\text{bot}}$ by $\pm 1$ and moves one tile past 3 other tiles in row-major order, changing $\text{inv}(\pi)$ by $\pm 1$ or $\pm 3$ (always odd).
- Hence, the parity $(\text{inv}(\pi) + r_{\text{bot}}) \bmod 2$ is **invariant** across all legal transitions.
- Since $s_{\text{goal}}$ has $\text{inv} = 0$ and $r_{\text{bot}} = 1$, a $4 \times 4$ board is solvable **if and only if**:
  $$(\text{inv}(\pi) + r_{\text{bot}}) \equiv 1 \pmod{2}$$

---

## 3. Heuristic Functions

1. **Misplaced Tiles ($h_1$, Hamming Distance):**
   $$h_1(s) = \sum_{i=0}^{15} \mathbb{I}[s_i \ne 0 \land s_i \ne g_i]$$
   Admissible and consistent ($h_1(s) \le h^*(s)$ because each misplaced tile needs at least 1 move).

2. **Manhattan Distance ($h_2$):**
   $$h_2(s) = \sum_{t=1}^{15} \bigl(|r(t) - r^*(t)| + |c(t) - c^*(t)|\bigr)$$
   Admissible and consistent (each move shifts one tile's $L_1$ distance by at most $1$).

3. **Manhattan + Linear Conflict ($h_3$):**
   Two tiles $t_a, t_b$ are in *linear conflict* if both currently sit in their goal row (or goal column) in reversed order relative to their goal positions. Resolving each conflict forces one tile out of its target line and back in, adding at least $2$ moves beyond $h_2$:
   $$h_3(s) = h_2(s) + 2 \times \text{linear\_conflicts}(s)$$
   $h_3$ remains **admissible and consistent** while dominating $h_2$ ($h_3(s) \ge h_2(s) \ge h_1(s)$).

---

## 4. Fixed-Length Action Sequence & Darwinian GA Fitness

Each chromosome is a fixed-length action sequence $A = (a_1, a_2, \dots, a_L) \in \{\text{UP}, \text{DOWN}, \text{LEFT}, \text{RIGHT}\}^L$. Evaluating $A$ from $s_0$ halts immediately if `goal_test(s_t)` becomes `True`, recording `path_cost = t`.

To ensure `conflict_count == 0` **if and only if** the goal state is reached while rewarding fewer linear conflicts:
$$\text{conflict\_count}(s) = h_1(s) + 2 \times \text{linear\_conflicts}(s)$$

The scalar fitness function is defined as:
$$\text{fitness}(A) = \begin{cases}
C_{\text{large}} - \text{path\_cost}(A), & \text{if } \text{goal\_test}(s_{\text{final}}) = \text{True} \\
C_{\text{base}} - \bigl(w_d \cdot d + w_c \cdot \text{conflict\_count} + w_g \cdot \text{path\_cost} + w_{\text{inv}} \cdot \text{invalid\_moves}\bigr), & \text{otherwise}
\end{cases}$$

With default hyperparameters ($C_{\text{large}} = 10000$, $C_{\text{base}} = 5000$, $w_d = 15$, $w_c = 10$, $w_g = 1$, $w_{\text{inv}} = 5$), every goal-reaching sequence strictly outranks every unsolved sequence, and shorter goal-reaching sequences achieve higher fitness.
