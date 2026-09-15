import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets, useRunOnJS } from 'react-native-worklets-core';
import { useSharedValue } from 'react-native-reanimated';
import { PipelineController, PipelineState } from '../core/PipelineController';
import { AlgorithmManager } from '../core/AlgorithmManager';
import { configManager } from '../core/ConfigurationManager';
import type { ROIPatch } from '../types/pipeline';

// Import pure functions and state interfaces for worklet
import { createFaceDetectorState, detectFace, FaceDetectorState } from '../acquisition/FaceDetector';
import { createFaceTrackerState, updateFaceTracker, predictFaceTracker, resetFaceTrackerState, FaceTrackerState } from '../acquisition/FaceTracker';
import { extractROIs } from '../acquisition/ROIManager';
import { segmentSkin } from '../acquisition/SkinSegmenter';
import { createEVMState, processEVMFrame, resetEVMState, EVMState } from '../processing/enhancement/EulerianMagnification';

// Import plugins to register
import { NoEnhancement } from '../processing/enhancement/NoEnhancement';
import { EulerianMagnification } from '../processing/enhancement/EulerianMagnification';
import { POSExtractor } from '../processing/extraction/POSExtractor';
import { FFTAnalyzer } from '../processing/frequency/FFTAnalyzer';

// Singleton manager (configManager is the shared one from ConfigurationManager.ts)
const algorithmManager = new AlgorithmManager();

// Register plugins once
algorithmManager.registerEnhancement(new NoEnhancement());
algorithmManager.registerEnhancement(new EulerianMagnification());
algorithmManager.registerExtraction(new POSExtractor());
algorithmManager.registerProcessing(new FFTAnalyzer());

// Stable reference: useFaceDetector re-creates the native ML Kit plugin whenever
// this options object's identity changes, so it must not be a fresh literal per render.
//
// Contours/landmarks are intentionally off: nothing downstream reads them (ROIManager
// derives ROI boxes purely from the bbox, ConfidenceEstimator only uses velocity/coverage,
// FaceOverlay only draws the bbox/ROI rects) — they were being computed and smoothed every
// frame for no consumer. Contour extraction is also the most expensive and most fragile part
// of ML Kit's per-frame analysis (it requires much more of the face clearly visible to
// succeed), so this both raises achievable FPS and makes detection far more tolerant of a
// close-up/partially-cropped face.
const FACE_DETECTION_OPTIONS = {
  performanceMode: 'fast' as const,
  contourMode: 'none' as const,
  landmarkMode: 'none' as const,
};

export function usePulsePipeline() {
  const pipelineRef = useRef<PipelineController | null>(null);
  const [state, setState] = useState<PipelineState | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Shared values to pass state to the worklet thread safely
  const modeShared = useSharedValue<'standard' | 'enhanced' | 'visualization'>('standard');
  const resetTrigger = useSharedValue<number>(0);

  // Worklet context to store state objects on the worklet thread
  const workletContext = useRef({
    detectorState: null as FaceDetectorState | null,
    trackerState: null as FaceTrackerState | null,
    // One EVMState per ROI region, not one shared instance: forehead/leftCheek/rightCheek
    // have different pixel dimensions, so a single shared EVMState was being fully
    // reallocated (thousands of filter objects) on almost every patch, every frame —
    // a serious performance hit. Each region's own dimensions are stable frame-to-frame
    // (ROIManager quantizes to a 4px grid), so per-region state reallocates rarely.
    evmStateForehead: null as EVMState | null,
    evmStateLeftCheek: null as EVMState | null,
    evmStateRightCheek: null as EVMState | null,
    lastResetTrigger: 0,
  }).current;

  const { detectFaces } = useFaceDetector(FACE_DETECTION_OPTIONS);

  useEffect(() => {
    configManager.load().then(() => {
      pipelineRef.current = new PipelineController(algorithmManager, configManager);
      pipelineRef.current.subscribe(setState);
      setIsReady(true);
    });

    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }
    };
  }, []);

  const handleFrameProcessed = useCallback((rgbSample: any, face: any, patches: any, coveredRatio: number, detectionError: string | null, debugInfo: string | null) => {
    if (pipelineRef.current) {
      pipelineRef.current.onFrameProcessed(rgbSample, face, patches, coveredRatio, detectionError, debugInfo);
    }
  }, []);

  const runOnJS_handleFrameProcessed = useRunOnJS(handleFrameProcessed, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    // Initialize pure state objects on the worklet thread
    if (workletContext.detectorState === null) {
      workletContext.detectorState = createFaceDetectorState(200);
    }
    if (workletContext.trackerState === null) {
      workletContext.trackerState = createFaceTrackerState();
    }
    if (workletContext.evmStateForehead === null) {
      const evmConfig = {
        pyramidLevels: 4,
        amplificationFactor: 30,
        frequencyLow: 0.7,
        frequencyHigh: 3.0,
        filterOrder: 2,
        chromAttenuation: 0.1,
        sampleRate: 30,
      };
      workletContext.evmStateForehead = createEVMState(evmConfig);
      workletContext.evmStateLeftCheek = createEVMState(evmConfig);
      workletContext.evmStateRightCheek = createEVMState(evmConfig);
    }

    // Synchronize resets from the JS thread
    if (resetTrigger.value > workletContext.lastResetTrigger) {
      workletContext.lastResetTrigger = resetTrigger.value;
      resetFaceTrackerState(workletContext.trackerState);
      resetEVMState(workletContext.evmStateForehead!);
      resetEVMState(workletContext.evmStateLeftCheek!);
      resetEVMState(workletContext.evmStateRightCheek!);
    }

    // 1. Detect Face
    const detection = detectFace(frame, performance.now(), detectFaces, workletContext.detectorState);
    
    let face = null;
    let patches: ROIPatch[] = [];
    let avgCoveredRatio = 0;
    let rgbSample = null;

    if (detection) {
      // 2. Track Face
      face = updateFaceTracker(detection, workletContext.trackerState);
    } else {
      face = predictFaceTracker(workletContext.trackerState);
    }

    if (face) {
      // 3. Extract ROIs (forehead + cheeks)
      patches = extractROIs(frame, face);

      let totalSkinRatio = 0;
      let totalR = 0, totalG = 0, totalB = 0;
      let allPixels = 0;

      for (let i = 0; i < patches.length; i++) {
        const rawPatch = patches[i];

        // Track skin coverage ratio for confidence estimation
        const { coveredRatio } = segmentSkin(rawPatch);
        totalSkinRatio += coveredRatio;

        // Enhance (EVM) if not in Standard Mode — operates on raw patch.
        // Each region has its own EVMState (see workletContext init above) so a
        // stably-sized region never gets its filter bank reallocated just because
        // a differently-sized sibling region was processed in between.
        if (modeShared.value !== 'standard') {
          const evmState = rawPatch.region === 'forehead' ? workletContext.evmStateForehead!
            : rawPatch.region === 'leftCheek' ? workletContext.evmStateLeftCheek!
            : workletContext.evmStateRightCheek!;
          rawPatch.pixels = processEVMFrame(
            evmState,
            rawPatch.pixels,
            rawPatch.width,
            rawPatch.height,
          );
        }

        patches[i] = rawPatch;

        // Compute spatial RGB average from ALL ROI pixels (not just skin-classified).
        // POS is inherently robust to non-skin pixels; over-aggressive skin filtering
        // can leave validPixels=0 and kill the signal entirely.
        for (let j = 0; j < rawPatch.pixels.length; j += 3) {
          totalR += rawPatch.pixels[j];
          totalG += rawPatch.pixels[j + 1];
          totalB += rawPatch.pixels[j + 2];
          allPixels++;
        }
      }

      avgCoveredRatio = patches.length > 0 ? totalSkinRatio / patches.length : 0;

      if (allPixels > 0) {
        rgbSample = {
          r: totalR / allPixels,
          g: totalG / allPixels,
          b: totalB / allPixels,
          timestamp: performance.now(),
        };
      }
    }

    // Temporary while chasing the ROI coordinate-space bug: expose the raw values needed
    // to verify/fix the rotation transform in ROIManager.ts's toBufferSpace() without
    // needing Metro/logcat access — shows up in the "Buffering" status text on-screen.
    const debugInfo = face
      ? `[orient=${frame.orientation} fw=${frame.width} fh=${frame.height} bbox=(${Math.round(face.bbox.x)},${Math.round(face.bbox.y)},${Math.round(face.bbox.width)},${Math.round(face.bbox.height)})]`
      : null;

    // 5. Send to PipelineController on JS Thread
    runOnJS_handleFrameProcessed(rgbSample, face, patches, avgCoveredRatio, workletContext.detectorState.lastError, debugInfo);
  }, [detectFaces, runOnJS_handleFrameProcessed]);

  const start = useCallback(() => {
    resetTrigger.value = resetTrigger.value + 1;
    if (pipelineRef.current) {
      // Read the mode PipelineController.start() is about to apply, not the
      // controller's current state — state.mode is still 'standard' (the
      // INITIAL_STATE default) until start() runs, so reading it here always
      // returned 'standard' and silently disabled EVM in every other mode.
      const mode = configManager.getMode();
      modeShared.value = mode;
      pipelineRef.current.start(mode);
    }
  }, [modeShared, resetTrigger]);

  const stop = useCallback(() => {
    return pipelineRef.current ? pipelineRef.current.stop() : null;
  }, []);

  const getActiveAlgorithms = useCallback(() => {
    return pipelineRef.current ? pipelineRef.current.getActiveAlgorithms() : { enhancement: 'none', extraction: 'pos', processing: 'fft' };
  }, []);

  const getSessionDurationSec = useCallback(() => {
    return pipelineRef.current ? pipelineRef.current.getSessionDurationSec() : 0;
  }, []);

  return {
    state,
    isReady,
    frameProcessor,
    start,
    stop,
    getActiveAlgorithms,
    getSessionDurationSec,
    configManager,
  };
}
