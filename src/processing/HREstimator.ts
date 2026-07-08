import type { SignalQuality } from '../types/pipeline';
import { createEMASmoother } from '../utils/math';

/**
 * Heart Rate Estimator
 *
 * Converts dominant frequency from FFT into BPM, applies temporal smoothing,
 * and clamps values to physiological limits.
 */
export class HREstimator {
  private bpmSmoother: (value: number) => number;
  private readonly minBpm = 42;
  private readonly maxBpm = 180;

  /**
   * @param smoothingAlpha - EMA alpha (0-1). Lower means more smoothing/latency.
   */
  constructor(smoothingAlpha = 0.2) {
    this.bpmSmoother = createEMASmoother(smoothingAlpha);
  }

  /**
   * Convert frequency to smoothed BPM.
   *
   * @param dominantFrequencyHz - Raw frequency from analyzer
   * @returns Filtered BPM, or NaN if frequency is out of bounds
   */
  estimateBPM(dominantFrequencyHz: number): number {
    if (dominantFrequencyHz <= 0) return NaN;

    const rawBpm = dominantFrequencyHz * 60;

    // Reject unphysiological jumps before smoothing
    if (rawBpm < this.minBpm || rawBpm > this.maxBpm) {
      return NaN;
    }

    const smoothedBpm = this.bpmSmoother(rawBpm);
    
    // Final clamp just in case
    return Math.max(this.minBpm, Math.min(this.maxBpm, smoothedBpm));
  }

  /**
   * Map raw numerical confidence to a qualitative SignalQuality category.
   *
   * @param confidence - 0 to 1
   */
  mapSignalQuality(confidence: number): SignalQuality {
    if (confidence >= 0.7) return 'Strong';
    if (confidence >= 0.4) return 'Good';
    return 'Weak';
  }

  reset(): void {
    // Recreate smoother to clear its state
    this.bpmSmoother = createEMASmoother(0.2);
  }
}
