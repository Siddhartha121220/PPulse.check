import React from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X, Camera } from 'lucide-react-native';
import { Card } from '../components/ui/Card';
import { colors } from '../theme/colors';

/**
 * Placeholder for Phase 2 (REQUIREMENTS.md §7) — camera capture, native face-detection
 * plugin, and the signal pipeline land here. Phase 1 is UI scaffold only.
 */
export const PulseCheckScreen = () => {
  const navigation = useNavigation();

  return (
    <View className="flex-1 bg-background p-4 pt-6 gap-4">
      <View className="flex-row justify-end">
        <X size={24} color={colors.textOnDark} onPress={() => navigation.goBack()} />
      </View>

      <Card className="flex-1 items-center justify-center gap-3">
        <Camera size={32} color={colors.muted} />
        <Text className="text-textOnSurface font-bold text-lg text-center">
          Camera pipeline not wired up yet
        </Text>
        <Text className="text-textOnSurface/60 text-sm text-center px-4">
          Phase 2 of the rebuild (see REQUIREMENTS.md) adds the native face-detection
          plugin and live BPM measurement here.
        </Text>
      </Card>
    </View>
  );
};
