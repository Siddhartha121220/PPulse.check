import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Activity, Heart, Calendar } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const DashboardScreen = () => {
    const navigation = useNavigation<NavigationProp>();

    return (
        <View className="flex-1 bg-background p-4">
            {/* Header */}
            <View className="flex-row justify-between items-center mt-12 mb-8">
                <View className="flex-row items-center space-x-2">
                    <Heart size={24} color="#14b8a6" fill="#14b8a6" />
                    <Text className="text-white text-2xl font-bold tracking-wider">HeartSense</Text>
                </View>
                <View className="w-8 h-8 rounded-full bg-gray-700" />
            </View>

            <ScrollView className="space-y-6" showsVerticalScrollIndicator={false}>
                {/* Main CTA */}
                <Card className="items-center py-8 border border-gray-800">
                    <View className="bg-gray-800/50 p-6 rounded-full mb-4">
                        <Activity size={48} color="#14b8a6" />
                    </View>
                    <Text className="text-gray-400 text-sm mb-1">Ready for a checkup?</Text>
                    <Text className="text-white text-3xl font-bold mb-6">Start Pulse Check</Text>
                    <Button
                        title="Start Reading"
                        className="w-48"
                        onPress={() => navigation.navigate('PulseCheck')}
                    />
                </Card>

                {/* Recent Stats Summary */}
                <View className="flex-row space-x-4">
                    <Card className="flex-1 border border-gray-800">
                        <Text className="text-gray-500 text-xs uppercase mb-2">Avg BPM</Text>
                        <Text className="text-white text-3xl font-bold">72</Text>
                        <Text className="text-primary text-xs mt-1">Normal Range</Text>
                    </Card>
                    <Card className="flex-1 border border-gray-800">
                        <Text className="text-gray-500 text-xs uppercase mb-2">Last Check</Text>
                        <Text className="text-white text-xl font-bold">2h ago</Text>
                        <Text className="text-gray-500 text-xs mt-1">10:42 AM</Text>
                    </Card>
                </View>

                {/* Recent History Preview */}
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

                    {/* List Items */}
                    {[1, 2, 3].map((item) => (
                        <Card key={item} className="flex-row justify-between items-center mb-3 bg-gray-900/50 border border-gray-800">
                            <View className="flex-row items-center space-x-4">
                                <View className="bg-gray-800 p-2 rounded-full">
                                    <Activity size={16} color="#14b8a6" />
                                </View>
                                <View>
                                    <Text className="text-gray-400 text-xs">Today, 2:45 PM</Text>
                                    <Text className="text-gray-500 text-[10px]">Confidence: 98%</Text>
                                </View>
                            </View>
                            <View className="items-end">
                                <Text className="text-primary text-xl font-bold">68</Text>
                                <Text className="text-gray-600 text-[10px]">BPM</Text>
                            </View>
                        </Card>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};
