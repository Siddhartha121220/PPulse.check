import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect, Circle } from 'react-native-svg';
import type { BoundingBox, ROIPatch } from '../../types/pipeline';

interface FaceOverlayProps {
  bbox: BoundingBox | null;
  roiPatches: ROIPatch[];
  frameWidth: number;
  frameHeight: number;
  viewWidth: number;
  viewHeight: number;
}

/**
 * Renders the detected face bounding box and ROI regions as an SVG overlay.
 * Coordinates are scaled from frame space to view space.
 */
export const FaceOverlay: React.FC<FaceOverlayProps> = ({
  bbox,
  roiPatches,
  frameWidth,
  frameHeight,
  viewWidth,
  viewHeight,
}) => {
  if (!bbox && roiPatches.length === 0) return null;

  // Calculate scale factors mapping frame coordinates to view coordinates
  // Note: This assumes the camera feed is displayed using 'cover' mode and
  // the dimensions are properly mapped. We may need to adjust for aspect ratio cropping.
  const scaleX = viewWidth / frameWidth;
  const scaleY = viewHeight / frameHeight;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        {/* Draw Face Bounding Box */}
        {bbox && (
          <Rect
            x={bbox.x * scaleX}
            y={bbox.y * scaleY}
            width={bbox.width * scaleX}
            height={bbox.height * scaleY}
            stroke="rgba(20, 184, 166, 0.6)" // Teal 500
            strokeWidth="2"
            fill="none"
            rx="8"
          />
        )}

        {/* Draw ROI Patches */}
        {roiPatches.map((patch, index) => {
          const w = patch.width * scaleX;
          const h = patch.height * scaleY;
          const x = (patch.centerX * scaleX) - (w / 2);
          const y = (patch.centerY * scaleY) - (h / 2);

          return (
            <React.Fragment key={patch.region}>
              <Rect
                x={x}
                y={y}
                width={w}
                height={h}
                stroke="rgba(244, 63, 94, 0.8)" // Rose 500
                strokeWidth="1.5"
                strokeDasharray="4, 4"
                fill="rgba(244, 63, 94, 0.1)"
                rx="4"
              />
              <Circle
                cx={patch.centerX * scaleX}
                cy={patch.centerY * scaleY}
                r="3"
                fill="rgba(244, 63, 94, 0.8)"
              />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};
