import type { ISignalExtractionPlugin, ExtractionConfig, RGBSample } from '../../types/pipeline';
import { meanArray, std } from '../../utils/math';

/**
 * POS (Plane-Orthogonal-to-Skin) Extractor
 *
 * Implements Algorithm 1 from:
 * Wang et al., "Algorithmic Principles of Remote-PPG", IEEE TBME 2017
 */
export class POSExtractor implements ISignalExtractionPlugin {
  readonly id = 'pos';
  readonly name = 'POS (Wang 2017)';
  readonly description = 'Robust extraction using plane orthogonal to skin-tone';
  readonly requiresRGB = true;

  private windowLength = 32;
  private buffer: RGBSample[] = [];
  private bvpHistory: number[] = [];

  initialize(config: ExtractionConfig): void {
    this.windowLength = config.windowLength;
    this.reset();
  }

  /**
   * Extract a single BVP sample from the RGB stream.
   * Uses overlap-add over the temporal window.
   */
  extractSignal(sample: RGBSample): number {
    this.buffer.push(sample);

    // Not enough data for a full window
    if (this.buffer.length < this.windowLength) {
      return NaN;
    }

    // Keep buffer at exact window length
    if (this.buffer.length > this.windowLength) {
      this.buffer.shift();
    }

    // 1. Temporal Normalization
    // Compute mean of each channel over the window
    const rMean = meanArray(this.buffer.map(s => s.r));
    const gMean = meanArray(this.buffer.map(s => s.g));
    const bMean = meanArray(this.buffer.map(s => s.b));

    // Prevent division by zero
    if (rMean === 0 || gMean === 0 || bMean === 0) return NaN;

    const s1Array = new Float32Array(this.windowLength);
    const s2Array = new Float32Array(this.windowLength);

    for (let i = 0; i < this.windowLength; i++) {
      const s = this.buffer[i];
      const rn = s.r / rMean;
      const gn = s.g / gMean;
      const bn = s.b / bMean;

      // 2. Projection
      s1Array[i] = gn - bn;
      s2Array[i] = gn + bn - 2 * rn;
    }

    // 3. Alpha Tuning
    const stdS1 = std(s1Array);
    const stdS2 = std(s2Array);
    const alpha = stdS2 > 0 ? stdS1 / stdS2 : 0;

    // 4. Signal Combination
    // For overlap-add, we typically integrate the signal over time.
    // For real-time, extracting the *latest* point of the combined signal works well enough.
    // We compute the current h[n] value:
    const latestIdx = this.windowLength - 1;
    const hLatest = s1Array[latestIdx] + alpha * s2Array[latestIdx];

    // Simple integration (overlap-add simplified)
    // h(t) gives the derivative-like pulse signal, we can output it directly
    // since the bandpass filter downstream will shape it.
    
    // Store in history (optional, if we need full overlap-add integration)
    this.bvpHistory.push(hLatest);
    if (this.bvpHistory.length > this.windowLength) {
      this.bvpHistory.shift();
    }

    return hLatest;
  }

  reset(): void {
    this.buffer = [];
    this.bvpHistory = [];
  }

  dispose(): void {
    this.buffer = [];
    this.bvpHistory = [];
  }
}
