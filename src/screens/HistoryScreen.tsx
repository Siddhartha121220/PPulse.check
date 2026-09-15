import React from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Clock } from 'lucide-react-native';
import { Card } from '../components/ui/Card';
import { colors } from '../theme/colors';

export const HistoryScreen = () => {
  const navigation = useNavigation();

  return (
    <View className="flex-1 bg-background p-4 pt-6 gap-4">
      <View className="flex-row items-center gap-2">
        <ChevronLeft size={24} color={colors.textOnDark} onPress={() => navigation.goBack()} />
        <Text className="text-textOnDark text-xl font-extrabold">History</Text>
      </View>

      <Card className="items-center py-10">
        <Clock size={32} color={colors.muted} />
        <Text className="text-textOnSurface font-bold text-base mt-3">No readings yet</Text>
        <Text className="text-textOnSurface/60 text-sm text-center mt-1">
          Completed pulse checks will show up here.
        </Text>
      </Card>
    </View>
  );
};
