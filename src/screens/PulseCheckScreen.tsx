import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { usePulseDetector } from '../services/pulseDetector';
import { Activity, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/ui/Button';

export const PulseCheckScreen = () => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('back');
    const navigation = useNavigation();
    const { bpm, signalQuality, confidence, fps, statusText, frameProcessor, reset } = usePulseDetector();
    const [isRecording, setIsRecording] = useState(false);

    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission]);

    if (!device || !hasPermission) return <View className="flex-1 bg-black" />;

    return (
        <View className="flex-1 bg-black">
            {/* Camera Feed */}
            <View className="flex-1 rounded-3xl overflow-hidden m-2 border-2 border-gray-800">
                <Camera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={true}
                    pixelFormat="rgb"
                    fps={30}
                    frameProcessor={isRecording ? frameProcessor : undefined}
                    torch={isRecording ? 'on' : 'off'}
                />

                {/* Overlay Grid/Instructions */}
                <View className="absolute inset-0 items-center justify-center">
                    {!isRecording && (
                        <View className="bg-black/60 p-6 rounded-2xl items-center">
                            <Activity size={48} color="#14b8a6" className="mb-4" />
                            <Text className="text-white text-center font-bold text-lg mb-2">Place finger on camera</Text>
                            <Text className="text-gray-300 text-center text-sm mb-6">Cover both the lens and the flash, then hold still</Text>
                            <Button
                                title="Start Measurement"
                                onPress={() => {
                                    reset();
                                    setIsRecording(true);
                                }}
                            />
                        </View>
                    )}
                </View>
            </View>

            {/* Real-time Stats */}
            {isRecording && (
                <View className="h-1/3 p-4 bg-background rounded-t-3xl border-t border-gray-800">
                    <View className="items-center mb-6">
                        <Text className="text-primary text-6xl font-bold tracking-tighter">{bpm > 0 ? bpm : '--'}</Text>
                        <Text className="text-gray-500 text-sm uppercase tracking-widest">BPM</Text>
                        <Text className="text-gray-500 text-xs mt-1">{statusText}</Text>
                    </View>

                    <View className="flex-row justify-between mx-4">
                        <View className="items-center">
                            <Text className="text-gray-500 text-xs mb-1">Signal</Text>
                            <View className="flex-row items-center space-x-1">
                                <View className={`w-2 h-2 rounded-full ${signalQuality === 'Strong' ? 'bg-green-500' : signalQuality === 'Good' ? 'bg-teal-400' : 'bg-yellow-500'}`} />
                                <Text className="text-white font-bold">{signalQuality}</Text>
                            </View>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-500 text-xs mb-1">Confidence</Text>
                            <Text className="text-white font-bold">{confidence}%</Text>
                        </View>
                        <View className="items-center">
                            <Text className="text-gray-500 text-xs mb-1">FPS</Text>
                            <Text className="text-white font-bold">{fps}</Text>
                        </View>
                    </View>

                    <Button
                        title="Stop"
                        variant="secondary"
                        className="mt-6 bg-red-900"
                        onPress={() => {
                            setIsRecording(false);
                            reset();
                            navigation.goBack();
                        }}
                    />
                </View>
            )}

            {/* Close Button */}
            {!isRecording && (
                <View className="absolute top-12 left-4">
                    <X color="white" onPress={() => navigation.goBack()} />
                </View>
            )}
        </View>
    );
};
