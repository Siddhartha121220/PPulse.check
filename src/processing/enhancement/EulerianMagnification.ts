import type { IEnhancementPlugin, EnhancementConfig } from '../../types/pipeline';
import { BiquadFilter, butterworthBandpass, BiquadCoefficients } from '../../utils/filters';

/**
 * Eulerian Video Magnification (EVM)
 *
 * Implements the color magnification algorithm from Wu et al., SIGGRAPH 2012.
 * 
 * Pipeline:
 * 1. Spatial decomposition (Gaussian Pyramid)
 * 2. Temporal bandpass filtering on each spatial scale
 * 3. Amplification
 * 4. Reconstruction
 *
 * Designed to process small ROI patches (e.g., 100x80px) in JS.
 */
export class EulerianMagnification implements IEnhancementPlugin {
  readonly id = 'evm';
  readonly name = 'Eulerian Magnification';
  readonly description = 'Amplifies subtle color variations using spatial pyramids and temporal filtering';

  private config!: EnhancementConfig;
  private filters: BiquadFilter[] = [];
  private filterCoeffs!: BiquadCoefficients;
  
  // To avoid reallocating buffers every frame, we could preallocate pyramids,
  // but since ROI size might change slightly, we allocate dynamically if size changes.
  private lastWidth = 0;
  private lastHeight = 0;
  
  // Storage for the temporal filtered pyramid
  private filteredPyramid: Float32Array[] = [];

  initialize(config: EnhancementConfig): void {
    this.config = config;
    this.filterCoeffs = butterworthBandpass(config.frequencyLow, config.frequencyHigh, config.sampleRate);
    this.reset();
  }

  processFrame(roiPixels: Float32Array, width: number, height: number): Float32Array {
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.reallocateBuffers(width, height);
    }

    // 1. Build Gaussian Pyramid
    const pyramid = this.buildGaussianPyramid(roiPixels, width, height, this.config.pyramidLevels);

    // 2 & 3. Temporal Filter and Amplify each level
    // For color magnification, Wu et al. recommend amplifying only the highest levels 
    // (lowest spatial frequencies) to avoid amplifying noise.
    
    let filterIndex = 0;
    
    for (let l = 0; l < this.config.pyramidLevels; l++) {
      const levelData = pyramid[l];
      const filteredData = this.filteredPyramid[l];
      
      // Determine amplification for this level
      // Alpha is reduced for lower levels (higher spatial frequencies)
      let alpha = this.config.amplificationFactor;
      if (l < this.config.pyramidLevels - 1) {
          alpha = 0; // Only amplify the top level for color (simplification for perf)
      }
      
      for (let i = 0; i < levelData.length; i++) {
        // Apply temporal IIR filter
        const filtered = this.filters[filterIndex++].process(levelData[i]);
        
        // Amplify
        filteredData[i] = filtered * alpha;
      }
    }

    // 4. Reconstruct
    // Add the amplified filtered pyramid back to the original image
    // Since we only amplified the top level, we just need to upsample it back and add it.
    
    const reconstructed = new Float32Array(roiPixels.length);
    reconstructed.set(roiPixels);
    
    // Upsample the top level back to original resolution and add
    const topLevel = this.config.pyramidLevels - 1;
    const amplifiedBase = this.filteredPyramid[topLevel];
    
    const scale = 1 << topLevel;
    const wTop = Math.ceil(width / scale);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const topY = Math.floor(y / scale);
        const topX = Math.floor(x / scale);
        
        const srcIdx = (topY * wTop + topX) * 3;
        const dstIdx = (y * width + x) * 3;
        
        reconstructed[dstIdx] += amplifiedBase[srcIdx];
        reconstructed[dstIdx + 1] += amplifiedBase[srcIdx + 1];
        reconstructed[dstIdx + 2] += amplifiedBase[srcIdx + 2];
      }
    }
    
    // Clamp to 0-1
    for (let i = 0; i < reconstructed.length; i++) {
      reconstructed[i] = Math.max(0, Math.min(1, reconstructed[i]));
    }

    return reconstructed;
  }

  private buildGaussianPyramid(pixels: Float32Array, width: number, height: number, levels: number): Float32Array[] {
    const pyramid: Float32Array[] = [pixels];
    let currW = width;
    let currH = height;
    
    for (let l = 1; l < levels; l++) {
      const prevData = pyramid[l - 1];
      const nextW = Math.ceil(currW / 2);
      const nextH = Math.ceil(currH / 2);
      
      const nextData = new Float32Array(nextW * nextH * 3);
      
      // Simple box filter downsampling (2x2 average)
      for (let y = 0; y < nextH; y++) {
        for (let x = 0; x < nextW; x++) {
          const dstIdx = (y * nextW + x) * 3;
          
          let sumR = 0, sumG = 0, sumB = 0;
          let count = 0;
          
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const srcY = y * 2 + dy;
              const srcX = x * 2 + dx;
              
              if (srcY < currH && srcX < currW) {
                const srcIdx = (srcY * currW + srcX) * 3;
                sumR += prevData[srcIdx];
                sumG += prevData[srcIdx + 1];
                sumB += prevData[srcIdx + 2];
                count++;
              }
            }
          }
          
          nextData[dstIdx] = sumR / count;
          nextData[dstIdx + 1] = sumG / count;
          nextData[dstIdx + 2] = sumB / count;
        }
      }
      
      pyramid.push(nextData);
      currW = nextW;
      currH = nextH;
    }
    
    return pyramid;
  }

  private reallocateBuffers(width: number, height: number) {
    this.lastWidth = width;
    this.lastHeight = height;
    this.filteredPyramid = [];
    this.filters = [];
    
    let currW = width;
    let currH = height;
    
    for (let l = 0; l < this.config.pyramidLevels; l++) {
      const size = currW * currH * 3;
      this.filteredPyramid.push(new Float32Array(size));
      
      for (let i = 0; i < size; i++) {
        this.filters.push(new BiquadFilter(this.filterCoeffs));
      }
      
      currW = Math.ceil(currW / 2);
      currH = Math.ceil(currH / 2);
    }
  }

  reset(): void {
    for (const filter of this.filters) {
      filter.reset();
    }
  }

  dispose(): void {
    this.filters = [];
    this.filteredPyramid = [];
    this.lastWidth = 0;
    this.lastHeight = 0;
  }
}
