import type { Frame } from 'react-native-vision-camera';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { FaceDetectionResult, BoundingBox, FaceLandmark } from '../types/pipeline';

export interface FaceDetectorState {
  lastDetectionTime: number;
  throttleIntervalMs: number;
  lastResult: FaceDetectionResult | null;
}

export function createFaceDetectorState(throttleIntervalMs = 200): FaceDetectorState {
  'worklet';
  return {
    lastDetectionTime: 0,
    throttleIntervalMs,
    lastResult: null,
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
      if (faces && faces.length > 0) {
        state.lastResult = mapFaceResult(faces[0]);
      } else {
        if (state.lastResult !== null) {
          console.log(`[FaceDetector] Face lost. Frame: ${frame.width}x${frame.height}, format: ${frame.pixelFormat}`);
        }
        state.lastResult = null;
      }
    } catch (e: any) {
      console.log(`[FaceDetector] Error detecting face: ${e?.message || e}. Frame: ${frame.width}x${frame.height}`);
      state.lastResult = null;
    }
    state.lastDetectionTime = timestamp;
  }
  return state.lastResult;
}

function mapFaceResult(face: Face): FaceDetectionResult {
  'worklet';
  const bbox: BoundingBox = {
    x: face.bounds.x,
    y: face.bounds.y,
    width: face.bounds.width,
    height: face.bounds.height,
  };

  const landmarks: FaceLandmark[] = [];
  
  if (face.contours) {
    if (face.contours.FACE) {
      face.contours.FACE.forEach((p: any) => landmarks.push({ type: 'FACE_CONTOUR', x: p.x, y: p.y }));
    }
    if (face.contours.LEFT_EYEBROW_TOP) {
      face.contours.LEFT_EYEBROW_TOP.forEach((p: any) => landmarks.push({ type: 'LEFT_EYEBROW_TOP', x: p.x, y: p.y }));
    }
    if (face.contours.RIGHT_EYEBROW_TOP) {
      face.contours.RIGHT_EYEBROW_TOP.forEach((p: any) => landmarks.push({ type: 'RIGHT_EYEBROW_TOP', x: p.x, y: p.y }));
    }
    if (face.contours.LEFT_EYE) {
      face.contours.LEFT_EYE.forEach((p: any) => landmarks.push({ type: 'LEFT_EYE', x: p.x, y: p.y }));
    }
    if (face.contours.RIGHT_EYE) {
      face.contours.RIGHT_EYE.forEach((p: any) => landmarks.push({ type: 'RIGHT_EYE', x: p.x, y: p.y }));
    }
    if (face.contours.NOSE_BRIDGE) {
      face.contours.NOSE_BRIDGE.forEach((p: any) => landmarks.push({ type: 'NOSE_BRIDGE', x: p.x, y: p.y }));
    }
    if (face.contours.NOSE_BOTTOM) {
      face.contours.NOSE_BOTTOM.forEach((p: any) => landmarks.push({ type: 'NOSE_BOTTOM', x: p.x, y: p.y }));
    }
    if (face.contours.UPPER_LIP_TOP) {
      face.contours.UPPER_LIP_TOP.forEach((p: any) => landmarks.push({ type: 'UPPER_LIP_TOP', x: p.x, y: p.y }));
    }
  }

  return {
    bbox,
    landmarks,
    confidence: 1.0,
    yawAngle: face.yawAngle ?? 0,
    rollAngle: face.rollAngle ?? 0,
  };
}

export class FaceDetector {
  constructor() {}
  detect() { return null; }
}
