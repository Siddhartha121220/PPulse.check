/**
 * Digital Filters & Window Functions
 *
 * Provides:
 *   - Window functions (Hann, Hamming, Blackman) for FFT preprocessing
 *   - 2nd-order Butterworth bandpass IIR filter for EVM temporal filtering
 *   - 1st-order IIR high-pass / low-pass for simple signal conditioning
 *
 * All functions operate on Float32Array for performance.
 */

import type { WindowFunction } from '../types/pipeline';

// ═══════════════════════════════════════════════════════════════════
// Window Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a window function of given length.
 * The result is cached internally for repeated calls with the same parameters.
 */
const windowCache = new Map<string, Float32Array>();

export function getWindow(type: WindowFunction, length: number): Float32Array {
  const key = `${type}_${length}`;
  const cached = windowCache.get(key);
  if (cached) return cached;

  const w = new Float32Array(length);
  const N = length - 1;

  switch (type) {
    case 'hann':
      for (let i = 0; i < length; i++) {
        w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N));
      }
      break;

    case 'hamming':
      for (let i = 0; i < length; i++) {
        w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / N);
      }
      break;

    case 'blackman':
      for (let i = 0; i < length; i++) {
        w[i] =
          0.42 -
          0.5 * Math.cos((2 * Math.PI * i) / N) +
          0.08 * Math.cos((4 * Math.PI * i) / N);
      }
      break;

    case 'rectangular':
    default:
      w.fill(1);
      break;
  }

  windowCache.set(key, w);
  return w;
}

/**
 * Apply a window function to a signal in place.
 * Returns the same array for chaining.
 */
export function applyWindow(
  signal: Float32Array,
  windowType: WindowFunction,
): Float32Array {
  const w = getWindow(windowType, signal.length);
  for (let i = 0; i < signal.length; i++) {
    signal[i] *= w[i];
  }
  return signal;
}

// ═══════════════════════════════════════════════════════════════════
// IIR Filters
// ═══════════════════════════════════════════════════════════════════

/**
 * 2nd-order Butterworth bandpass filter coefficients.
 *
 * Used by EVM for temporal filtering at each pyramid level.
 * Designed using bilinear transform of the analog prototype.
 *
 * @param lowCutHz  - Lower cutoff frequency (Hz)
 * @param highCutHz - Upper cutoff frequency (Hz)
 * @param sampleRate - Sample rate (Hz)
 * @returns Filter coefficients { b: [b0,b1,b2], a: [1, a1, a2] }
 */
export interface BiquadCoefficients {
  b: [number, number, number]; // feedforward: b0, b1, b2
  a: [number, number, number]; // feedback: 1, a1, a2
}

export function butterworthBandpass(
  lowCutHz: number,
  highCutHz: number,
  sampleRate: number,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * Math.sqrt(lowCutHz * highCutHz)) / sampleRate;
  const bw = (2 * Math.PI * (highCutHz - lowCutHz)) / sampleRate;

  // Pre-warp
  const omega = 2 * Math.tan(w0 / 2);
  const bandwidth = 2 * Math.tan(bw / 2);

  const Q = omega / bandwidth;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  // Normalize
  return {
    b: [b0 / a0, b1 / a0, b2 / a0],
    a: [1, a1 / a0, a2 / a0],
  };
}

/**
 * Stateful biquad (2nd-order IIR) filter.
 *
 * Implements Direct Form II transposed structure.
 * Create one instance per signal channel per pyramid level.
 */
export class BiquadFilter {
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;
  private z1 = 0;
  private z2 = 0;

  constructor(coeffs: BiquadCoefficients) {
    this.b0 = coeffs.b[0];
    this.b1 = coeffs.b[1];
    this.b2 = coeffs.b[2];
    this.a1 = coeffs.a[1];
    this.a2 = coeffs.a[2];
  }

  /** Process a single sample. Returns filtered value. */
  process(input: number): number {
    const output = this.b0 * input + this.z1;
    this.z1 = this.b1 * input - this.a1 * output + this.z2;
    this.z2 = this.b2 * input - this.a2 * output;
    return output;
  }

  /** Reset filter state (e.g., on session restart). */
  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

/**
 * Apply a biquad filter to an entire Float32Array.
 * Returns a new Float32Array with filtered values.
 */
export function applyBiquad(
  signal: Float32Array,
  coeffs: BiquadCoefficients,
): Float32Array {
  const filter = new BiquadFilter(coeffs);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    out[i] = filter.process(signal[i]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// Simple 1st-order IIR filters
// ═══════════════════════════════════════════════════════════════════

/**
 * 1st-order IIR high-pass filter applied to an array.
 * Cutoff specified in Hz.
 */
export function highPassFilter(
  samples: Float32Array,
  sampleRate: number,
  cutoffHz: number,
): Float32Array {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  const out = new Float32Array(samples.length);
  let prevIn = samples[0] ?? 0;
  let prevOut = 0;

  for (let i = 0; i < samples.length; i++) {
    const output = alpha * (prevOut + samples[i] - prevIn);
    out[i] = output;
    prevIn = samples[i];
    prevOut = output;
  }
  return out;
}

/**
 * 1st-order IIR low-pass filter applied to an array.
 * Cutoff specified in Hz.
 */
export function lowPassFilter(
  samples: Float32Array,
  sampleRate: number,
  cutoffHz: number,
): Float32Array {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  const out = new Float32Array(samples.length);
  out[0] = samples[0] ?? 0;

  for (let i = 1; i < samples.length; i++) {
    out[i] = out[i - 1] + alpha * (samples[i] - out[i - 1]);
  }
  return out;
}
