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

  // Find the best format supporting the target FPS and suitable resolution (e.g., 720p)
  // We want a manageable resolution for real-time processing
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: targetFps },
  ]);

  return { device, format };
}
