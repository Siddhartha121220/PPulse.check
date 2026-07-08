import type { ISignalProcessingPlugin, ProcessingConfig, FrequencyResult } from '../../types/pipeline';
import { fftPSD, findDominantFrequency } from '../../utils/fft';
import { applyWindow } from '../../utils/filters';
import { detrend, normalize } from '../../utils/math';

/**
 * FFT Analyzer
 *
 * Estimates dominant frequency using Radix-2 FFT and Power Spectral Density.
 * Includes windowing, detrending, and peak interpolation.
 */
export class FFTAnalyzer implements ISignalProcessingPlugin {
  readonly id = 'fft';
  readonly name = 'FFT PSD Analyzer';
  readonly description = 'Frequency domain peak detection with windowing';

  private config!: ProcessingConfig;
  private workspace!: Float32Array;

  initialize(config: ProcessingConfig): void {
    this.config = config;
    this.workspace = new Float32Array(config.windowSize);
  }

  estimateFrequency(signal: Float32Array, sampleRate: number): FrequencyResult {
    // 1. Copy signal to workspace to avoid mutating the source buffer
    // Signal must match config.windowSize
    const len = Math.min(signal.length, this.workspace.length);
    this.workspace.fill(0);
    this.workspace.set(signal.subarray(0, len));

    // 2. Pre-process: Detrend and normalize
    detrend(this.workspace);
    const normalized = normalize(this.workspace);

    // 3. Apply window function (e.g., Hann)
    applyWindow(normalized, this.config.windowFunction);

    // 4. Compute Power Spectral Density
    const { psd, frequencies } = fftPSD(normalized, sampleRate);

    // 5. Find dominant peak in cardiac band
    const peak = findDominantFrequency(
      psd,
      frequencies,
      this.config.frequencyRangeLow,
      this.config.frequencyRangeHigh
    );

    if (!peak) {
      return { dominantFrequencyHz: 0, confidence: 0, spectrum: psd, frequencyAxis: frequencies };
    }

    // 6. Estimate confidence
    // A simple SNR-like confidence metric: peak power / average power in band
    let bandPower = 0;
    let bandBins = 0;
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= this.config.frequencyRangeLow && frequencies[i] <= this.config.frequencyRangeHigh) {
        bandPower += psd[i];
        bandBins++;
      }
    }
    
    const avgPower = bandBins > 0 ? bandPower / bandBins : 1;
    // SNR ratio
    const snr = peak.peakMagnitude / (avgPower || 1);
    
    // Map SNR to 0-1 confidence (empirical thresholds)
    // SNR > 10 is usually very good.
    const confidence = Math.min(1.0, Math.max(0, (snr - 2) / 8));

    return {
      dominantFrequencyHz: peak.frequency,
      confidence,
      spectrum: psd,
      frequencyAxis: frequencies,
    };
  }

  reset(): void {
    if (this.workspace) {
      this.workspace.fill(0);
    }
  }

  dispose(): void {
    // Let GC handle it
  }
}
