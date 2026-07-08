/**
 * FFT — Radix-2 Cooley-Tukey Fast Fourier Transform
 *
 * Pure TypeScript implementation using Float32Array.
 * No external dependencies.
 *
 * Designed for real-time heart rate estimation:
 *   - N=512 samples, Fs=30Hz → Δf ≈ 0.059 Hz (≈3.5 BPM resolution)
 *   - Cardiac band: 0.7–3.0 Hz (42–180 BPM)
 *
 * Usage:
 *   const result = fftMagnitude(signal);
 *   // result.magnitudes[k] = |X[k]| for k = 0..N/2
 *   // result.frequencies[k] = k * Fs / N
 */

import { isPowerOfTwo, nextPowerOfTwo } from './math';

/**
 * In-place Radix-2 Cooley-Tukey FFT.
 *
 * Input: real and imaginary arrays of length N (must be power of 2).
 * Output: the arrays are modified in place to contain the DFT.
 */
export function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const N = real.length;
  if (!isPowerOfTwo(N)) {
    throw new Error(`FFT length must be a power of 2, got ${N}`);
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      // Swap real
      let tmp = real[i];
      real[i] = real[j];
      real[j] = tmp;
      // Swap imag
      tmp = imag[i];
      imag[i] = imag[j];
      imag[j] = tmp;
    }
    let m = N >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Cooley-Tukey butterfly
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size >> 1;
    const angleStep = (-2 * Math.PI) / size;

    for (let i = 0; i < N; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = angleStep * k;
        const tReal = Math.cos(angle) * real[i + k + halfSize] -
                      Math.sin(angle) * imag[i + k + halfSize];
        const tImag = Math.sin(angle) * real[i + k + halfSize] +
                      Math.cos(angle) * imag[i + k + halfSize];

        real[i + k + halfSize] = real[i + k] - tReal;
        imag[i + k + halfSize] = imag[i + k] - tImag;
        real[i + k] += tReal;
        imag[i + k] += tImag;
      }
    }
  }
}

/**
 * Compute the magnitude spectrum of a real-valued signal.
 *
 * Returns only the first N/2+1 bins (positive frequencies).
 *
 * @param signal - Real-valued input signal. Will be zero-padded to next power of 2 if needed.
 * @param sampleRate - Sampling rate in Hz.
 * @returns magnitudes (Float32Array, length N/2+1) and frequencies (Float32Array, Hz).
 */
export function fftMagnitude(
  signal: Float32Array,
  sampleRate: number,
): { magnitudes: Float32Array; frequencies: Float32Array } {
  // Zero-pad to next power of 2
  const N = isPowerOfTwo(signal.length)
    ? signal.length
    : nextPowerOfTwo(signal.length);

  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  real.set(signal); // zero-pads automatically

  fftInPlace(real, imag);

  const halfN = (N >> 1) + 1;
  const magnitudes = new Float32Array(halfN);
  const frequencies = new Float32Array(halfN);

  for (let k = 0; k < halfN; k++) {
    magnitudes[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
    frequencies[k] = (k * sampleRate) / N;
  }

  return { magnitudes, frequencies };
}

/**
 * Compute the Power Spectral Density (PSD) of a real-valued signal.
 *
 * PSD[k] = |X[k]|² / N
 *
 * @param signal - Real-valued input signal.
 * @param sampleRate - Sampling rate in Hz.
 * @returns psd (Float32Array) and frequencies (Float32Array).
 */
export function fftPSD(
  signal: Float32Array,
  sampleRate: number,
): { psd: Float32Array; frequencies: Float32Array } {
  const { magnitudes, frequencies } = fftMagnitude(signal, sampleRate);
  const N = isPowerOfTwo(signal.length)
    ? signal.length
    : nextPowerOfTwo(signal.length);

  const psd = new Float32Array(magnitudes.length);
  for (let k = 0; k < magnitudes.length; k++) {
    psd[k] = (magnitudes[k] * magnitudes[k]) / N;
  }

  return { psd, frequencies };
}

/**
 * Find the dominant frequency within a specified band.
 *
 * Uses parabolic interpolation around the peak bin for sub-bin accuracy.
 *
 * @param magnitudes - Magnitude spectrum from fftMagnitude
 * @param frequencies - Frequency axis from fftMagnitude
 * @param lowHz - Lower bound of frequency band
 * @param highHz - Upper bound of frequency band
 * @returns { frequency, peakMagnitude, peakIndex } or null if no valid peak
 */
export function findDominantFrequency(
  magnitudes: Float32Array,
  frequencies: Float32Array,
  lowHz: number,
  highHz: number,
): { frequency: number; peakMagnitude: number; peakIndex: number } | null {
  // Find bin range for the band
  let kLow = 0;
  let kHigh = magnitudes.length - 1;

  for (let k = 0; k < frequencies.length; k++) {
    if (frequencies[k] >= lowHz) {
      kLow = k;
      break;
    }
  }
  for (let k = frequencies.length - 1; k >= 0; k--) {
    if (frequencies[k] <= highHz) {
      kHigh = k;
      break;
    }
  }

  if (kLow >= kHigh) return null;

  // Find peak in band
  let peakIndex = kLow;
  let peakMag = magnitudes[kLow];
  for (let k = kLow + 1; k <= kHigh; k++) {
    if (magnitudes[k] > peakMag) {
      peakMag = magnitudes[k];
      peakIndex = k;
    }
  }

  if (peakMag <= 0) return null;

  // Parabolic interpolation for sub-bin accuracy
  let refinedIndex = peakIndex;
  if (peakIndex > kLow && peakIndex < kHigh) {
    const left = magnitudes[peakIndex - 1];
    const center = magnitudes[peakIndex];
    const right = magnitudes[peakIndex + 1];
    const denom = left - 2 * center + right;
    if (denom !== 0) {
      refinedIndex = peakIndex + 0.5 * (left - right) / denom;
    }
  }

  const df = frequencies.length > 1 ? frequencies[1] - frequencies[0] : 1;
  const frequency = refinedIndex * df;

  return { frequency, peakMagnitude: peakMag, peakIndex };
}
