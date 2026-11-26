import { getTileDiagnostics } from "../core/heuristics.js";
import { Action, GRID_SIZE } from "../core/puzzle.js";

/**
 * Interactive 2D 4x4 puzzle board with clean minimal default tiles,
 * optional heuristic/conflict overlays, tile clicking, and touch/mouse swipe support.
 */
export class Board2D {
  constructor(container, { onTileMove = null } = {}) {
    this.container = container;
    this.onTileMove = onTileMove;
    this.showOverlays = false;
    this.tileElements = new Map();
    this._swipeStart = null;
    this._swipeHandled = false;
    this._initDOM();
  }

  _initDOM() {
    this.container.innerHTML = "";
    this.gridEl = document.createElement("div");
    this.gridEl.className = "board-2d-grid hide-overlays";
    this.gridEl.setAttribute("role", "grid");
    this.gridEl.setAttribute("aria-label", "15-Puzzle 2D Board");

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const slot = document.createElement("div");
      slot.className = "board-2d-slot";
      this.gridEl.appendChild(slot);
    }

    for (let tile = 1; tile <= 15; tile++) {
      const tileEl = document.createElement("button");
      tileEl.type = "button";
      tileEl.className = "board-2d-tile";
      tileEl.dataset.tile = String(tile);
      tileEl.innerHTML = `
        <span class="tile-num">${tile}</span>
        <span class="tile-meta" aria-hidden="true"></span>
        <span class="tile-arrow" aria-hidden="true"></span>
      `;
      tileEl.addEventListener("click", () => {
        if (this._swipeHandled) {
          this._swipeHandled = false;
          return;
        }
        if (this.onTileMove && tileEl.dataset.moveAction) {
          this.onTileMove(tileEl.dataset.moveAction);
        }
      });
      this.tileElements.set(tile, tileEl);
      this.gridEl.appendChild(tileEl);
    }

    // Swipe gesture on 2D grid: sliding a finger/pointer moves a tile in the swipe direction
    // (which moves the blank in the opposite direction).
    this.gridEl.addEventListener("pointerdown", (e) => {
      this._swipeStart = { x: e.clientX, y: e.clientY };
      this._swipeHandled = false;
    });
    this.gridEl.addEventListener("pointerup", (e) => {
      if (!this._swipeStart || !this.onTileMove) return;
      const dx = e.clientX - this._swipeStart.x;
      const dy = e.clientY - this._swipeStart.y;
      this._swipeStart = null;
      if (Math.hypot(dx, dy) < 26) return;
      this._swipeHandled = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.onTileMove(dx > 0 ? Action.LEFT : Action.RIGHT);
      } else {
        this.onTileMove(dy > 0 ? Action.UP : Action.DOWN);
      }
    });

    this.container.appendChild(this.gridEl);
  }

  setOverlaysVisible(visible) {
    this.showOverlays = Boolean(visible);
    this.gridEl.classList.toggle("hide-overlays", !this.showOverlays);
  }

  render(state) {
    const diagnostics = getTileDiagnostics(state);
    const br = state.blankRow;
    const bc = state.blankCol;

    for (let idx = 0; idx < state.tiles.length; idx++) {
      const tile = state.tiles[idx];
      if (tile === 0) continue;

      const r = Math.floor(idx / GRID_SIZE);
      const c = idx % GRID_SIZE;
      const el = this.tileElements.get(tile);
      const diag = diagnostics[idx];

      el.style.setProperty("--row", String(r));
      el.style.setProperty("--col", String(c));

      el.classList.toggle("is-home", diag.isCorrect);
      el.classList.toggle("is-conflict", diag.inConflict);

      let moveAction = "";
      let arrowSymbol = "";
      if (r === br - 1 && c === bc) {
        moveAction = Action.UP;
        arrowSymbol = "↓";
      } else if (r === br + 1 && c === bc) {
        moveAction = Action.DOWN;
        arrowSymbol = "↑";
      } else if (r === br && c === bc - 1) {
        moveAction = Action.LEFT;
        arrowSymbol = "→";
      } else if (r === br && c === bc + 1) {
        moveAction = Action.RIGHT;
        arrowSymbol = "←";
      }

      el.dataset.moveAction = moveAction;
      el.classList.toggle("is-movable", moveAction !== "");
      el.disabled = moveAction === "";
      el.setAttribute(
        "aria-label",
        `Tile ${tile}, row ${r + 1} col ${c + 1}, Manhattan ${diag.manhattan}${moveAction ? `, click to slide` : ""}`
      );

      const metaEl = el.querySelector(".tile-meta");
      if (diag.inConflict) {
        metaEl.textContent = `d=${diag.manhattan} · LC`;
      } else if (diag.manhattan === 0) {
        metaEl.textContent = "✓";
      } else {
        metaEl.textContent = `d=${diag.manhattan}`;
      }

      const arrowEl = el.querySelector(".tile-arrow");
      arrowEl.textContent = arrowSymbol;
    }
  }
}
