import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../components/ui/Card';
import { fetchReadings } from '../services/readingsService';
import { PulseReading } from '../types';

export const HistoryScreen = () => {
    const [readings, setReadings] = useState<PulseReading[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadReadings = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const data = await fetchReadings();
            setReadings(data);
        } catch {
            setError('Could not load history. Check your Supabase connection.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadReadings();
        }, [loadReadings]),
    );

    return (
        <View className="flex-1 bg-background p-4">
            <Text className="text-white text-2xl font-bold mt-12 mb-6">History</Text>

            {isLoading && (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color="#14b8a6" />
                </View>
            )}

            {!isLoading && error && (
                <Card className="bg-gray-900 border border-red-900 p-5">
                    <Text className="text-red-400">{error}</Text>
                </Card>
            )}

            {!isLoading && !error && readings.length === 0 && (
                <Card className="bg-gray-900 border border-gray-800 p-5">
                    <Text className="text-gray-400">No readings yet. Complete a pulse check to see history here.</Text>
                </Card>
            )}

            {!isLoading && !error && readings.length > 0 && (
                <FlatList
                    data={readings}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <Card className="mb-3 bg-gray-900 border border-gray-800 flex-row justify-between items-center p-5">
                            <View>
                                <Text className="text-primary font-bold text-xl">{item.bpm} BPM</Text>
                                <Text className="text-gray-500 text-xs">{new Date(item.created_at).toLocaleString()}</Text>
                            </View>
                            <View className="items-end">
                                <Text className={`text-xs ${item.signal_quality === 'Strong' ? 'text-green-500' : item.signal_quality === 'Good' ? 'text-teal-400' : 'text-yellow-500'}`}>
                                    {item.signal_quality} Signal
                                </Text>
                                <Text className="text-gray-500 text-[10px] mt-1">{item.confidence}% confidence</Text>
                            </View>
                        </Card>
                    )}
                />
            )}
        </View>
    );
};
