import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';

interface SignalChartProps {
  data: Float32Array | null;
  frequencies: Float32Array | null;
  width: number;
  height: number;
  color?: string;
  label?: string;
}

/**
 * Simple SVG line chart to visualize the signal spectrum or time-domain waveform.
 */
export const SignalChart: React.FC<SignalChartProps> = ({
  data,
  frequencies,
  width,
  height,
  color = '#14b8a6', // Teal 500
  label,
}) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.emptyText}>Waiting for signal data...</Text>
      </View>
    );
  }

  // Find max for normalization
  let maxVal = -Infinity;
  let minVal = Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  
  if (maxVal === minVal) maxVal = minVal + 1;
  const range = maxVal - minVal;

  // Build SVG path points
  const points: string[] = [];
  const len = data.length;
  
  for (let i = 0; i < len; i++) {
    const x = (i / (len - 1)) * width;
    // Invert Y axis for SVG (0 is top)
    const normalizedY = (data[i] - minVal) / range;
    const y = height - (normalizedY * (height - 10) + 5); // 5px padding
    points.push(`${x},${y}`);
  }

  const pointString = points.join(' ');

  // Optional: Draw dominant frequency marker if this is a spectrum
  let peakFreqX = -1;
  if (frequencies && frequencies.length === data.length) {
    let maxIdx = 0;
    for (let i = 0; i < len; i++) {
      if (data[i] === maxVal) {
        maxIdx = i;
        break;
      }
    }
    peakFreqX = (maxIdx / (len - 1)) * width;
  }

  return (
    <View style={[styles.container, { width, height }]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Svg width={width} height={height}>
        <Polyline
          points={pointString}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {peakFreqX >= 0 && (
          <Line
            x1={peakFreqX}
            y1={0}
            x2={peakFreqX}
            y2={height}
            stroke="rgba(244, 63, 94, 0.5)" // Rose 500
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#09090b', // Zinc 950
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a', // Zinc 800
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#71717a',
    fontSize: 12,
  },
  label: {
    position: 'absolute',
    top: 4,
    left: 8,
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: 'bold',
    zIndex: 10,
  }
});
