import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';
import { PulseReading } from '../types';

export const HistoryScreen = () => {
    const [readings, setReadings] = useState<PulseReading[]>([]);

    useEffect(() => {
        const fetchReadings = async () => {
            // Mock data for display until DB is populated
            setReadings([
                { id: '1', bpm: 72, created_at: new Date().toISOString(), signal_quality: 'Strong', confidence: 0.98, user_id: '1' },
                { id: '2', bpm: 68, created_at: new Date(Date.now() - 86400000).toISOString(), signal_quality: 'Good', confidence: 0.92, user_id: '1' },
            ]);

            // Real fetching logic:
            // const { data } = await supabase.from('readings').select('*').order('created_at', { ascending: false });
            // if (data) setReadings(data);
        };
        fetchReadings();
    }, []);

    return (
        <View className="flex-1 bg-background p-4">
            <Text className="text-white text-2xl font-bold mt-12 mb-6">History</Text>
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
                            <Text className={`text-xs ${item.signal_quality === 'Strong' ? 'text-green-500' : 'text-yellow-500'}`}>
                                {item.signal_quality} Signal
                            </Text>
                        </View>
                    </Card>
                )}
            />
        </View>
    );
};
