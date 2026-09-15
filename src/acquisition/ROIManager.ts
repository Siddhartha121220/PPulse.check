import type { Frame } from 'react-native-vision-camera';
import type { SmoothedFace, ROIPatch, BoundingBox } from '../types/pipeline';

// getForeheadBbox/getLeftCheekBbox/getRightCheekBbox/extractPatch are nested INSIDE
// extractROIs (rather than separate top-level functions) deliberately: react-native-worklets-core
// compiles each 'worklet'-tagged function by re-parsing only that function's own text in
// isolation, so a reference to a sibling top-level function (even one also marked 'worklet')
// resolves as an external closure capture that can silently come back undefined on the actual
// worklet runtime (this broke FaceDetector.ts's mapFaceResult the same way). Nesting keeps the
// whole call graph inside one self-contained function body that gets serialized as a unit — do
// not hoist these back out to module scope, and do not add 'worklet' to them individually.
export function extractROIs(frame: Frame, face: SmoothedFace): ROIPatch[] {
  'worklet';

  function getForeheadBbox(faceBbox: BoundingBox): BoundingBox {
    return {
      x: faceBbox.x + faceBbox.width * 0.2,
      y: faceBbox.y + faceBbox.height * 0.05,
      width: faceBbox.width * 0.6,
      height: faceBbox.height * 0.15,
    };
  }

  function getLeftCheekBbox(faceBbox: BoundingBox): BoundingBox {
    return {
      x: faceBbox.x + faceBbox.width * 0.1,
      y: faceBbox.y + faceBbox.height * 0.5,
      width: faceBbox.width * 0.25,
      height: faceBbox.height * 0.2,
    };
  }

  function getRightCheekBbox(faceBbox: BoundingBox): BoundingBox {
    return {
      x: faceBbox.x + faceBbox.width * 0.65,
      y: faceBbox.y + faceBbox.height * 0.5,
      width: faceBbox.width * 0.25,
      height: faceBbox.height * 0.2,
    };
  }

  function extractPatch(
    buffer: Uint8Array,
    frameWidth: number,
    frameHeight: number,
    rowStride: number,
    bytesPerPixel: number,
    bbox: BoundingBox,
    region: 'forehead' | 'leftCheek' | 'rightCheek'
  ): ROIPatch {
    // Clamp into [0, frameWidth]/[0, frameHeight] — a percentage-offset sub-box
    // (forehead/cheek, derived from the face bbox) can extend past the frame edge
    // when the face is large/close or near an edge, and an unclamped start past
    // the frame dimension would make frameWidth/frameHeight - start negative below.
    const startX = Math.min(frameWidth, Math.max(0, Math.floor(bbox.x)));
    const startY = Math.min(frameHeight, Math.max(0, Math.floor(bbox.y)));
    const rawEndX = Math.min(frameWidth, Math.max(startX, Math.ceil(bbox.x + bbox.width)));
    const rawEndY = Math.min(frameHeight, Math.max(startY, Math.ceil(bbox.y + bbox.height)));

    // Quantize dimensions to a 4px grid so a smoothed/jittering face bbox doesn't
    // change patch size every single frame — EVM's per-pixel temporal filters
    // (EulerianMagnification.ts) reset their state whenever width/height changes,
    // so constant ±1px jitter here would otherwise defeat that filtering entirely.
    const QUANT = 4;
    const patchWidth = Math.max(0, Math.min(frameWidth - startX, Math.max(QUANT, Math.round((rawEndX - startX) / QUANT) * QUANT)));
    const patchHeight = Math.max(0, Math.min(frameHeight - startY, Math.max(QUANT, Math.round((rawEndY - startY) / QUANT) * QUANT)));

    const pixels = new Float32Array(patchWidth * patchHeight * 3);
    let destIdx = 0;

    const endX = startX + patchWidth;
    const endY = startY + patchHeight;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const srcIdx = y * rowStride + x * bytesPerPixel;
        // Bounds-check: avoid reading past end of buffer
        if (srcIdx + 2 < buffer.length) {
          pixels[destIdx++] = (buffer[srcIdx])     / 255.0;
          pixels[destIdx++] = (buffer[srcIdx + 1]) / 255.0;
          pixels[destIdx++] = (buffer[srcIdx + 2]) / 255.0;
        } else {
          destIdx += 3; // leave as 0
        }
      }
    }

    return {
      region,
      pixels,
      width: patchWidth,
      height: patchHeight,
      centerX: startX + patchWidth / 2,
      centerY: startY + patchHeight / 2,
    };
  }

  const patches: ROIPatch[] = [];

  // face.bbox is already in the same coordinate space as frame.width/frame.height — confirmed
  // on-device (bbox values fit directly within the frame dimensions with no swap needed). An
  // earlier fix here assumed ML Kit returns rotated-space coordinates and applied a width/height
  // swap "correction" that was actually wrong: it took a correctly-shaped cheek/forehead box and
  // stretched it into a tall, narrow rectangle in the wrong place. No transform needed.
  const foreheadBox = getForeheadBbox(face.bbox);
  const leftCheekBox = getLeftCheekBbox(face.bbox);
  const rightCheekBox = getRightCheekBbox(face.bbox);

  let buffer: Uint8Array;
  try {
    buffer = new Uint8Array(frame.toArrayBuffer());
  } catch (e) {
    return [];
  }

  // VisionCamera's 'rgb' format is actually 32-bit RGBA (4 bytes per pixel).
  const bytesPerPixel = 4;
  // Use frame.bytesPerRow for correct row stride (includes Android row-padding).
  // Fall back to width*bpp if bytesPerRow is 0/undefined (some builds/devices).
  const rowStride = (frame.bytesPerRow > 0)
    ? frame.bytesPerRow
    : frame.width * bytesPerPixel;

  patches.push(extractPatch(buffer, frame.width, frame.height, rowStride, bytesPerPixel, foreheadBox, 'forehead'));
  patches.push(extractPatch(buffer, frame.width, frame.height, rowStride, bytesPerPixel, leftCheekBox, 'leftCheek'));
  patches.push(extractPatch(buffer, frame.width, frame.height, rowStride, bytesPerPixel, rightCheekBox, 'rightCheek'));

  return patches;
}

export class ROIManager {
  extractROIs() { return []; }
}
