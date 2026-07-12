import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { useCameraManager } from '../acquisition/CameraManager';
import { usePulsePipeline } from '../hooks/usePulsePipeline';
import { MeasurementRecorder } from '../services/MeasurementRecorder';
import { Activity, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/ui/Button';
import { FaceOverlay } from '../components/overlays/FaceOverlay';
import { MetricsOverlay } from '../components/overlays/MetricsOverlay';
import { SignalChart } from '../components/ui/SignalChart';

export const PulseCheckScreen = () => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const navigation = useNavigation();
    const { state, isReady, frameProcessor, start, stop, getActiveAlgorithms, getSessionDurationSec, configManager } = usePulsePipeline();
    const [isSaving, setIsSaving] = useState(false);
    const recorder = useRef(new MeasurementRecorder()).current;
    
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

    const handleStart = useCallback(() => {
        recorder.startSession();
        start();
    }, [start, recorder]);

    const handleStop = useCallback(async () => {
        const activeAlgos = getActiveAlgorithms();
        const duration = getSessionDurationSec();
        const result = stop();

        if (result && result.bpm > 0) {
            setIsSaving(true);
            try {
                await recorder.record(
                    result,
                    state?.mode || 'standard',
                    activeAlgos,
                    state?.fps || 0,
                    duration,
                    null, // lighting estimate
                    null  // motion estimate
                );
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
    }, [stop, state, navigation, getActiveAlgorithms, getSessionDurationSec, recorder]);

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

                <View
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
                    pointerEvents="box-none"
                >
                    {!isRecording && (
                        <View className="bg-black/60 p-6 rounded-2xl items-center">
                            <Activity size={48} color="#14b8a6" className="mb-4" />
                            <Text className="text-white text-center font-bold text-lg mb-2">Face the camera</Text>
                            <Text className="text-gray-300 text-center text-sm mb-6">Ensure your face is well-lit and hold still</Text>
                            {!isReady ? (
                                <ActivityIndicator color="#14b8a6" size="large" />
                            ) : (
                                <Button
                                    title="Start Measurement"
                                    onPress={handleStart}
                                />
                            )}
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
