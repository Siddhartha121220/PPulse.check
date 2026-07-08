import { isSkinPixel } from '../utils/colorSpace';
import type { ROIPatch } from '../types/pipeline';

export function segmentSkin(patch: ROIPatch): { patch: ROIPatch; coveredRatio: number } {
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

export class SkinSegmenter {
  segment(patch: ROIPatch) { return { patch, coveredRatio: 0 }; }
}
