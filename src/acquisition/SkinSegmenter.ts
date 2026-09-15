import type { ROIPatch } from '../types/pipeline';

// rgbToHsv/rgbToYCrCb/isSkinPixel are nested INSIDE segmentSkin rather than imported from a
// shared colorSpace module: react-native-worklets-core compiles each 'worklet'-tagged function
// by re-parsing only that function's own text in isolation, so a call to a function from another
// module resolves as an external closure capture that can silently come back undefined on the
// actual worklet runtime (this broke FaceDetector.ts's mapFaceResult the same way). Nesting keeps
// the whole call graph inside one self-contained function body that gets serialized as a unit —
// do not hoist these back out to a shared module, and do not add 'worklet' to them individually.
export function segmentSkin(patch: ROIPatch): { patch: ROIPatch; coveredRatio: number } {
  'worklet';

  function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
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

  function rgbToYCrCb(r: number, g: number, b: number): { y: number; cr: number; cb: number } {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cr = (r - y) * 0.713 + 0.5;
    const cb = (b - y) * 0.564 + 0.5;
    return { y, cr, cb };
  }

  function isSkinPixel(r: number, g: number, b: number): boolean {
    const hsv = rgbToHsv(r, g, b);
    const hsvSkin =
      hsv.h >= 0 && hsv.h <= 50 &&
      hsv.s >= 0.15 && hsv.s <= 0.75 &&
      hsv.v >= 0.2 && hsv.v <= 0.95;

    if (!hsvSkin) return false;

    const ycrcb = rgbToYCrCb(r, g, b);
    return (
      ycrcb.cr >= 0.527 && ycrcb.cr <= 0.698 &&
      ycrcb.cb >= 0.312 && ycrcb.cb <= 0.527
    );
  }

  const totalPixels = patch.width * patch.height;
  if (totalPixels === 0) {
    // A degenerate (edge-clamped) patch — 0/0 would otherwise be NaN and
    // silently corrupt confidence downstream.
    return { patch, coveredRatio: 0 };
  }

  // coveredRatio only feeds a 15%-weighted confidence sub-score (see ConfidenceEstimator) — it
  // doesn't need every pixel classified. HSV+YCrCb conversion per pixel was one of the more
  // expensive per-frame costs across 3 ROI patches at 30fps; sampling every 4th pixel gives a
  // statistically equivalent ratio for 1/4 the math, and leaves unsampled pixels' real color
  // untouched (closer to the "average over all ROI pixels" intent noted below anyway).
  const STRIDE = 4 * 3; // 4 pixels, 3 channels each
  let sampledPixels = 0;
  let skinPixelCount = 0;
  for (let i = 0; i < patch.pixels.length; i += STRIDE) {
    const r = patch.pixels[i];
    const g = patch.pixels[i + 1];
    const b = patch.pixels[i + 2];
    sampledPixels++;

    if (isSkinPixel(r, g, b)) {
      skinPixelCount++;
    } else {
      patch.pixels[i] = 0;
      patch.pixels[i + 1] = 0;
      patch.pixels[i + 2] = 0;
    }
  }

  return {
    patch,
    coveredRatio: sampledPixels > 0 ? skinPixelCount / sampledPixels : 0,
  };
}

export class SkinSegmenter {
  segment(patch: ROIPatch) { return { patch, coveredRatio: 0 }; }
}
