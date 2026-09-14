import type { Frame } from 'react-native-vision-camera';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { FaceDetectionResult, BoundingBox } from '../types/pipeline';

export interface FaceDetectorState {
  lastDetectionTime: number;
  throttleIntervalMs: number;
  lastResult: FaceDetectionResult | null;
  /** Set when the native detectFaces() call itself threw; null on a clean (even empty) result. */
  lastError: string | null;
}

export function createFaceDetectorState(throttleIntervalMs = 200): FaceDetectorState {
  'worklet';
  return {
    lastDetectionTime: 0,
    throttleIntervalMs,
    lastResult: null,
    lastError: null,
  };
}

export function detectFace(
  frame: Frame,
  timestamp: number,
  detectFaces: (frame: Frame) => Face[],
  state: FaceDetectorState
): FaceDetectionResult | null {
  'worklet';
  if (timestamp - state.lastDetectionTime >= state.throttleIntervalMs) {
    try {
      const faces = detectFaces(frame);
      state.lastError = null;
      if (faces && faces.length > 0) {
        // Inlined rather than a separate worklet function: react-native-worklets-core
        // (required for VisionCamera frame processors) does not reliably capture a
        // sibling top-level function as a closure the way Reanimated's worklets do —
        // calling out to one from here silently resolved to undefined at runtime.
        const face = faces[0];
        const bbox: BoundingBox = {
          x: face.bounds.x,
          y: face.bounds.y,
          width: face.bounds.width,
          height: face.bounds.height,
        };
        state.lastResult = {
          bbox,
          landmarks: [],
          confidence: 1.0,
          yawAngle: face.yawAngle ?? 0,
          rollAngle: face.rollAngle ?? 0,
        };
      } else {
        if (state.lastResult !== null) {
          console.log(`[FaceDetector] Face lost. Frame: ${frame.width}x${frame.height}, format: ${frame.pixelFormat}`);
        }
        state.lastResult = null;
      }
    } catch (e: any) {
      const message = e?.message || String(e);
      state.lastError = message;
      console.log(`[FaceDetector] Error detecting face: ${message}. Frame: ${frame.width}x${frame.height}`);
      state.lastResult = null;
    }
    state.lastDetectionTime = timestamp;
  }
  return state.lastResult;
}

export class FaceDetector {
  constructor() {}
  detect() { return null; }
}
