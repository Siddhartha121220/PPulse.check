import type { SmoothedFace } from '../types/pipeline';
import { SignalQualityIndex } from './SignalQualityIndex';

/**
 * Confidence Estimator
 *
 * Computes the final composite confidence score (0-1) for a heart rate reading.
 *
 * Factors combined:
 * 1. Frequency domain SNR (from FFTAnalyzer)
 * 2. Time domain Signal Quality (from SignalQualityIndex)
 * 3. Face tracking stability
 * 4. Skin coverage ratio in ROI patches
 */
export class ConfidenceEstimator {
  private sqi = new SignalQualityIndex();

  /**
   * Compute final confidence score.
   *
   * @param fftConfidence - SNR-based confidence from FFT (0-1)
   * @param bvpSignal - Recent BVP samples for time-domain SQI
   * @param face - Current face tracking state
   * @param skinCoveredRatio - Average skin pixel ratio across ROIs (0-1)
   */
  computeConfidence(
    fftConfidence: number,
    bvpSignal: Float32Array,
    face: SmoothedFace | null,
    skinCoveredRatio: number
  ): number {
    
    // 1. Time-domain SQI
    const timeDomainQuality = this.sqi.computeQuality(bvpSignal);
    
    // 2. Face stability
    let faceStability = 0;
    if (face) {
      // If velocity is 0, score is 1. If velocity is high, score approaches 0.
      const v = Math.sqrt(face.velocity.dx * face.velocity.dx + face.velocity.dy * face.velocity.dy);
      // Assume velocity > 10 pixels/frame is very unstable
      faceStability = Math.max(0, 1 - (v / 10));
    }

    // 3. Lighting/Skin coverage
    // If we only have 20% skin pixels in the ROI, confidence drops severely.
    const coverageScore = skinCoveredRatio;

    // Weighting scheme
    const WEIGHTS = {
      fft: 0.5,
      timeDomain: 0.2,
      face: 0.15,
      coverage: 0.15,
    };

    const finalScore = 
      fftConfidence * WEIGHTS.fft +
      timeDomainQuality * WEIGHTS.timeDomain +
      faceStability * WEIGHTS.face +
      coverageScore * WEIGHTS.coverage;

    return Math.max(0, Math.min(1, finalScore));
  }
}
