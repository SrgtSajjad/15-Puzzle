/**
 * Deterministic seeded PRNG (Mulberry32) for reproducible scrambles and GA runs.
 */
export class SeededRNG {
  constructor(seed = 42) {
    this.state = (Number(seed) >>> 0) || 1;
  }

  /** Return float in [0, 1). */
  random() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Return integer in [0, stop). */
  randRange(stop) {
    return Math.floor(this.random() * stop);
  }

  /** Return integer in [min, max] inclusive. */
  randInt(min, max) {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  /** Return a random element from a non-empty array. */
  choice(arr) {
    if (!arr || arr.length === 0) {
      throw new Error("Cannot choose from an empty sequence.");
    }
    return arr[this.randRange(arr.length)];
  }

  /** Sample k distinct elements from arr without replacement (Fisher-Yates partial). */
  sample(arr, k) {
    const copy = arr.slice();
    const n = Math.min(k, copy.length);
    for (let i = 0; i < n; i++) {
      const j = i + this.randRange(copy.length - i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
}
