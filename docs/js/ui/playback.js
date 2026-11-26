/**
 * Trajectory playback controller supporting Play, Pause, Stop, Speed, and Step-by-Step scrubbing.
 */
export class PlaybackController {
  constructor({ onStepChange, onStateChange }) {
    this.onStepChange = onStepChange;
    this.onStateChange = onStateChange;
    this.states = [];
    this.actions = [];
    this.stepIndex = 0;
    this.isPlaying = false;
    this.speedMs = 280;
    this._timerId = null;
  }

  loadTrajectory(initialState, actions, env) {
    this.stop();
    this.actions = actions.slice();
    this.states = [initialState];
    let curr = initialState;
    for (const act of this.actions) {
      curr = env.result(curr, act);
      this.states.push(curr);
    }
    this.stepIndex = 0;
    this._emit();
  }

  setSingleState(state) {
    this.stop();
    this.actions = [];
    this.states = [state];
    this.stepIndex = 0;
    this._emit();
  }

  setSpeed(ms) {
    this.speedMs = Math.max(40, Number(ms));
    if (this.isPlaying) {
      this._scheduleNext();
    }
  }

  play() {
    if (this.states.length <= 1) return;
    if (this.stepIndex >= this.states.length - 1) {
      this.stepIndex = 0;
      this._emit();
    }
    this.isPlaying = true;
    if (this.onStateChange) this.onStateChange(this.isPlaying);
    this._scheduleNext();
  }

  pause() {
    this.isPlaying = false;
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    if (this.onStateChange) this.onStateChange(this.isPlaying);
  }

  stop() {
    this.pause();
    this.stepIndex = 0;
    this._emit();
  }

  first() {
    this.pause();
    this.stepIndex = 0;
    this._emit();
  }

  prev() {
    this.pause();
    if (this.stepIndex > 0) {
      this.stepIndex--;
      this._emit();
    }
  }

  next() {
    this.pause();
    if (this.stepIndex < this.states.length - 1) {
      this.stepIndex++;
      this._emit();
    }
  }

  last() {
    this.pause();
    if (this.states.length > 0) {
      this.stepIndex = this.states.length - 1;
      this._emit();
    }
  }

  jumpTo(index) {
    this.pause();
    if (index >= 0 && index < this.states.length) {
      this.stepIndex = index;
      this._emit();
    }
  }

  _scheduleNext() {
    if (this._timerId !== null) clearTimeout(this._timerId);
    this._timerId = setTimeout(() => {
      if (!this.isPlaying) return;
      if (this.stepIndex < this.states.length - 1) {
        this.stepIndex++;
        this._emit();
        this._scheduleNext();
      } else {
        this.pause();
      }
    }, this.speedMs);
  }

  _emit() {
    if (this.states.length === 0) return;
    const state = this.states[this.stepIndex];
    const lastAction = this.stepIndex > 0 ? this.actions[this.stepIndex - 1] : null;
    this.onStepChange({
      state,
      stepIndex: this.stepIndex,
      totalSteps: this.actions.length,
      lastAction,
      actions: this.actions,
    });
  }
}
