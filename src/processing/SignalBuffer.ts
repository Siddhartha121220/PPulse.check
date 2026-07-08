import { butterworthBandpass, applyBiquad } from '../utils/filters';

/**
 * Signal Buffer
 *
 * A ring buffer for 1D signal samples (e.g. BVP from POS).
 * Uses Float32Array for performance and GC stability.
 * Provides methods to extract a linear array of recent samples
 * and compute the effective sample rate from timestamps.
 */
export class SignalBuffer {
  private values: Float32Array;
  private timestamps: Float32Array;
  private capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity = 512) {
    this.capacity = capacity;
    this.values = new Float32Array(capacity);
    this.timestamps = new Float32Array(capacity);
  }

  /**
   * Add a new sample to the buffer.
   */
  push(value: number, timestamp: number): void {
    this.values[this.head] = value;
    this.timestamps[this.head] = timestamp;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Get the number of samples currently in the buffer.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Check if the buffer is full.
   */
  isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * Get the most recent N samples as a flat Float32Array.
   * If N > count, returns all available samples.
   */
  getRecentValues(n: number = this.capacity): Float32Array {
    const numToGet = Math.min(n, this.count);
    const result = new Float32Array(numToGet);

    // Copy oldest first to newest last
    let idx = (this.head - numToGet + this.capacity) % this.capacity;
    for (let i = 0; i < numToGet; i++) {
      result[i] = this.values[idx];
      idx = (idx + 1) % this.capacity;
    }

    return result;
  }

  /**
   * Get the most recent N timestamps as a flat Float32Array.
   */
  getRecentTimestamps(n: number = this.capacity): Float32Array {
    const numToGet = Math.min(n, this.count);
    const result = new Float32Array(numToGet);

    let idx = (this.head - numToGet + this.capacity) % this.capacity;
    for (let i = 0; i < numToGet; i++) {
      result[i] = this.timestamps[idx];
      idx = (idx + 1) % this.capacity;
    }

    return result;
  }

  /**
   * Estimate the sample rate based on timestamps of the current buffer.
   * Uses linear regression on timestamps to find average dt.
   */
  getSampleRate(): number {
    if (this.count < 2) return 30; // default assumption

    const ts = this.getRecentTimestamps();
    const dt = ts[ts.length - 1] - ts[0];
    if (dt <= 0) return 30;

    return ((this.count - 1) / dt) * 1000;
  }

  /**
   * Get filtered version of the buffer using a bandpass filter.
   */
  getFilteredValues(lowCutHz: number, highCutHz: number): Float32Array {
    const raw = this.getRecentValues();
    const fs = this.getSampleRate();
    const coeffs = butterworthBandpass(lowCutHz, highCutHz, fs);
    return applyBiquad(raw, coeffs);
  }

  /**
   * Clear the buffer.
   */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.values.fill(0);
    this.timestamps.fill(0);
  }
}
