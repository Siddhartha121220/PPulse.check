import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '../../theme/colors';

export interface ModeOption {
  id: string;
  title: string;
  description: string;
  disabled?: boolean;
}

interface ModeSelectorProps {
  options: ModeOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Three full-width horizontal rows, stacked vertically — replaces v1's three narrow
 * side-by-side vertical cards, which were too narrow for their own title text to fit
 * on one line (see REQUIREMENTS.md §4.2). Each row gets the full card width, so a
 * title never wraps.
 */
export const ModeSelector: React.FC<ModeSelectorProps> = ({ options, selectedId, onSelect }) => {
  return (
    <View className="gap-3">
      {options.map((option) => {
        const isSelected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            disabled={option.disabled}
            onPress={() => onSelect(option.id)}
            className={`flex-row items-center justify-between rounded-2xl px-4 py-4 border-2 bg-surfaceDark ${
              isSelected ? 'border-accent' : 'border-transparent'
            }`}
          >
            <View className="flex-1 pr-3">
              <Text
                className={`font-bold text-base ${option.disabled ? 'text-textOnDark/30' : 'text-textOnDark'}`}
              >
                {option.title}
              </Text>
              <Text className={`text-xs mt-0.5 ${option.disabled ? 'text-textOnDark/25' : 'text-textOnDark/60'}`}>
                {option.disabled ? `${option.description} · Coming soon` : option.description}
              </Text>
            </View>
            {isSelected && (
              <View className="w-6 h-6 rounded-full bg-accent items-center justify-center">
                <Check size={16} color={colors.textOnSurface} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};
