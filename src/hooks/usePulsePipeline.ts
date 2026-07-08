import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Worklets, useRunOnJS } from 'react-native-worklets-core';
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

  // Worklet dependencies
  const { detectFaces } = useFaceDetector();
  const faceDetector = useRef(new FaceDetector(200)).current;
  const faceTracker = useRef(new FaceTracker()).current;
  const roiManager = useRef(new ROIManager()).current;
  const skinSegmenter = useRef(new SkinSegmenter()).current;

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
    
    // 1. Detect Face
    const detection = faceDetector.detect(frame, performance.now(), detectFaces);
    
    let face = null;
    let patches: ROIPatch[] = [];
    let avgCoveredRatio = 0;
    let rgbSample = null;

    if (detection) {
      // 2. Track Face
      face = faceTracker.update(detection);
    } else {
      face = faceTracker.predict();
    }

    if (face) {
      // 3. Extract ROIs
      patches = roiManager.extractROIs(frame, face);
      
      // Get active enhancer (either none or EVM)
      const enhancer = algorithmManager.getActiveEnhancement();
      
      // 4. Segment Skin and optionally Enhance
      let totalSkinRatio = 0;
      let totalR = 0, totalG = 0, totalB = 0;
      let validPixels = 0;

      for (let i = 0; i < patches.length; i++) {
        // Segment
        const { patch, coveredRatio } = skinSegmenter.segment(patches[i]);
        
        // Enhance (EVM)
        if (enhancer && enhancer.id !== 'none') {
           patch.pixels = enhancer.processFrame(patch.pixels, patch.width, patch.height);
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
    faceTracker.reset();
    if (pipelineRef.current) pipelineRef.current.start();
  }, [faceTracker]);

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
