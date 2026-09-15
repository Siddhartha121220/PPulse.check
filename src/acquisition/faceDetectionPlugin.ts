import { VisionCameraProxy } from 'react-native-vision-camera';

/**
 * Module-level singleton — initialized once, not per-render/per-hook-call. v1's bug was a
 * face-detector plugin re-created on every render (see REQUIREMENTS.md §5.3), which tore down
 * and reinstalled the native plugin mid-session. Native `detectFace` is registered in
 * FaceDetectionFrameProcessorPlugin.kt.
 */
const plugin = VisionCameraProxy.initFrameProcessorPlugin('detectFace', {});

export interface FaceDetectionResult {
  faceDetected: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  frameWidth?: number;
  frameHeight?: number;
  error?: string;
}

export function detectFace(frame: any): FaceDetectionResult | null {
  'worklet';
  if (plugin == null) {
    throw new Error('detectFace plugin not registered — check FaceDetectionFrameProcessorPlugin.kt is linked');
  }
  return plugin.call(frame) as unknown as FaceDetectionResult | null;
}
