import { isSkinPixel } from '../utils/colorSpace';
import type { ROIPatch } from '../types/pipeline';

/**
 * Skin Segmenter
 *
 * Applies a skin-tone mask to an ROI patch, zeroing out pixels
 * that don't match the skin color profile.
 *
 * Designed to run in a VisionCamera worklet.
 */
export class SkinSegmenter {
  
  /**
   * Segment the patch in-place.
   * Modifies the patch.pixels array directly to save memory.
   * Returns a reference to the modified patch, along with the skin coverage ratio.
   *
   * MUST be called from a worklet.
   */
  segment(patch: ROIPatch): { patch: ROIPatch; coveredRatio: number } {
    'worklet';
    
    let skinPixelCount = 0;
    const totalPixels = patch.width * patch.height;
    
    for (let i = 0; i < patch.pixels.length; i += 3) {
      const r = patch.pixels[i];
      const g = patch.pixels[i + 1];
      const b = patch.pixels[i + 2];
      
      if (isSkinPixel(r, g, b)) {
        skinPixelCount++;
      } else {
        // Zero out non-skin pixels
        patch.pixels[i] = 0;
        patch.pixels[i + 1] = 0;
        patch.pixels[i + 2] = 0;
      }
    }
    
    return {
      patch,
      coveredRatio: skinPixelCount / totalPixels,
    };
  }
}
