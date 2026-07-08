import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Activity, Heart } from 'lucide-react-native';
import {
    computeAverageBpm,
    fetchReadings,
    formatRelativeTime,
    formatSessionTime,
} from '../services/readingsService';
import { ConfigurationManager } from '../core/ConfigurationManager';
import { ModeSelector } from '../components/ui/ModeSelector';
import type { PulseReading, RootStackParamList } from '../types';
import type { PipelineMode } from '../types/pipeline';

const configManager = new ConfigurationManager();

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const DashboardScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const [readings, setReadings] = useState<PulseReading[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentMode, setCurrentMode] = useState<PipelineMode>('standard');

    useEffect(() => {
        configManager.load().then(() => {
            setCurrentMode(configManager.getMode());
        });
    }, []);

    const handleModeSelect = async (mode: PipelineMode) => {
        setCurrentMode(mode);
        await configManager.setMode(mode);
    };

    const loadDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const data = await fetchReadings(20);
            setReadings(data);
        } catch {
            setError('Could not load dashboard data.');
            setReadings([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadDashboardData();
        }, [loadDashboardData]),
    );

    const averageBpm = computeAverageBpm(readings);
    const lastReading = readings[0];
    const recentSessions = readings.slice(0, 3);

    return (
        <View className="flex-1 bg-background p-4">
            <View className="flex-row justify-between items-center mt-12 mb-8">
                <View className="flex-row items-center space-x-2">
                    <Heart size={24} color="#14b8a6" fill="#14b8a6" />
                    <Text className="text-white text-2xl font-bold tracking-wider">HeartSense</Text>
                </View>
                <View className="w-8 h-8 rounded-full bg-gray-700" />
            </View>

            <ScrollView className="space-y-6" showsVerticalScrollIndicator={false}>
                <Card className="items-center py-8 border border-gray-800">
                    <View className="bg-gray-800/50 p-6 rounded-full mb-4">
                        <Activity size={48} color="#14b8a6" />
                    </View>
                    <Text className="text-gray-400 text-sm mb-1">Ready for a checkup?</Text>
                    <Text className="text-white text-3xl font-bold mb-6">Start Pulse Check</Text>
                    
                    <View className="w-full mb-6">
                        <ModeSelector 
                            currentMode={currentMode} 
                            onModeSelect={handleModeSelect} 
                        />
                    </View>

                    <Button
                        title={currentMode === 'visualization' ? 'Start Visualization' : 'Start Reading'}
                        className="w-48"
                        onPress={() => {
                            if (currentMode === 'visualization') {
                                navigation.navigate('Visualization');
                            } else {
                                navigation.navigate('PulseCheck');
                            }
                        }}
                    />
                </Card>

                {isLoading && (
                    <View className="items-center py-8">
                        <ActivityIndicator color="#14b8a6" />
                    </View>
                )}

                {!isLoading && error && (
                    <Card className="border border-red-900 bg-gray-900 p-4">
                        <Text className="text-red-400">{error}</Text>
                    </Card>
                )}

                {!isLoading && !error && (
                    <>
                        <View className="flex-row space-x-4">
                            <Card className="flex-1 border border-gray-800">
                                <Text className="text-gray-500 text-xs uppercase mb-2">Avg BPM</Text>
                                <Text className="text-white text-3xl font-bold">
                                    {averageBpm ?? '--'}
                                </Text>
                                <Text className="text-primary text-xs mt-1">
                                    {readings.length > 0 ? `From ${readings.length} readings` : 'No readings yet'}
                                </Text>
                            </Card>
                            <Card className="flex-1 border border-gray-800">
                                <Text className="text-gray-500 text-xs uppercase mb-2">Last Check</Text>
                                <Text className="text-white text-xl font-bold">
                                    {lastReading ? formatRelativeTime(lastReading.created_at) : '--'}
                                </Text>
                                <Text className="text-gray-500 text-xs mt-1">
                                    {lastReading
                                        ? new Date(lastReading.created_at).toLocaleTimeString([], {
                                              hour: 'numeric',
                                              minute: '2-digit',
                                          })
                                        : 'Start your first check'}
                                </Text>
                            </Card>
                        </View>

                        <View>
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-white font-bold text-lg">Recent Sessions</Text>
                                <Text
                                    className="text-primary text-sm"
                                    onPress={() => navigation.navigate('History')}
                                >
                                    View All
                                </Text>
                            </View>

                            {recentSessions.length === 0 && (
                                <Card className="bg-gray-900/50 border border-gray-800 p-5">
                                    <Text className="text-gray-400">Complete a pulse check to see recent sessions.</Text>
                                </Card>
                            )}

                            {recentSessions.map((item) => (
                                <Card
                                    key={item.id}
                                    className="flex-row justify-between items-center mb-3 bg-gray-900/50 border border-gray-800"
                                >
                                    <View className="flex-row items-center space-x-4">
                                        <View className="bg-gray-800 p-2 rounded-full">
                                            <Activity size={16} color="#14b8a6" />
                                        </View>
                                        <View>
                                            <Text className="text-gray-400 text-xs">
                                                {formatSessionTime(item.created_at)}
                                            </Text>
                                            <Text className="text-gray-500 text-[10px]">
                                                Confidence: {item.confidence}%
                                            </Text>
                                        </View>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-primary text-xl font-bold">{item.bpm}</Text>
                                        <Text className="text-gray-600 text-[10px]">BPM</Text>
                                    </View>
                                </Card>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
};
