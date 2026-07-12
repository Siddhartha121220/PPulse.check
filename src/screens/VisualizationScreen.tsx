import React, { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';
import { useCameraManager } from '../acquisition/CameraManager';
import { usePulsePipeline } from '../hooks/usePulsePipeline';
import { X, Activity } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { FaceOverlay } from '../components/overlays/FaceOverlay';

/**
 * Visualization Mode Screen
 *
 * Runs the pipeline in 'visualization' mode (EVM active, extraction/processing off).
 * Focuses on displaying the magnified video stream and Face/ROI overlays.
 */
export const VisualizationScreen = () => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const navigation = useNavigation();
    
    // In a real app with EVM visualization, we might stream the modified pixels
    // back to a Skia canvas. For this milestone, we demonstrate the pipeline
    // is running by showing the ROI tracking and status text.
    
    const { state, isReady, frameProcessor, start, stop, configManager } = usePulsePipeline();
    
    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission, requestPermission]);

    useEffect(() => {
        if (!isReady) return;

        // Force visualization mode for this screen
        configManager.setMode('visualization').then(() => {
            start();
        });

        return () => {
            stop();
            // Restore default mode on exit
            configManager.setMode('standard');
        };
    }, [isReady, configManager, start, stop]);

    // Usually front camera for visualization
    const { device, format } = useCameraManager('front', 30);

    if (!device || !hasPermission || !format) return <View className="flex-1 bg-black" />;

    const isRecording = state?.isRunning ?? false;

    return (
        <View className="flex-1 bg-black">
            <View className="flex-1 overflow-hidden relative">
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
                    <FaceOverlay
                        bbox={state.faceBbox}
                        roiPatches={state.roiPatches}
                        frameWidth={format.videoWidth}
                        frameHeight={format.videoHeight}
                        viewWidth={device.sensorOrientation === 'portrait' ? format.videoHeight : format.videoWidth}
                        viewHeight={device.sensorOrientation === 'portrait' ? format.videoWidth : format.videoHeight}
                    />
                )}

                <View className="absolute top-12 left-4 right-4 flex-row justify-between items-center">
                    <X color="white" onPress={() => navigation.goBack()} />
                    <View className="bg-black/50 px-3 py-1 rounded-full flex-row items-center">
                        <Activity size={14} color="#5eead4" className="mr-2" />
                        <Text className="text-teal-300 text-xs font-bold uppercase tracking-wider">
                            EVM Active
                        </Text>
                    </View>
                </View>
                
                {isRecording && state && (
                    <View className="absolute bottom-12 left-4 right-4 bg-black/70 p-4 rounded-xl border border-gray-800">
                        <Text className="text-white text-center font-bold mb-1">
                            Visualization Mode
                        </Text>
                        <Text className="text-gray-400 text-center text-xs">
                            {state.faceDetected 
                                ? 'Isolating and amplifying subtle skin color variations...' 
                                : 'Position face in frame to begin'}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
};
