import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets, useRunOnJS } from 'react-native-worklets-core';
import { useSharedValue } from 'react-native-reanimated';
import { PipelineController, PipelineState } from '../core/PipelineController';
import { AlgorithmManager } from '../core/AlgorithmManager';
import { ConfigurationManager } from '../core/ConfigurationManager';
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

// Singleton managers
const configManager = new ConfigurationManager();
const algorithmManager = new AlgorithmManager();

// Register plugins once
algorithmManager.registerEnhancement(new NoEnhancement());
algorithmManager.registerEnhancement(new EulerianMagnification());
algorithmManager.registerExtraction(new POSExtractor());
algorithmManager.registerProcessing(new FFTAnalyzer());

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
    evmState: null as EVMState | null,
    lastResetTrigger: 0,
  }).current;

  const { detectFaces } = useFaceDetector({
    performanceMode: 'fast',
    contourMode: 'all',
    landmarkMode: 'all',
  });

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

  const handleFrameProcessed = useCallback((rgbSample: any, face: any, patches: any, coveredRatio: number) => {
    if (pipelineRef.current) {
      pipelineRef.current.onFrameProcessed(rgbSample, face, patches, coveredRatio);
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
    if (workletContext.evmState === null) {
      workletContext.evmState = createEVMState({
        pyramidLevels: 4,
        amplificationFactor: 30,
        frequencyLow: 0.7,
        frequencyHigh: 3.0,
        filterOrder: 2,
        chromAttenuation: 0.1,
        sampleRate: 30,
      });
    }

    // Synchronize resets from the JS thread
    if (resetTrigger.value > workletContext.lastResetTrigger) {
      workletContext.lastResetTrigger = resetTrigger.value;
      resetFaceTrackerState(workletContext.trackerState);
      resetEVMState(workletContext.evmState);
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

        // Enhance (EVM) if not in Standard Mode — operates on raw patch
        if (modeShared.value !== 'standard') {
          rawPatch.pixels = processEVMFrame(
            workletContext.evmState,
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

    // 5. Send to PipelineController on JS Thread
    runOnJS_handleFrameProcessed(rgbSample, face, patches, avgCoveredRatio);
  }, [detectFaces, runOnJS_handleFrameProcessed]);

  const start = useCallback(() => {
    resetTrigger.value = resetTrigger.value + 1;
    if (pipelineRef.current) {
      const mode = pipelineRef.current.getState().mode;
      modeShared.value = mode;
      pipelineRef.current.start();
    }
  }, [pipelineRef, modeShared, resetTrigger]);

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
