import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PipelineState } from '../../core/PipelineController';

interface MetricsOverlayProps {
  state: PipelineState;
}

/**
 * HUD overlay displaying real-time pipeline metrics (FPS, Confidence, Quality).
 */
export const MetricsOverlay: React.FC<MetricsOverlayProps> = ({ state }) => {
  if (!state.isRunning) return null;

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'Strong': return '#10b981'; // Emerald 500
      case 'Good': return '#f59e0b'; // Amber 500
      case 'Weak': default: return '#ef4444'; // Red 500
    }
  };

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.metricBox}>
        <Text style={styles.label}>FPS</Text>
        <Text style={[styles.value, state.fps < 15 && styles.warningText]}>
          {state.fps}
        </Text>
      </View>
      
      <View style={styles.metricBox}>
        <Text style={styles.label}>CONF</Text>
        <Text style={[styles.value, { color: getQualityColor(state.signalQuality) }]}>
          {state.confidence}%
        </Text>
      </View>

      <View style={styles.metricBox}>
        <Text style={styles.label}>SQI</Text>
        <Text style={[styles.value, { color: getQualityColor(state.signalQuality) }]}>
          {state.signalQuality}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(9, 9, 11, 0.7)', // Zinc 950 with opacity
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(39, 39, 42, 0.8)', // Zinc 800
  },
  metricBox: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  label: {
    color: '#a1a1aa', // Zinc 400
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  value: {
    color: '#f4f4f5', // Zinc 100
    fontSize: 14,
    fontWeight: '700',
  },
  warningText: {
    color: '#ef4444', // Red 500
  },
});
