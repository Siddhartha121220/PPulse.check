/**
 * Pipeline Types & Interfaces
 *
 * All interfaces for the configurable rPPG processing pipeline.
 * Every processing stage is defined as a plugin interface so that
 * concrete implementations can be swapped without structural changes.
 *
 * References:
 *   - POS: Wang et al., "Algorithmic Principles of Remote-PPG", IEEE TBME 2017
 *   - EVM: Wu et al., "Eulerian Video Magnification", SIGGRAPH 2012
 */

// ═══════════════════════════════════════════════════════════════════
// Shared Primitives
// ═══════════════════════════════════════════════════════════════════

/** A single RGB sample from a skin ROI, with timestamp. */
export interface RGBSample {
  r: number;
  g: number;
  b: number;
  timestamp: number; // ms since epoch
}

/** A single Blood Volume Pulse (BVP) sample. */
export interface BVPSample {
  value: number;
  timestamp: number;
}

/** Result from frequency-domain analysis. */
export interface FrequencyResult {
  /** Dominant frequency in Hz within the cardiac band. */
  dominantFrequencyHz: number;
  /** Confidence score 0–1 based on peak prominence vs noise floor. */
  confidence: number;
  /** Optional power spectral density for visualization. */
  spectrum?: Float32Array;
  /** Frequency axis corresponding to spectrum bins (Hz). */
  frequencyAxis?: Float32Array;
}

/** Final heart rate estimation output. */
export interface HeartRateResult {
  bpm: number;
  confidence: number;        // 0–1
  signalQuality: SignalQuality;
  method: string;            // e.g. 'pos+fft'
  timestamp: number;
}

export type SignalQuality = 'Weak' | 'Good' | 'Strong';

/** An extracted ROI patch from a face region. */
export interface ROIPatch {
  region: ROIRegion;
  /** Pixel data in interleaved RGB, normalized 0–1. */
  pixels: Float32Array;
  width: number;
  height: number;
  /** Center coordinates in the original frame. */
  centerX: number;
  centerY: number;
}

export type ROIRegion = 'forehead' | 'leftCheek' | 'rightCheek';

/** Bounding box in frame coordinates. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Face detection result from ML Kit or equivalent. */
export interface FaceDetectionResult {
  bbox: BoundingBox;
  landmarks: FaceLandmark[];
  confidence: number;       // 0–1
  yawAngle: number;         // degrees, for head pose
  rollAngle: number;
}

export interface FaceLandmark {
  type: string;             // e.g. 'leftEye', 'noseBase', etc.
  x: number;
  y: number;
}

/** Face tracking result with temporal smoothing applied. */
export interface SmoothedFace {
  bbox: BoundingBox;
  landmarks: FaceLandmark[];
  velocity: { dx: number; dy: number };
  isStable: boolean;        // true if velocity is below threshold
}

// ═══════════════════════════════════════════════════════════════════
// Plugin Interfaces
// ═══════════════════════════════════════════════════════════════════

/** Metadata for any registered plugin. */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
}

// ── Enhancement Plugin ──────────────────────────────────────────

export interface EnhancementConfig {
  pyramidLevels: number;
  amplificationFactor: number;
  frequencyLow: number;       // Hz
  frequencyHigh: number;      // Hz
  filterOrder: number;
  chromAttenuation: number;
  sampleRate: number;          // fps of incoming frames
}

/**
 * Enhancement plugins transform ROI pixel data to amplify subtle
 * temporal variations (e.g., EVM color magnification).
 * The "None" plugin passes data through unchanged.
 */
export interface IEnhancementPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  initialize(config: EnhancementConfig): void;
  /**
   * Process a single ROI patch. Returns enhanced pixel data.
   * The returned Float32Array has the same layout as the input
   * (interleaved RGB, normalized 0–1).
   */
  processFrame(
    roiPixels: Float32Array,
    width: number,
    height: number,
  ): Float32Array;
  reset(): void;
  dispose(): void;
}

// ── Signal Extraction Plugin ────────────────────────────────────

export interface ExtractionConfig {
  /** Sliding window length in frames (e.g. 32 for POS). */
  windowLength: number;
  /** Expected sample rate in Hz. */
  sampleRate: number;
}

/**
 * Signal extraction plugins convert a stream of RGB samples
 * (spatial averages over skin ROI) into a 1D pulse signal (BVP).
 *
 * Implementations include POS, CHROM, ICA, etc.
 */
export interface ISignalExtractionPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Whether the plugin needs all three channels (true for POS/CHROM). */
  readonly requiresRGB: boolean;
  initialize(config: ExtractionConfig): void;
  /**
   * Feed one RGB sample and receive the current BVP estimate.
   * Returns NaN if insufficient data has been accumulated.
   */
  extractSignal(sample: RGBSample): number;
  reset(): void;
  dispose(): void;
}

// ── Signal Processing Plugin ────────────────────────────────────

export interface ProcessingConfig {
  /** FFT window size (must be power of 2). */
  windowSize: number;
  /** Overlap ratio 0–1 (e.g. 0.5 for 50%). */
  windowOverlap: number;
  /** Window function to apply before FFT. */
  windowFunction: WindowFunction;
  /** Lower bound of cardiac frequency band (Hz). */
  frequencyRangeLow: number;
  /** Upper bound of cardiac frequency band (Hz). */
  frequencyRangeHigh: number;
  /** Signal sample rate in Hz. */
  sampleRate: number;
}

export type WindowFunction = 'hann' | 'hamming' | 'blackman' | 'rectangular';

/**
 * Signal processing plugins analyze a buffer of BVP samples
 * and estimate the dominant cardiac frequency.
 *
 * Implementations include FFT, Welch PSD, peak detection, autocorrelation.
 */
export interface ISignalProcessingPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  initialize(config: ProcessingConfig): void;
  /**
   * Estimate the dominant frequency from a signal buffer.
   * @param signal - BVP signal samples (Float32Array)
   * @param sampleRate - actual sample rate computed from timestamps
   */
  estimateFrequency(
    signal: Float32Array,
    sampleRate: number,
  ): FrequencyResult;
  reset(): void;
  dispose(): void;
}

// ═══════════════════════════════════════════════════════════════════
// Pipeline Configuration
// ═══════════════════════════════════════════════════════════════════

/** User-selectable operating mode. */
export type PipelineMode = 'standard' | 'enhanced' | 'visualization';

/** Complete pipeline configuration. */
export interface PipelineConfig {
  mode: PipelineMode;
  enhancement: EnhancementConfig;
  extraction: ExtractionConfig;
  processing: ProcessingConfig;
  /** Face detection throttle interval in ms (e.g. 200 for 5fps). */
  faceDetectionIntervalMs: number;
  /** Minimum face confidence to accept detection. */
  minFaceConfidence: number;
  /** Maximum yaw angle (degrees) to accept for signal quality. */
  maxYawAngle: number;
}

/** Default pipeline configurations for each mode. */
export const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig = {
  pyramidLevels: 4,
  amplificationFactor: 30,
  frequencyLow: 0.7,
  frequencyHigh: 3.0,
  filterOrder: 2,
  chromAttenuation: 0.1,
  sampleRate: 30,
};

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  windowLength: 32,
  sampleRate: 30,
};

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  windowSize: 512,
  windowOverlap: 0.5,
  windowFunction: 'hann',
  frequencyRangeLow: 0.7,
  frequencyRangeHigh: 3.0,
  sampleRate: 30,
};

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  mode: 'standard',
  enhancement: DEFAULT_ENHANCEMENT_CONFIG,
  extraction: DEFAULT_EXTRACTION_CONFIG,
  processing: DEFAULT_PROCESSING_CONFIG,
  faceDetectionIntervalMs: 200,
  minFaceConfidence: 0.5,
  maxYawAngle: 30,
};

// ═══════════════════════════════════════════════════════════════════
// Performance Monitoring
// ═══════════════════════════════════════════════════════════════════

export interface PerformanceReport {
  averageFps: number;
  stageTiming: Record<string, number>; // stage name → avg ms
  droppedFrames: number;
  totalFrames: number;
  peakMemoryMB: number;
}

// ═══════════════════════════════════════════════════════════════════
// Measurement Record (for Supabase storage)
// ═══════════════════════════════════════════════════════════════════

export interface MeasurementRecord {
  bpm: number;
  confidence: number;
  signalQuality: SignalQuality;
  mode: PipelineMode;
  enhancementAlgo: string;
  extractionAlgo: string;
  processingAlgo: string;
  processingFps: number | null;
  lightingEstimate: number | null;
  motionEstimate: number | null;
  deviceModel: string | null;
  osVersion: string | null;
  durationSeconds: number | null;
}
