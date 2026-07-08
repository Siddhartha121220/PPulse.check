import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { useCameraManager } from '../acquisition/CameraManager';
import { usePulsePipeline } from '../hooks/usePulsePipeline';
import { DEFAULT_USER_ID, saveReading } from '../services/readingsService';
import { Activity, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/ui/Button';
import { FaceOverlay } from '../components/overlays/FaceOverlay';
import { MetricsOverlay } from '../components/overlays/MetricsOverlay';
import { SignalChart } from '../components/ui/SignalChart';

export const PulseCheckScreen = () => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const navigation = useNavigation();
    const { state, frameProcessor, start, stop, configManager } = usePulsePipeline();
    const [isSaving, setIsSaving] = useState(false);
    
    // Default to front camera for face mode
    const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');

    useEffect(() => {
        if (!hasPermission) requestPermission();
        
        // Load configuration to determine camera
        if (configManager.isLoaded()) {
            setCameraPosition(configManager.getUserConfig().cameraPosition);
        }
    }, [hasPermission, requestPermission, configManager]);

    const { device, format } = useCameraManager(cameraPosition, 30);

    const handleStop = useCallback(async () => {
        const result = stop();

        if (result && result.bpm > 0) {
            setIsSaving(true);
            try {
                await saveReading({
                    user_id: DEFAULT_USER_ID,
                    bpm: result.bpm,
                    confidence: result.confidence * 100, // convert 0-1 to 0-100
                    signal_quality: result.signalQuality,
                    mode: state?.mode,
                    enhancement_algo: configManager.buildPipelineConfig().enhancement.amplificationFactor > 0 ? 'evm' : 'none',
                    extraction_algo: 'pos',
                    processing_algo: 'fft',
                    processing_fps: state?.fps,
                });
            } catch (e) {
                Alert.alert(
                    'Could not save reading',
                    'Your BPM was measured but could not be saved. Check your network or Supabase setup.',
                );
            } finally {
                setIsSaving(false);
            }
        }

        navigation.goBack();
    }, [stop, state, navigation, configManager]);

    if (!device || !hasPermission || !format) return <View className="flex-1 bg-black" />;

    const isRecording = state?.isRunning ?? false;

    return (
        <View className="flex-1 bg-black">
            <View className="flex-1 rounded-3xl overflow-hidden m-2 border-2 border-gray-800 relative">
                <Camera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    format={format}
                    isActive={true}
                    pixelFormat="rgb"
                    fps={30}
                    frameProcessor={isRecording ? frameProcessor : undefined}
                />

                {isRecording && state && (
                    <>
                        <FaceOverlay
                            bbox={state.faceBbox}
                            roiPatches={state.roiPatches}
                            frameWidth={format.videoWidth}
                            frameHeight={format.videoHeight}
                            viewWidth={device.sensorOrientation === 'portrait' ? format.videoHeight : format.videoWidth}
                            viewHeight={device.sensorOrientation === 'portrait' ? format.videoWidth : format.videoHeight}
                        />
                        <MetricsOverlay state={state} />
                    </>
                )}

                <View className="absolute inset-0 items-center justify-center pointer-events-none">
                    {!isRecording && (
                        <View className="bg-black/60 p-6 rounded-2xl items-center pointer-events-auto">
                            <Activity size={48} color="#14b8a6" className="mb-4" />
                            <Text className="text-white text-center font-bold text-lg mb-2">Face the camera</Text>
                            <Text className="text-gray-300 text-center text-sm mb-6">Ensure your face is well-lit and hold still</Text>
                            <Button
                                title="Start Measurement"
                                onPress={start}
                            />
                        </View>
                    )}
                </View>
            </View>

            {isRecording && state && (
                <View className="h-[40%] p-4 bg-background rounded-t-3xl border-t border-gray-800">
                    <View className="items-center mb-4">
                        <Text className="text-primary text-6xl font-bold tracking-tighter">
                            {state.bpm > 0 ? state.bpm : '--'}
                        </Text>
                        <Text className="text-gray-500 text-sm uppercase tracking-widest">BPM</Text>
                        <Text className="text-gray-500 text-xs mt-1">{state.statusText}</Text>
                    </View>

                    <View className="flex-1 w-full px-2 mb-4">
                        <SignalChart 
                            data={state.spectrum} 
                            frequencies={null} // Pass actual frequency axis if needed
                            width={350} 
                            height={80} 
                            label="Power Spectral Density" 
                        />
                    </View>

                    <Button
                        title={isSaving ? 'Saving...' : 'Stop & Save'}
                        variant="secondary"
                        className="mt-2 bg-red-900"
                        disabled={isSaving}
                        onPress={handleStop}
                    />
                </View>
            )}

            {!isRecording && (
                <View className="absolute top-12 left-4">
                    <X color="white" onPress={() => navigation.goBack()} />
                </View>
            )}
        </View>
    );
};
