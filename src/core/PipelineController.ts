/**
 * Pipeline Controller
 *
 * The main orchestrator of the rPPG processing pipeline.
 * Receives raw camera frames and drives them through:
 *
 *   Frame → FaceDetect → Track → ROI → Enhance → Extract → Buffer → Process → HR
 *
 * Each stage is called through interfaces, with concrete implementations
 * resolved by the AlgorithmManager at runtime.
 *
 * The PipelineController does NOT implement any algorithm logic.
 * It only manages data flow, timing, and state transitions.
 *
 * Thread model:
 *   - Frame arrival: worklet thread (VisionCamera)
 *   - ROI extraction: worklet thread
 *   - Signal processing: JS thread (via Worklets.createRunOnJS)
 *   - UI updates: JS thread (React state)
 *
 * This is a skeleton for Milestone 1. Acquisition and processing
 * modules are wired in subsequent milestones.
 */

import { AlgorithmManager } from './AlgorithmManager';
import { ConfigurationManager } from './ConfigurationManager';
import { PerformanceMonitor } from '../monitoring/PerformanceMonitor';
import { createLogger } from '../monitoring/Logger';
import type {
  HeartRateResult,
  PipelineMode,
  RGBSample,
  ROIPatch,
  SmoothedFace,
  SignalQuality,
} from '../types/pipeline';

import { HREstimator } from '../processing/HREstimator';
import { ConfidenceEstimator } from '../processing/ConfidenceEstimator';
import { SignalBuffer } from '../processing/SignalBuffer';

const log = createLogger('PipelineController');

/** Pipeline state exposed to the UI layer. */
export interface PipelineState {
  isRunning: boolean;
  mode: PipelineMode;
  bpm: number;
  confidence: number;
  signalQuality: SignalQuality;
  fps: number;
  statusText: string;
  faceDetected: boolean;
  /** Current face bounding box for overlay rendering. */
  faceBbox: { x: number; y: number; width: number; height: number } | null;
  /** Current ROI patches for overlay rendering. */
  roiPatches: ROIPatch[];
  /** Latest BVP spectrum for visualization (if available). */
  spectrum: Float32Array | null;
}

const INITIAL_STATE: PipelineState = {
  isRunning: false,
  mode: 'standard',
  bpm: 0,
  confidence: 0,
  signalQuality: 'Weak',
  fps: 0,
  statusText: 'Position your face in the frame',
  faceDetected: false,
  faceBbox: null,
  roiPatches: [],
  spectrum: null,
};

/** Callback type for state updates pushed to the UI. */
export type PipelineStateListener = (state: PipelineState) => void;

export class PipelineController {
  private algorithmManager: AlgorithmManager;
  private configManager: ConfigurationManager;
  private perfMonitor: PerformanceMonitor;

  private signalBuffer: SignalBuffer;
  private hrEstimator: HREstimator;
  private confidenceEstimator: ConfidenceEstimator;

  private state: PipelineState = { ...INITIAL_STATE };
  private listeners: PipelineStateListener[] = [];

  // Session tracking
  private sessionStartTime = 0;
  private sampleCount = 0;
  private lastUpdateTime = 0;

  /** Minimum interval between UI state pushes (ms). */
  private static readonly UI_UPDATE_INTERVAL_MS = 500;

  constructor(
    algorithmManager: AlgorithmManager,
    configManager: ConfigurationManager,
  ) {
    this.algorithmManager = algorithmManager;
    this.configManager = configManager;
    this.perfMonitor = new PerformanceMonitor();
    
    const config = this.configManager.buildPipelineConfig();
    this.signalBuffer = new SignalBuffer(config.processing.windowSize);
    this.hrEstimator = new HREstimator(0.2);
    this.confidenceEstimator = new ConfidenceEstimator();
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /**
   * Start a measurement session.
   * Initializes all active plugins and resets state.
   */
  start(mode?: PipelineMode): void {
    const activeMode = mode ?? this.configManager.getMode();
    this.algorithmManager.applyMode(activeMode);

    // Build config before initializing plugins
    const config = this.configManager.buildPipelineConfig();

    // Initialize all active plugins with their configs
    const extractor = this.algorithmManager.getActiveExtraction();
    if (extractor) {
      extractor.initialize(config.extraction);
    }
    const processor = this.algorithmManager.getActiveProcessing();
    if (processor) {
      processor.initialize(config.processing);
    }
    const enhancer = this.algorithmManager.getActiveEnhancement();
    if (enhancer) {
      enhancer.initialize(config.enhancement);
    }

    // Reset all plugins for fresh session
    this.algorithmManager.resetAllPlugins();
    this.perfMonitor.reset();
    this.signalBuffer.reset();
    this.hrEstimator.reset();

    this.sessionStartTime = Date.now();
    this.sampleCount = 0;
    this.lastUpdateTime = 0;

    this.state = {
      ...INITIAL_STATE,
      isRunning: true,
      mode: activeMode,
      statusText: 'Position your face in the frame',
    };

    this.notifyListeners();
    log.info('Pipeline started', { mode: activeMode });
  }

  /**
   * Stop the current measurement session.
   * Returns the final HeartRateResult (or null if no valid reading).
   */
  stop(): HeartRateResult | null {
    if (!this.state.isRunning) return null;

    const result: HeartRateResult | null =
      this.state.bpm > 0
        ? {
            bpm: this.state.bpm,
            confidence: this.state.confidence / 100,
            signalQuality: this.state.signalQuality,
            method: `${this.algorithmManager.getActiveIds().extraction}+${this.algorithmManager.getActiveIds().processing}`,
            timestamp: Date.now(),
          }
        : null;

    this.state = { ...INITIAL_STATE };
    this.notifyListeners();

    this.perfMonitor.logReport();
    log.info('Pipeline stopped', {
      bpm: result?.bpm ?? 0,
      duration: Date.now() - this.sessionStartTime,
      totalSamples: this.sampleCount,
    });

    return result;
  }

  // ── Frame Processing (skeleton — wired in Milestone 2+3) ─────

  /**
   * Process a single frame from the camera.
   *
   * This is called from the worklet thread via Worklets.createRunOnJS.
   * The actual acquisition stages (face detection, ROI extraction)
   * happen in the worklet; this method receives the extracted data.
   *
   * @param rgbSample - Spatially averaged RGB from skin ROI
   * @param face - Smoothed face tracking result (or null)
   * @param roiPatches - Extracted ROI patches
   * @param coveredRatio - Ratio of skin pixels in ROI (0–1)
   */
  onFrameProcessed(
    rgbSample: RGBSample | null,
    face: SmoothedFace | null,
    roiPatches: ROIPatch[],
    coveredRatio: number,
  ): void {
    if (!this.state.isRunning) return;

    this.perfMonitor.recordFrameTick();
    this.sampleCount++;

    // Update face state
    this.state.faceDetected = face !== null;
    this.state.faceBbox = face?.bbox ?? null;
    this.state.roiPatches = roiPatches;

    if (!face || !rgbSample) {
      this.state.statusText = face
        ? 'Keep forehead and cheeks visible'
        : 'Position your face in the frame';
      // Always update FPS so the user can confirm frames are flowing
      this.state.fps = Math.round(this.perfMonitor.getAverageFps());
      this.throttledNotify();
      return;
    }

    // ── Enhancement stage ───────────────────────────────────────
    // (wired in Milestone 5 — EVM processes ROI patches)
    const enhancer = this.algorithmManager.getActiveEnhancement();
    if (enhancer) {
      this.perfMonitor.startFrame('enhancement');
      // Enhanced ROI patches would be processed here
      this.perfMonitor.endFrame('enhancement');
    }

    // ── Signal extraction stage ─────────────────────────────────
    const extractor = this.algorithmManager.getActiveExtraction();
    if (extractor) {
      this.perfMonitor.startFrame('extraction');
      const bvpValue = extractor.extractSignal(rgbSample);
      this.perfMonitor.endFrame('extraction');

      if (!isNaN(bvpValue)) {
        // Feed BVP to signal buffer
        this.signalBuffer.push(bvpValue, Date.now());

        // ── Signal processing stage (FFT) ─────────────────────
        const processor = this.algorithmManager.getActiveProcessing();
        
        // We run FFT only periodically, not every frame, to save CPU.
        // Or we run it if the buffer is full and we haven't updated in a while.
        if (processor && this.signalBuffer.isFull() && (Date.now() - this.lastUpdateTime >= PipelineController.UI_UPDATE_INTERVAL_MS)) {
          this.perfMonitor.startFrame('processing');
          
          const rawSignal = this.signalBuffer.getRecentValues();
          const effectiveSampleRate = this.signalBuffer.getSampleRate();
          
          const freqResult = processor.estimateFrequency(rawSignal, effectiveSampleRate);
          
          this.perfMonitor.endFrame('processing');

          // Estimate HR
          const bpm = this.hrEstimator.estimateBPM(freqResult.dominantFrequencyHz);
          
          if (!isNaN(bpm)) {
            // Compute Confidence
            const finalConfidence = this.confidenceEstimator.computeConfidence(
              freqResult.confidence,
              rawSignal,
              face,
              coveredRatio
            );

            this.state.bpm = Math.round(bpm);
            this.state.confidence = Math.round(finalConfidence * 100);
            this.state.signalQuality = this.hrEstimator.mapSignalQuality(finalConfidence);
            this.state.spectrum = freqResult.spectrum ?? null;
            this.state.statusText = 'Measuring heart rate...';
          } else {
            this.state.statusText = 'Signal too noisy, please hold still';
          }
        } else if (!this.signalBuffer.isFull()) {
          const bufferConfig = this.configManager.buildPipelineConfig();
          const progress = Math.round((this.signalBuffer.getCount() / bufferConfig.processing.windowSize) * 100);
          this.state.statusText = `Calibrating (${progress}%)...`;
        }
      } else {
        this.state.statusText = 'Collecting signal data...';
      }
    } else if (this.state.mode === 'visualization') {
      this.state.statusText = 'Displaying magnified video';
    }

    // Update FPS every frame (not just when FFT fires)
    this.state.fps = Math.round(this.perfMonitor.getAverageFps());

    this.throttledNotify();
  }

  // ── State Management ──────────────────────────────────────────

  /**
   * Subscribe to pipeline state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: PipelineStateListener): () => void {
    this.listeners.push(listener);
    // Immediately emit current state
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Get the current pipeline state (snapshot).
   */
  getState(): Readonly<PipelineState> {
    return this.state;
  }

  /**
   * Get the session duration in seconds.
   */
  getSessionDurationSec(): number {
    if (this.sessionStartTime === 0) return 0;
    return Math.round((Date.now() - this.sessionStartTime) / 1000);
  }

  /**
   * Get the active algorithm IDs for storage metadata.
   */
  getActiveAlgorithms() {
    return this.algorithmManager.getActiveIds();
  }

  /**
   * Get the performance monitor for external reporting.
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.perfMonitor;
  }

  // ── Internal ──────────────────────────────────────────────────

  private notifyListeners(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /**
   * Throttle UI updates to avoid excessive React re-renders.
   * State is pushed at most every UI_UPDATE_INTERVAL_MS.
   */
  private throttledNotify(): void {
    const now = Date.now();
    if (now - this.lastUpdateTime >= PipelineController.UI_UPDATE_INTERVAL_MS) {
      this.lastUpdateTime = now;
      this.notifyListeners();
    }
  }
}
