/**
 * Math Utilities
 *
 * Pure functions for signal processing math.
 * All functions operate on Float32Array for GC-friendliness.
 */

/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Compute the arithmetic mean of a Float32Array. */
export function mean(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum / arr.length;
}

/** Compute the arithmetic mean of a plain number array. */
export function meanArray(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum / arr.length;
}

/** Compute the standard deviation of a Float32Array. */
export function std(arr: Float32Array, avg?: number): number {
  if (arr.length < 2) return 0;
  const m = avg ?? mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = arr[i] - m;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / arr.length);
}

/** Compute variance of a Float32Array. */
export function variance(arr: Float32Array, avg?: number): number {
  if (arr.length < 2) return 0;
  const m = avg ?? mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = arr[i] - m;
    sumSq += diff * diff;
  }
  return sumSq / arr.length;
}

/**
 * Subtract the mean from each element (detrending).
 * Modifies the array in place and returns it.
 */
export function detrend(arr: Float32Array): Float32Array {
  const m = mean(arr);
  for (let i = 0; i < arr.length; i++) {
    arr[i] -= m;
  }
  return arr;
}

/**
 * Normalize a Float32Array to zero mean and unit variance.
 * Returns a new Float32Array.
 */
export function normalize(arr: Float32Array): Float32Array {
  const m = mean(arr);
  const s = std(arr, m);
  const out = new Float32Array(arr.length);
  if (s === 0) {
    // All values identical — return zeros
    return out;
  }
  for (let i = 0; i < arr.length; i++) {
    out[i] = (arr[i] - m) / s;
  }
  return out;
}

/**
 * Compute the Root Mean Square of a Float32Array.
 */
export function rms(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    sumSq += arr[i] * arr[i];
  }
  return Math.sqrt(sumSq / arr.length);
}

/**
 * Linear interpolation between a and b.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Check if a number is a power of 2.
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Round up to the next power of 2.
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  let v = n - 1;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

/**
 * Exponential moving average smoother.
 * Returns a function that accepts new values and returns smoothed output.
 */
export function createEMASmoother(alpha: number): (value: number) => number {
  let smoothed: number | null = null;
  return (value: number) => {
    if (smoothed === null) {
      smoothed = value;
    } else {
      smoothed = alpha * value + (1 - alpha) * smoothed;
    }
    return smoothed;
  };
}
