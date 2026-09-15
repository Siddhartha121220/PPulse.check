import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Heart, ChevronRight } from 'lucide-react-native';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ModeSelector, ModeOption } from '../components/ui/ModeSelector';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../types/navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MODE_OPTIONS: ModeOption[] = [
  { id: 'standard', title: 'Standard', description: 'Robust POS algorithm' },
  { id: 'enhanced', title: 'Enhanced', description: 'EVM pre-processing', disabled: true },
  { id: 'visualize', title: 'Visualize', description: 'See your pulse in real-time', disabled: true },
];

export const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [selectedMode, setSelectedMode] = useState('standard');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 40, gap: 16 }}
    >
      <View className="flex-row items-center gap-2 px-1">
        <Heart size={24} color={colors.danger} fill={colors.danger} />
        <Text className="text-textOnDark text-2xl font-extrabold">HeartSense</Text>
      </View>

      <Card>
        <Text className="text-textOnSurface/60 text-center text-sm">Ready for a checkup?</Text>
        <Text className="text-textOnSurface text-center text-3xl font-extrabold mt-1 mb-5">
          Start Pulse Check
        </Text>

        <Text className="text-textOnSurface/50 text-xs font-bold uppercase tracking-wider mb-3">
          Processing mode
        </Text>
        <ModeSelector options={MODE_OPTIONS} selectedId={selectedMode} onSelect={setSelectedMode} />

        <Button
          title="Start Reading"
          onPress={() => navigation.navigate('PulseCheck')}
          className="mt-5"
        />
      </Card>

      <Card dark>
        <View className="flex-row items-center justify-between">
          <Text className="text-textOnDark font-bold text-lg">Recent sessions</Text>
          <ChevronRight
            size={20}
            color={colors.textOnDark}
            onPress={() => navigation.navigate('History')}
          />
        </View>
        <Text className="text-textOnDark/50 text-sm mt-2">
          Complete a pulse check to see your history here.
        </Text>
      </Card>
    </ScrollView>
  );
};
