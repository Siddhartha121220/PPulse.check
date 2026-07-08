import type { IEnhancementPlugin, EnhancementConfig } from '../../types/pipeline';
import { processBiquadFilter, resetBiquadFilter, butterworthBandpass, BiquadCoefficients, createBiquadFilterState, BiquadFilterState } from '../../utils/filters';

export interface EVMState {
  config: EnhancementConfig;
  filterCoeffs: BiquadCoefficients;
  lastWidth: number;
  lastHeight: number;
  filteredPyramid: Float32Array[];
  filters: BiquadFilterState[];
}

export function createEVMState(config: EnhancementConfig): EVMState {
  'worklet';
  return {
    config,
    filterCoeffs: butterworthBandpass(config.frequencyLow, config.frequencyHigh, config.sampleRate),
    lastWidth: 0,
    lastHeight: 0,
    filteredPyramid: [],
    filters: [],
  };
}

export function resetEVMState(state: EVMState): void {
  'worklet';
  for (let i = 0; i < state.filters.length; i++) {
    resetBiquadFilter(state.filters[i]);
  }
}

function reallocateBuffers(state: EVMState, width: number, height: number): void {
  'worklet';
  state.lastWidth = width;
  state.lastHeight = height;
  state.filteredPyramid = [];
  state.filters = [];
  
  let currW = width;
  let currH = height;
  
  for (let l = 0; l < state.config.pyramidLevels; l++) {
    const size = currW * currH * 3;
    state.filteredPyramid.push(new Float32Array(size));
    
    for (let i = 0; i < size; i++) {
      state.filters.push(createBiquadFilterState(state.filterCoeffs));
    }
    
    currW = Math.ceil(currW / 2);
    currH = Math.ceil(currH / 2);
  }
}

function buildGaussianPyramid(pixels: Float32Array, width: number, height: number, levels: number): Float32Array[] {
  'worklet';
  const pyramid: Float32Array[] = [pixels];
  let currW = width;
  let currH = height;
  
  for (let l = 1; l < levels; l++) {
    const prevData = pyramid[l - 1];
    const nextW = Math.ceil(currW / 2);
    const nextH = Math.ceil(currH / 2);
    
    const nextData = new Float32Array(nextW * nextH * 3);
    
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

export function processEVMFrame(state: EVMState, roiPixels: Float32Array, width: number, height: number): Float32Array {
  'worklet';
  if (width !== state.lastWidth || height !== state.lastHeight) {
    reallocateBuffers(state, width, height);
  }

  const pyramid = buildGaussianPyramid(roiPixels, width, height, state.config.pyramidLevels);
  
  let filterIndex = 0;
  
  for (let l = 0; l < state.config.pyramidLevels; l++) {
    const levelData = pyramid[l];
    const filteredData = state.filteredPyramid[l];
    
    let alpha = state.config.amplificationFactor;
    if (l < state.config.pyramidLevels - 1) {
        alpha = 0; 
    }
    
    for (let i = 0; i < levelData.length; i++) {
      const filtered = processBiquadFilter(state.filters[filterIndex++], levelData[i]);
      filteredData[i] = filtered * alpha;
    }
  }

  const reconstructed = new Float32Array(roiPixels.length);
  reconstructed.set(roiPixels);
  
  const topLevel = state.config.pyramidLevels - 1;
  const amplifiedBase = state.filteredPyramid[topLevel];
  
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
  
  for (let i = 0; i < reconstructed.length; i++) {
    reconstructed[i] = Math.max(0, Math.min(1, reconstructed[i]));
  }

  return reconstructed;
}

/**
 * Dummy class implementation to satisfy the AlgorithmManager registry on the JS thread.
 * The actual worklet processing uses the pure functions above.
 */
export class EulerianMagnification implements IEnhancementPlugin {
  readonly id = 'evm';
  readonly name = 'Eulerian Magnification';
  readonly description = 'Amplifies subtle color variations using spatial pyramids and temporal filtering';
  initialize() {}
  processFrame() { return new Float32Array(0); }
  reset() {}
  dispose() {}
}
