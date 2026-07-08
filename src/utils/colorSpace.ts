/**
 * Color Space Conversions
 *
 * Utilities for converting between RGB, HSV, and YCrCb color spaces.
 * Used by SkinSegmenter and ROIManager for skin detection.
 *
 * All inputs/outputs use 0–1 normalized floats (not 0–255).
 */

export interface HSV {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export interface YCrCb {
  y: number;  // 0–1
  cr: number; // 0–1
  cb: number; // 0–1
}

export interface RGB {
  r: number; // 0–1
  g: number; // 0–1
  b: number; // 0–1
}

/**
 * Convert normalized RGB (0–1) to HSV.
 */
export function rgbToHsv(r: number, g: number, b: number): HSV {
  'worklet';
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Convert normalized RGB (0–1) to YCrCb.
 * Uses the ITU-R BT.601 standard.
 */
export function rgbToYCrCb(r: number, g: number, b: number): YCrCb {
  'worklet';
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cr = (r - y) * 0.713 + 0.5;
  const cb = (b - y) * 0.564 + 0.5;
  return { y, cr, cb };
}

/**
 * Check if a pixel (normalized RGB 0–1) is likely skin.
 *
 * Uses a combined HSV + YCrCb criterion for robustness
 * across different skin tones and lighting conditions.
 *
 * HSV criterion:
 *   H ∈ [0, 50] (skin hue range)
 *   S ∈ [0.15, 0.75] (excludes very pale or very saturated)
 *   V ∈ [0.2, 0.95] (excludes too dark or blown out)
 *
 * YCrCb criterion:
 *   Cr ∈ [0.527, 0.698] (133–178 in 0–255 scale)
 *   Cb ∈ [0.312, 0.527] (80–135 in 0–255 scale)
 *
 * A pixel is classified as skin if BOTH criteria are met.
 */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  'worklet';
  // HSV check
  const hsv = rgbToHsv(r, g, b);
  const hsvSkin =
    hsv.h >= 0 && hsv.h <= 50 &&
    hsv.s >= 0.15 && hsv.s <= 0.75 &&
    hsv.v >= 0.2 && hsv.v <= 0.95;

  if (!hsvSkin) return false;

  // YCrCb check
  const ycrcb = rgbToYCrCb(r, g, b);
  return (
    ycrcb.cr >= 0.527 && ycrcb.cr <= 0.698 &&
    ycrcb.cb >= 0.312 && ycrcb.cb <= 0.527
  );
}

/**
 * Convert a Uint8Array pixel (0–255) to normalized RGB (0–1).
 */
export function uint8ToNormalizedRGB(
  data: Uint8Array,
  offset: number,
): RGB {
  return {
    r: (data[offset] ?? 0) / 255,
    g: (data[offset + 1] ?? 0) / 255,
    b: (data[offset + 2] ?? 0) / 255,
  };
}
