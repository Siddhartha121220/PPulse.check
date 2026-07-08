import type { Frame } from 'react-native-vision-camera';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { FaceDetectionResult, BoundingBox, FaceLandmark } from '../types/pipeline';

/**
 * Throttled Face Detector
 *
 * Runs ML Kit face detection on camera frames.
 * Designed to be called from a VisionCamera worklet.
 */
export class FaceDetector {
  private lastDetectionTime = 0;
  private throttleIntervalMs: number;
  private lastResult: FaceDetectionResult | null = null;

  constructor(throttleIntervalMs: number = 200) {
    this.throttleIntervalMs = throttleIntervalMs;
  }

  /**
   * Detect faces in a frame, applying a throttle to limit frequency (e.g. 5fps).
   * Returns the cached result if called before the interval has elapsed.
   *
   * MUST be called from a worklet.
   */
  detect(frame: Frame, timestamp: number, detectFaces: (frame: Frame) => Face[]): FaceDetectionResult | null {
    'worklet';

    if (timestamp - this.lastDetectionTime >= this.throttleIntervalMs) {
      try {
        const faces = detectFaces(frame);
        
        if (faces && faces.length > 0) {
          // Process the largest/first face
          const face = faces[0];
          
          this.lastResult = this.mapFaceResult(face);
        } else {
          this.lastResult = null;
        }
      } catch (e) {
        // Handle detection error silently in worklet
        this.lastResult = null;
      }
      this.lastDetectionTime = timestamp;
    }

    return this.lastResult;
  }

  private mapFaceResult(face: Face): FaceDetectionResult {
    'worklet';
    
    // Map bounds
    const bbox: BoundingBox = {
      x: face.bounds.x,
      y: face.bounds.y,
      width: face.bounds.width,
      height: face.bounds.height,
    };

    // Extract relevant landmarks if available
    // react-native-vision-camera-face-detector provides landmarks and contours
    // Contours are usually more detailed for cheeks/forehead mapping
    const landmarks: FaceLandmark[] = [];
    
    // Map contours if available
    if (face.contours) {
      if (face.contours.FACE) {
        face.contours.FACE.forEach((p: any) => {
          landmarks.push({ type: 'FACE_CONTOUR', x: p.x, y: p.y });
        });
      }
      if (face.contours.LEFT_EYEBROW_TOP) {
        face.contours.LEFT_EYEBROW_TOP.forEach((p: any) => {
          landmarks.push({ type: 'LEFT_EYEBROW_TOP', x: p.x, y: p.y });
        });
      }
      if (face.contours.RIGHT_EYEBROW_TOP) {
        face.contours.RIGHT_EYEBROW_TOP.forEach((p: any) => {
          landmarks.push({ type: 'RIGHT_EYEBROW_TOP', x: p.x, y: p.y });
        });
      }
      if (face.contours.LEFT_EYE) {
        face.contours.LEFT_EYE.forEach((p: any) => {
          landmarks.push({ type: 'LEFT_EYE', x: p.x, y: p.y });
        });
      }
      if (face.contours.RIGHT_EYE) {
        face.contours.RIGHT_EYE.forEach((p: any) => {
          landmarks.push({ type: 'RIGHT_EYE', x: p.x, y: p.y });
        });
      }
      if (face.contours.NOSE_BRIDGE) {
        face.contours.NOSE_BRIDGE.forEach((p: any) => {
          landmarks.push({ type: 'NOSE_BRIDGE', x: p.x, y: p.y });
        });
      }
      if (face.contours.NOSE_BOTTOM) {
        face.contours.NOSE_BOTTOM.forEach((p: any) => {
          landmarks.push({ type: 'NOSE_BOTTOM', x: p.x, y: p.y });
        });
      }
      if (face.contours.UPPER_LIP_TOP) {
        face.contours.UPPER_LIP_TOP.forEach((p: any) => {
          landmarks.push({ type: 'UPPER_LIP_TOP', x: p.x, y: p.y });
        });
      }
    }

    return {
      bbox,
      landmarks,
      confidence: 1.0, // Face detector doesn't always provide confidence, assume 1.0 if detected
      yawAngle: face.yawAngle ?? 0,
      rollAngle: face.rollAngle ?? 0,
    };
  }
}
