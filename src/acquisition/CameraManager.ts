import { useCameraDevice, useCameraFormat, CameraDevice, CameraDeviceFormat } from 'react-native-vision-camera';

/**
 * Custom hook to manage camera selection and format configuration.
 *
 * @param position - 'front' or 'back' camera
 * @param targetFps - Desired frame rate (e.g., 30)
 * @returns { device, format } for the Camera component
 */
export function useCameraManager(
  position: 'front' | 'back' = 'front',
  targetFps: number = 30
): {
  device: CameraDevice | undefined;
  format: CameraDeviceFormat | undefined;
} {
  // Get the camera device
  const device = useCameraDevice(position);

  // rPPG only needs a per-frame SPATIAL AVERAGE over 3 small face regions — it doesn't benefit
  // from fine detail the way object detection or video recording would. 720p (~920k pixels) was
  // the single largest per-frame cost in this pipeline: frame.toArrayBuffer() copies the whole
  // buffer GPU→CPU, then every pixel in the ROI gets walked for skin classification (and, in
  // Enhanced mode, EVM's biquad filtering) — all in interpreted JS on the frame-processor thread.
  // Dropping to VGA (~300k pixels, a ~3x cut) — a resolution long-established as sufficient in
  // published webcam-based rPPG work — is the highest-leverage lag fix available without moving
  // pixel processing into native code.
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: targetFps },
  ]);

  return { device, format };
}
