import React, { useCallback, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useRunOnJS } from 'react-native-worklets-core';
import { detectFace, type FaceDetectionResult } from '../acquisition/faceDetectionPlugin';
import { colors } from '../theme/colors';

/**
 * Phase 2 (REQUIREMENTS.md §7.2) checkpoint: native face-detection plugin wired up, raw
 * values shown in a debug overlay so detection can be verified against real numbers before
 * any coordinate-space transform is written (§5.2) or the signal pipeline is added (Phase 3+).
 */
export const PulseCheckScreen = () => {
  const navigation = useNavigation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  const [debug, setDebug] = useState<FaceDetectionResult | null>(null);
  const [fps, setFps] = useState(0);
  const lastFrameAt = useRef(0);

  const onResult = useCallback((result: FaceDetectionResult | null) => {
    const now = Date.now();
    const last = lastFrameAt.current;
    if (last > 0) setFps(Math.round(1000 / (now - last)));
    lastFrameAt.current = now;
    setDebug(result);
  }, []);

  const onResultJS = useRunOnJS(onResult, [onResult]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const result = detectFace(frame);
      onResultJS(result);
    },
    [onResultJS]
  );

  React.useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row justify-end p-4 pt-6 z-10">
        <X size={24} color={colors.textOnDark} onPress={() => navigation.goBack()} />
      </View>

      {!hasPermission && (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-textOnDark text-center">
            Camera permission is required to take a pulse reading.
          </Text>
        </View>
      )}

      {hasPermission && device == null && (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-textOnDark text-center">No front camera found on this device.</Text>
        </View>
      )}

      {hasPermission && device != null && (
        <View className="flex-1">
          <Camera
            style={{ flex: 1 }}
            device={device}
            isActive={true}
            resizeMode="cover"
            frameProcessor={frameProcessor}
          />

          {/* Static alignment guide — helps the user frame their face before/during a reading. */}
          <View className="absolute inset-0 items-center justify-center">
            <View
              className="border-2 rounded-full"
              style={{
                width: 220,
                height: 280,
                borderColor: debug?.faceDetected ? colors.accent : colors.textOnDark + '80',
              }}
            />
          </View>

          {/* Dev debug overlay (REQUIREMENTS.md §6) — raw values, no Metro/logcat dependency. */}
          <View className="absolute bottom-6 left-4 right-4 bg-surfaceDark/90 rounded-2xl p-3">
            <Text className="text-textOnDark text-xs font-bold">DEBUG</Text>
            <Text className="text-textOnDark/80 text-xs">FPS: {fps}</Text>
            <Text className="text-textOnDark/80 text-xs">
              Face detected: {String(debug?.faceDetected ?? false)}
            </Text>
            <Text className="text-textOnDark/80 text-xs">
              Frame: {debug?.frameWidth ?? '-'}x{debug?.frameHeight ?? '-'}
            </Text>
            <Text className="text-textOnDark/80 text-xs">
              BBox: {debug?.boundingBox ? JSON.stringify(debug.boundingBox) : '-'}
            </Text>
            {debug?.error && <Text className="text-danger text-xs">Error: {debug.error}</Text>}
          </View>
        </View>
      )}
    </View>
  );
};
