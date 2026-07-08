import type { Frame } from 'react-native-vision-camera';
import type { SmoothedFace, ROIPatch, BoundingBox } from '../types/pipeline';

/**
 * Region of Interest (ROI) Manager
 *
 * Extracts patches of skin pixels from specific facial regions
 * (forehead, left cheek, right cheek) based on face landmarks.
 *
 * Designed to run in a VisionCamera worklet.
 */
export class ROIManager {
  
  /**
   * Extract ROIs from the frame based on the smoothed face.
   * MUST be called from a worklet.
   */
  extractROIs(frame: Frame, face: SmoothedFace): ROIPatch[] {
    'worklet';
    
    // Default to extracting regions relative to the bounding box if landmarks are insufficient.
    // ML Kit contours usually give us what we need, but we need fallbacks.
    const patches: ROIPatch[] = [];

    // Simple geometric fallback if landmarks are sparse
    const foreheadBox = this.getForeheadBbox(face.bbox);
    const leftCheekBox = this.getLeftCheekBbox(face.bbox);
    const rightCheekBox = this.getRightCheekBbox(face.bbox);

    // Get frame pixel data (this is the expensive part in JS)
    // frame.toArrayBuffer() gives us a Uint8Array. 
    // In RGBA format, each pixel is 4 bytes. 
    // Format depends on device/platform. Assuming RGBA (iOS) or BGRA (Android).
    // We should be careful to handle the format, but for now we extract the raw bytes.
    let buffer: Uint8Array;
    try {
      buffer = new Uint8Array(frame.toArrayBuffer());
    } catch (e) {
      // If toArrayBuffer fails (e.g. not supported or disposed), return empty
      return [];
    }

    const bytesPerPixel = frame.pixelFormat === 'rgb' ? 3 : 4; // Assuming rgba/bgra typically

    // Extract patches
    patches.push(this.extractPatch(buffer, frame.width, frame.height, bytesPerPixel, foreheadBox, 'forehead'));
    patches.push(this.extractPatch(buffer, frame.width, frame.height, bytesPerPixel, leftCheekBox, 'leftCheek'));
    patches.push(this.extractPatch(buffer, frame.width, frame.height, bytesPerPixel, rightCheekBox, 'rightCheek'));

    return patches;
  }

  private extractPatch(
    buffer: Uint8Array,
    frameWidth: number,
    frameHeight: number,
    bytesPerPixel: number,
    bbox: BoundingBox,
    region: 'forehead' | 'leftCheek' | 'rightCheek'
  ): ROIPatch {
    'worklet';
    
    // Ensure bounds are within frame
    const startX = Math.max(0, Math.floor(bbox.x));
    const startY = Math.max(0, Math.floor(bbox.y));
    const endX = Math.min(frameWidth, Math.ceil(bbox.x + bbox.width));
    const endY = Math.min(frameHeight, Math.ceil(bbox.y + bbox.height));
    
    const patchWidth = endX - startX;
    const patchHeight = endY - startY;
    
    // Allocate Float32Array for normalized RGB (0-1)
    // Interleaved RGB: R, G, B, R, G, B...
    const pixels = new Float32Array(patchWidth * patchHeight * 3);
    
    let destIdx = 0;
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const srcIdx = (y * frameWidth + x) * bytesPerPixel;
        
        // We assume RGBA or BGRA here. 
        // A common pattern in vision-camera is platform differences.
        // For simplicity, we assume R = srcIdx, G = srcIdx + 1, B = srcIdx + 2.
        // If it's BGRA, we'd need to swap 0 and 2. We can detect this later if needed.
        const r = buffer[srcIdx];
        const g = buffer[srcIdx + 1];
        const b = buffer[srcIdx + 2];
        
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

  private getForeheadBbox(faceBbox: BoundingBox): BoundingBox {
    'worklet';
    return {
      x: faceBbox.x + faceBbox.width * 0.2,
      y: faceBbox.y + faceBbox.height * 0.05,
      width: faceBbox.width * 0.6,
      height: faceBbox.height * 0.15,
    };
  }

  private getLeftCheekBbox(faceBbox: BoundingBox): BoundingBox {
    'worklet';
    return {
      x: faceBbox.x + faceBbox.width * 0.1,
      y: faceBbox.y + faceBbox.height * 0.5,
      width: faceBbox.width * 0.25,
      height: faceBbox.height * 0.2,
    };
  }

  private getRightCheekBbox(faceBbox: BoundingBox): BoundingBox {
    'worklet';
    return {
      x: faceBbox.x + faceBbox.width * 0.65,
      y: faceBbox.y + faceBbox.height * 0.5,
      width: faceBbox.width * 0.25,
      height: faceBbox.height * 0.2,
    };
  }
}
