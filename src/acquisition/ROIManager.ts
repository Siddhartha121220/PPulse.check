import type { Frame } from 'react-native-vision-camera';
import type { SmoothedFace, ROIPatch, BoundingBox } from '../types/pipeline';

export function extractROIs(frame: Frame, face: SmoothedFace): ROIPatch[] {
  'worklet';
  const patches: ROIPatch[] = [];

  const foreheadBox = getForeheadBbox(face.bbox);
  const leftCheekBox = getLeftCheekBbox(face.bbox);
  const rightCheekBox = getRightCheekBbox(face.bbox);

  let buffer: Uint8Array;
  try {
    buffer = new Uint8Array(frame.toArrayBuffer());
  } catch (e) {
    return [];
  }

  // IMPORTANT: Use frame.bytesPerRow (not frame.width * bytesPerPixel).
  // On Android, camera frames have row-stride padding so bytesPerRow >= width * bpp.
  // Using frame.width causes every row to be read from a wrong offset → garbage pixels.
  const bytesPerPixel = frame.pixelFormat === 'rgb' ? 3 : 4;
  const rowStride = frame.bytesPerRow; // correct stride including any padding

  patches.push(extractPatch(buffer, frame.width, frame.height, rowStride, bytesPerPixel, foreheadBox, 'forehead'));
  patches.push(extractPatch(buffer, frame.width, frame.height, rowStride, bytesPerPixel, leftCheekBox, 'leftCheek'));
  patches.push(extractPatch(buffer, frame.width, frame.height, rowStride, bytesPerPixel, rightCheekBox, 'rightCheek'));

  return patches;
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
  'worklet';
  const startX = Math.max(0, Math.floor(bbox.x));
  const startY = Math.max(0, Math.floor(bbox.y));
  const endX = Math.min(frameWidth, Math.ceil(bbox.x + bbox.width));
  const endY = Math.min(frameHeight, Math.ceil(bbox.y + bbox.height));
  
  const patchWidth = endX - startX;
  const patchHeight = endY - startY;
  
  const pixels = new Float32Array(patchWidth * patchHeight * 3);
  let destIdx = 0;
  
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      // Use rowStride (bytes per row including padding) not frameWidth * bpp
      const srcIdx = y * rowStride + x * bytesPerPixel;
      const r = buffer[srcIdx] ?? 0;
      const g = buffer[srcIdx + 1] ?? 0;
      const b = buffer[srcIdx + 2] ?? 0;
      
      pixels[destIdx++] = r / 255.0;
      pixels[destIdx++] = g / 255.0;
      pixels[destIdx++] = b / 255.0;
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

function getForeheadBbox(faceBbox: BoundingBox): BoundingBox {
  'worklet';
  return {
    x: faceBbox.x + faceBbox.width * 0.2,
    y: faceBbox.y + faceBbox.height * 0.05,
    width: faceBbox.width * 0.6,
    height: faceBbox.height * 0.15,
  };
}

function getLeftCheekBbox(faceBbox: BoundingBox): BoundingBox {
  'worklet';
  return {
    x: faceBbox.x + faceBbox.width * 0.1,
    y: faceBbox.y + faceBbox.height * 0.5,
    width: faceBbox.width * 0.25,
    height: faceBbox.height * 0.2,
  };
}

function getRightCheekBbox(faceBbox: BoundingBox): BoundingBox {
  'worklet';
  return {
    x: faceBbox.x + faceBbox.width * 0.65,
    y: faceBbox.y + faceBbox.height * 0.5,
    width: faceBbox.width * 0.25,
    height: faceBbox.height * 0.2,
  };
}

export class ROIManager {
  extractROIs() { return []; }
}
