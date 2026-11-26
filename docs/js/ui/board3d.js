import { getTileDiagnostics } from "../core/heuristics.js";
import { Action, GRID_SIZE } from "../core/puzzle.js";

/**
 * Interactive 3D rotatable 4x4 puzzle board built with extruded 6-face CSS 3D prisms
 * and smooth pointer-drag orbit + zoom controls (zero external CDN dependencies).
 */
export class Board3D {
  constructor(container, { onTileMove = null } = {}) {
    this.container = container;
    this.onTileMove = onTileMove;
    this.rotX = 48;
    this.rotZ = -28;
    this.zoom = 1.0;
    this.isDragging = false;
    this.dragMoved = false;
    this.lastX = 0;
    this.lastY = 0;
    this.tileElements = new Map();
    this._initDOM();
    this._attachOrbitHandlers();
  }

  _initDOM() {
    this.container.innerHTML = "";
    this.stageEl = document.createElement("div");
    this.stageEl.className = "board-3d-stage";

    this.pivotEl = document.createElement("div");
    this.pivotEl.className = "board-3d-pivot";

    // Recessed base tray
    this.trayEl = document.createElement("div");
    this.trayEl.className = "board-3d-tray";
    const trayBottom = document.createElement("div");
    trayBottom.className = "tray-face tray-bottom";
    const trayRimN = document.createElement("div");
    trayRimN.className = "tray-face tray-rim-n";
    const trayRimS = document.createElement("div");
    trayRimS.className = "tray-face tray-rim-s";
    const trayRimE = document.createElement("div");
    trayRimE.className = "tray-face tray-rim-e";
    const trayRimW = document.createElement("div");
    trayRimW.className = "tray-face tray-rim-w";
    this.trayEl.append(trayBottom, trayRimN, trayRimS, trayRimE, trayRimW);

    // 15 extruded 3D tile cubes
    for (let tile = 1; tile <= 15; tile++) {
      const cube = document.createElement("div");
      cube.className = "tile-3d";
      cube.dataset.tile = String(tile);
      cube.innerHTML = `
        <div class="cube-face face-top">
          <span class="cube-num">${tile}</span>
          <span class="cube-badge"></span>
        </div>
        <div class="cube-face face-front"></div>
        <div class="cube-face face-back"></div>
        <div class="cube-face face-left"></div>
        <div class="cube-face face-right"></div>
      `;
      cube.addEventListener("click", (e) => {
        if (this.dragMoved) {
          e.stopPropagation();
          return;
        }
        if (this.onTileMove && cube.dataset.moveAction) {
          this.onTileMove(cube.dataset.moveAction);
        }
      });
      this.tileElements.set(tile, cube);
      this.trayEl.appendChild(cube);
    }

    this.pivotEl.appendChild(this.trayEl);
    this.stageEl.appendChild(this.pivotEl);
    this.container.appendChild(this.stageEl);
    this._applyCamera();
  }

  _attachOrbitHandlers() {
    this.stageEl.addEventListener("pointerdown", (e) => {
      this.isDragging = true;
      this.dragMoved = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.stageEl.setPointerCapture(e.pointerId);
    });

    this.stageEl.addEventListener("pointermove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.dragMoved = true;
      }
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.rotZ += dx * 0.45;
      this.rotX = Math.max(10, Math.min(80, this.rotX - dy * 0.45));
      this._applyCamera();
    });

    const endDrag = () => {
      this.isDragging = false;
      setTimeout(() => {
        this.dragMoved = false;
      }, 30);
    };
    this.stageEl.addEventListener("pointerup", endDrag);
    this.stageEl.addEventListener("pointercancel", endDrag);

    this.stageEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.65, Math.min(1.45, this.zoom - e.deltaY * 0.0008));
        this._applyCamera();
      },
      { passive: false }
    );
  }

  setPreset(preset) {
    if (preset === "isometric") {
      this.rotX = 48;
      this.rotZ = -28;
      this.zoom = 1.0;
    } else if (preset === "top") {
      this.rotX = 12;
      this.rotZ = 0;
      this.zoom = 1.04;
    } else if (preset === "low") {
      this.rotX = 68;
      this.rotZ = 24;
      this.zoom = 1.02;
    }
    this._applyCamera();
  }

  adjustZoom(delta) {
    this.zoom = Math.max(0.65, Math.min(1.45, this.zoom + delta));
    this._applyCamera();
  }

  _applyCamera() {
    this.pivotEl.style.transform = `scale3d(${this.zoom}, ${this.zoom}, ${this.zoom}) rotateX(${this.rotX}deg) rotateZ(${this.rotZ}deg)`;
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
      const cube = this.tileElements.get(tile);
      const diag = diagnostics[idx];

      cube.style.setProperty("--row", String(r));
      cube.style.setProperty("--col", String(c));
      cube.classList.toggle("is-home", diag.isCorrect);
      cube.classList.toggle("is-conflict", diag.inConflict);

      let moveAction = "";
      if (r === br - 1 && c === bc) moveAction = Action.UP;
      else if (r === br + 1 && c === bc) moveAction = Action.DOWN;
      else if (r === br && c === bc - 1) moveAction = Action.LEFT;
      else if (r === br && c === bc + 1) moveAction = Action.RIGHT;

      cube.dataset.moveAction = moveAction;
      cube.classList.toggle("is-movable", moveAction !== "");

      const badge = cube.querySelector(".cube-badge");
      badge.textContent = diag.inConflict ? "LC" : diag.manhattan === 0 ? "✓" : `d${diag.manhattan}`;
    }
  }
}
