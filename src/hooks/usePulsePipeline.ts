import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets, useRunOnJS } from 'react-native-worklets-core';
import { useSharedValue } from 'react-native-reanimated';
import { PipelineController, PipelineState } from '../core/PipelineController';
import { AlgorithmManager } from '../core/AlgorithmManager';
import { ConfigurationManager } from '../core/ConfigurationManager';
import { FaceDetector } from '../acquisition/FaceDetector';
import { FaceTracker } from '../acquisition/FaceTracker';
import { ROIManager } from '../acquisition/ROIManager';
import { SkinSegmenter } from '../acquisition/SkinSegmenter';
import type { ROIPatch } from '../types/pipeline';

// Import plugins to register
import { NoEnhancement } from '../processing/enhancement/NoEnhancement';
import { EulerianMagnification } from '../processing/enhancement/EulerianMagnification';
import { POSExtractor } from '../processing/extraction/POSExtractor';
import { FFTAnalyzer } from '../processing/frequency/FFTAnalyzer';

// Singleton managers (could also be provided via Context, but for now singleton is fine)
const configManager = new ConfigurationManager();
const algorithmManager = new AlgorithmManager();

// Register plugins once
algorithmManager.registerEnhancement(new NoEnhancement());
algorithmManager.registerEnhancement(new EulerianMagnification());
algorithmManager.registerExtraction(new POSExtractor());
algorithmManager.registerProcessing(new FFTAnalyzer());
// EVM will be registered here in Milestone 5

export function usePulsePipeline() {
  const pipelineRef = useRef<PipelineController | null>(null);
  const [state, setState] = useState<PipelineState | null>(null);

  // Shared values to pass state to the worklet thread safely
  const modeShared = useSharedValue<'standard' | 'enhanced' | 'visualization'>('standard');
  const resetTrigger = useSharedValue<number>(0);

  // Worklet context to store class instances on the worklet thread to preserve prototype methods
  const workletContext = useRef({
    detector: null as FaceDetector | null,
    tracker: null as FaceTracker | null,
    roiManager: null as ROIManager | null,
    skinSegmenter: null as SkinSegmenter | null,
    evmEnhancer: null as EulerianMagnification | null,
    lastResetTrigger: 0,
  }).current;

  const { detectFaces } = useFaceDetector();

  useEffect(() => {
    configManager.load().then(() => {
      pipelineRef.current = new PipelineController(algorithmManager, configManager);
      pipelineRef.current.subscribe(setState);
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
    
    // Instantiate components inside the worklet thread so they have correct context/prototypes
    if (workletContext.detector === null) {
      workletContext.detector = new FaceDetector(200);
    }
    if (workletContext.tracker === null) {
      workletContext.tracker = new FaceTracker();
    }
    if (workletContext.roiManager === null) {
      workletContext.roiManager = new ROIManager();
    }
    if (workletContext.skinSegmenter === null) {
      workletContext.skinSegmenter = new SkinSegmenter();
    }
    if (workletContext.evmEnhancer === null) {
      workletContext.evmEnhancer = new EulerianMagnification();
      workletContext.evmEnhancer.initialize({
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
      workletContext.tracker.reset();
      workletContext.evmEnhancer.reset();
    }
    
    // 1. Detect Face
    const detection = workletContext.detector.detect(frame, performance.now(), detectFaces);
    
    let face = null;
    let patches: ROIPatch[] = [];
    let avgCoveredRatio = 0;
    let rgbSample = null;

    if (detection) {
      // 2. Track Face
      face = workletContext.tracker.update(detection);
    } else {
      face = workletContext.tracker.predict();
    }

    if (face) {
      // 3. Extract ROIs
      patches = workletContext.roiManager.extractROIs(frame, face);
      
      // 4. Segment Skin and optionally Enhance
      let totalSkinRatio = 0;
      let totalR = 0, totalG = 0, totalB = 0;
      let validPixels = 0;

      for (let i = 0; i < patches.length; i++) {
        // Segment
        const { patch, coveredRatio } = workletContext.skinSegmenter.segment(patches[i]);
        
        // Enhance (EVM) if not in Standard Mode
        if (modeShared.value !== 'standard') {
           patch.pixels = workletContext.evmEnhancer.processFrame(patch.pixels, patch.width, patch.height);
        }
        
        patches[i] = patch;
        totalSkinRatio += coveredRatio;

        // Compute spatial average for RGB sample
        for (let j = 0; j < patch.pixels.length; j += 3) {
          if (patch.pixels[j] > 0 || patch.pixels[j+1] > 0 || patch.pixels[j+2] > 0) {
            totalR += patch.pixels[j];
            totalG += patch.pixels[j+1];
            totalB += patch.pixels[j+2];
            validPixels++;
          }
        }
      }

      avgCoveredRatio = patches.length > 0 ? totalSkinRatio / patches.length : 0;

      if (validPixels > 0) {
        rgbSample = {
          r: totalR / validPixels,
          g: totalG / validPixels,
          b: totalB / validPixels,
          timestamp: performance.now(),
        };
      }
    }

    // 5. Send to PipelineController on JS Thread
    runOnJS_handleFrameProcessed(rgbSample, face, patches, avgCoveredRatio);
  }, []);

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
    frameProcessor,
    start,
    stop,
    getActiveAlgorithms,
    getSessionDurationSec,
    configManager,
  };
}
