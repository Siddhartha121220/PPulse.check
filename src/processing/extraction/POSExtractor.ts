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

    // Not enough data for a full window yet
    if (this.buffer.length < this.windowLength) {
      return NaN;
    }

    // Keep buffer at exact window length (sliding window)
    if (this.buffer.length > this.windowLength) {
      this.buffer.shift();
    }

    // 1. Temporal Normalization — compute per-channel mean
    const rMean = meanArray(this.buffer.map(s => s.r));
    const gMean = meanArray(this.buffer.map(s => s.g));
    const bMean = meanArray(this.buffer.map(s => s.b));

    // Use epsilon instead of strict === 0 to handle near-dark frames
    const EPS = 1e-6;
    if (rMean < EPS || gMean < EPS || bMean < EPS) return NaN;

    const s1Array = new Float32Array(this.windowLength);
    const s2Array = new Float32Array(this.windowLength);

    for (let i = 0; i < this.windowLength; i++) {
      const s = this.buffer[i];
      const rn = s.r / rMean;
      const gn = s.g / gMean;
      const bn = s.b / bMean;

      // 2. Projection onto skin-orthogonal plane
      s1Array[i] = gn - bn;
      s2Array[i] = gn + bn - 2 * rn;
    }

    // 3. Alpha Tuning
    const stdS1 = std(s1Array);
    const stdS2 = std(s2Array);

    // Fallback: if POS signal is flat (e.g. bad pixels or uniform patch),
    // use normalized green channel directly — green has the strongest BVP component.
    if (stdS1 < EPS && stdS2 < EPS) {
      const gNorm = this.buffer[this.windowLength - 1].g / gMean - 1.0;
      this.bvpHistory.push(gNorm);
      if (this.bvpHistory.length > this.windowLength) this.bvpHistory.shift();
      return gNorm;
    }

    const alpha = stdS2 > EPS ? stdS1 / stdS2 : 1.0;

    // 4. Signal Combination — latest sample of POS signal h[n]
    const latestIdx = this.windowLength - 1;
    const hLatest = s1Array[latestIdx] + alpha * s2Array[latestIdx];

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
