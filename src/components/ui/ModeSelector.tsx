import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { PipelineMode } from '../../types/pipeline';

interface ModeSelectorProps {
  currentMode: PipelineMode;
  onModeSelect: (mode: PipelineMode) => void;
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeSelect,
  disabled = false,
}) => {
  const modes: { id: PipelineMode; label: string; description: string }[] = [
    {
      id: 'standard',
      label: 'Standard',
      description: 'Robust POS algorithm',
    },
    {
      id: 'enhanced',
      label: 'Enhanced',
      description: 'EVM pre-processing (Experimental)',
    },
    {
      id: 'visualization',
      label: 'Visualize',
      description: 'See your pulse in real-time',
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Processing Mode</Text>
      <View style={styles.buttonRow}>
        {modes.map((mode) => {
          const isActive = currentMode === mode.id;
          return (
            <TouchableOpacity
              key={mode.id}
              style={[
                styles.button,
                isActive && styles.activeButton,
                disabled && styles.disabledButton,
              ]}
              onPress={() => onModeSelect(mode.id)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Text style={[styles.label, isActive && styles.activeLabel]}>
                {mode.label}
              </Text>
              <Text style={[styles.desc, isActive && styles.activeDesc]}>
                {mode.description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    color: '#a1a1aa', // zinc-400
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#18181b', // zinc-900 (card)
    borderWidth: 1,
    borderColor: '#27272a', // zinc-800
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  activeButton: {
    borderColor: '#14b8a6', // teal-500
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  label: {
    color: '#e4e4e7', // zinc-200
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  activeLabel: {
    color: '#14b8a6', // teal-500
  },
  desc: {
    color: '#71717a', // zinc-500
    fontSize: 12,
    textAlign: 'center',
  },
  activeDesc: {
    color: '#5eead4', // teal-300
  },
});
