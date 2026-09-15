import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Line } from 'react-native-svg';

interface AlignmentGuideProps {
  /** Dims the guide once a face is confidently tracked, so it doesn't clutter the view. */
  active: boolean;
}

/**
 * Static oval guide showing where to position your face. Purely visual — doesn't gate or
 * affect the pipeline. Encourages consistent framing (correct distance, forehead visible,
 * centered), which also reduces edge-clipped ROI sub-boxes at the source rather than only
 * handling them defensively in ROIManager.
 */
export const AlignmentGuide: React.FC<AlignmentGuideProps> = ({ active }) => {
  const opacity = active ? 0.25 : 0.6;

  // Proportions tuned for a face held at arm's length in a portrait camera view:
  // centered horizontally, vertically positioned so the top of the oval sits near
  // where a forehead should be, sized to leave the cheeks within frame.
  const cx = '50%';
  const cy = '42%';
  const rx = '32%';
  const ry = '38%';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke={`rgba(94, 234, 212, ${opacity})`}
          strokeWidth="2"
          strokeDasharray="6, 6"
          fill="none"
        />
        {/* Forehead line — near the top of the oval, the region the app actually samples first */}
        <Line
          x1="35%"
          y1="14%"
          x2="65%"
          y2="14%"
          stroke={`rgba(94, 234, 212, ${opacity})`}
          strokeWidth="2"
        />
      </Svg>
    </View>
  );
};
