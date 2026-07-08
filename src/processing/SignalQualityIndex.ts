/**
 * Signal Quality Index (SQI)
 *
 * Computes a quality metric for a given 1D signal (BVP).
 * This metric is computed in the time domain, distinct from
 * the frequency-domain confidence score.
 */

import { std, mean, variance } from '../utils/math';

export class SignalQualityIndex {
  
  /**
   * Compute Zero-Crossing Rate (ZCR).
   * For a clean cardiac signal, ZCR should roughly match the heart rate.
   * Very high ZCR indicates high-frequency noise (motion/lighting).
   */
  computeZCR(signal: Float32Array): number {
    if (signal.length < 2) return 0;
    
    let crossings = 0;
    const m = mean(signal);
    
    for (let i = 1; i < signal.length; i++) {
      if ((signal[i] - m) * (signal[i - 1] - m) < 0) {
        crossings++;
      }
    }
    
    return crossings / signal.length;
  }

  /**
   * Compute Skewness (3rd moment).
   * A clean PPG signal is typically slightly skewed due to the dicrotic notch.
   * Near-zero or highly erratic skewness can indicate noise.
   */
  computeSkewness(signal: Float32Array): number {
    if (signal.length < 3) return 0;
    
    const m = mean(signal);
    const s = std(signal, m);
    if (s === 0) return 0;

    let sum = 0;
    for (let i = 0; i < signal.length; i++) {
      const diff = (signal[i] - m) / s;
      sum += diff * diff * diff;
    }
    
    return sum / signal.length;
  }

  /**
   * Overall Time-Domain Quality Score (0 to 1).
   * 
   * Combines ZCR and Skewness heuristics.
   * @param signal - detrended BVP signal
   */
  computeQuality(signal: Float32Array): number {
    const zcr = this.computeZCR(signal);
    
    // For a typical cardiac signal at 30fps (0.7-3.0 Hz):
    // Expected ZCR is roughly 2 * (1.5 Hz / 30 Hz) = 0.1
    // If ZCR is > 0.3, it's mostly noise.
    const zcrScore = Math.max(0, 1 - (zcr / 0.3));

    // Skewness: typical clean PPG has positive skewness around 0.5-1.5.
    // However, rPPG can sometimes be inverted depending on the projection.
    // For now, we just penalize extreme skewness.
    const skew = Math.abs(this.computeSkewness(signal));
    const skewScore = skew < 3 ? 1.0 : Math.max(0, 1 - ((skew - 3) / 2));

    // Combine
    return zcrScore * 0.8 + skewScore * 0.2;
  }
}
