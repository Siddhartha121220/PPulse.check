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

const windowCache = new Map<string, Float32Array>();

export function getWindow(type: WindowFunction, length: number): Float32Array {
  'worklet';
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

export function applyWindow(
  signal: Float32Array,
  windowType: WindowFunction,
): Float32Array {
  'worklet';
  const w = getWindow(windowType, signal.length);
  for (let i = 0; i < signal.length; i++) {
    signal[i] *= w[i];
  }
  return signal;
}

// ═══════════════════════════════════════════════════════════════════
// IIR Filters
// ═══════════════════════════════════════════════════════════════════

export interface BiquadCoefficients {
  b: [number, number, number]; // feedforward: b0, b1, b2
  a: [number, number, number]; // feedback: 1, a1, a2
}

export function butterworthBandpass(
  lowCutHz: number,
  highCutHz: number,
  sampleRate: number,
): BiquadCoefficients {
  'worklet';
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

  return {
    b: [b0 / a0, b1 / a0, b2 / a0],
    a: [1, a1 / a0, a2 / a0],
  };
}

export interface BiquadFilterState {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  z1: number;
  z2: number;
}

export function createBiquadFilterState(coeffs: BiquadCoefficients): BiquadFilterState {
  'worklet';
  return {
    b0: coeffs.b[0],
    b1: coeffs.b[1],
    b2: coeffs.b[2],
    a1: coeffs.a[1],
    a2: coeffs.a[2],
    z1: 0,
    z2: 0,
  };
}

export function processBiquadFilter(state: BiquadFilterState, input: number): number {
  'worklet';
  const output = state.b0 * input + state.z1;
  state.z1 = state.b1 * input - state.a1 * output + state.z2;
  state.z2 = state.b2 * input - state.a2 * output;
  return output;
}

export function resetBiquadFilter(state: BiquadFilterState): void {
  'worklet';
  state.z1 = 0;
  state.z2 = 0;
}

export function applyBiquad(
  signal: Float32Array,
  coeffs: BiquadCoefficients,
): Float32Array {
  'worklet';
  const state = createBiquadFilterState(coeffs);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    out[i] = processBiquadFilter(state, signal[i]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// Simple 1st-order IIR filters
// ═══════════════════════════════════════════════════════════════════

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
