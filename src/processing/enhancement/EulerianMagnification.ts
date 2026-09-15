import type { IEnhancementPlugin, EnhancementConfig } from '../../types/pipeline';
import type { BiquadCoefficients, BiquadFilterState } from '../../utils/filters';

// The biquad/pyramid helpers below are deliberately duplicated as NESTED functions inside
// each entry point (createEVMState/processEVMFrame) rather than imported from utils/filters.ts
// or shared as top-level siblings in this file: react-native-worklets-core compiles each
// 'worklet'-tagged function by re-parsing only that function's own text in isolation, so a call
// to a function from another module — or another top-level function in this same module —
// resolves as an external closure capture that can silently come back undefined on the actual
// worklet runtime (this broke FaceDetector.ts's mapFaceResult the same way). Only type-only
// imports are safe here, since types are erased before the worklet transform runs.

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

  function butterworthBandpass(lowCutHz: number, highCutHz: number, sampleRate: number): BiquadCoefficients {
    const f0 = Math.sqrt(lowCutHz * highCutHz);
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const Q = f0 / (highCutHz - lowCutHz);
    const alpha = Math.sin(w0) / (2 * Q);

    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * Math.cos(w0);
    const a2 = 1 - alpha;

    return {
      b: [b0 / a0, b1 / a0, b2 / a0],
      a: [1, a1 / a0, a2 / a0],
    };
  }

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
    state.filters[i].z1 = 0;
    state.filters[i].z2 = 0;
  }
}

export function processEVMFrame(state: EVMState, roiPixels: Float32Array, width: number, height: number): Float32Array {
  'worklet';

  function createBiquadFilterState(coeffs: BiquadCoefficients): BiquadFilterState {
    return {
      b0: coeffs.b[0],
      b1: coeffs.b[1],
      b2: coeffs.b[2],
      a1: coeffs.a[1],
      a2: coeffs.a[2],
      z1: 0,
      z2: 0,
    };
  }

  function processBiquadFilter(filterState: BiquadFilterState, input: number): number {
    const output = filterState.b0 * input + filterState.z1;
    filterState.z1 = filterState.b1 * input - filterState.a1 * output + filterState.z2;
    filterState.z2 = filterState.b2 * input - filterState.a2 * output;
    return output;
  }

  function reallocateBuffers(evmState: EVMState, w: number, h: number): void {
    evmState.lastWidth = w;
    evmState.lastHeight = h;
    evmState.filteredPyramid = [];
    evmState.filters = [];

    let currW = w;
    let currH = h;

    for (let l = 0; l < evmState.config.pyramidLevels; l++) {
      const size = currW * currH * 3;
      evmState.filteredPyramid.push(new Float32Array(size));

      for (let i = 0; i < size; i++) {
        evmState.filters.push(createBiquadFilterState(evmState.filterCoeffs));
      }

      currW = Math.ceil(currW / 2);
      currH = Math.ceil(currH / 2);
    }
  }

  function buildGaussianPyramid(pixels: Float32Array, w: number, h: number, levels: number): Float32Array[] {
    const pyramid: Float32Array[] = [pixels];
    let currW = w;
    let currH = h;

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

  if (width !== state.lastWidth || height !== state.lastHeight) {
    reallocateBuffers(state, width, height);
  }

  const pyramid = buildGaussianPyramid(roiPixels, width, height, state.config.pyramidLevels);

  // Self-heal: state.filteredPyramid[l] and state.filters must be sized to exactly match
  // this pyramid, but reallocateBuffers and buildGaussianPyramid compute those sizes
  // independently, and this proved to drift apart in practice (crashed on-device) — likely
  // from one shared EVMState being reallocated across 3 differently-sized ROI patches
  // (forehead/leftCheek/rightCheek) every frame. Comparing array LENGTHS of the outer
  // pyramid arrays doesn't catch this: both are always exactly pyramidLevels regardless of
  // whether the reallocation actually matches the current patch. Validate per-level size
  // against the pyramid we actually have (ground truth) instead.
  let needsRealloc = state.filteredPyramid.length !== pyramid.length;
  if (!needsRealloc) {
    for (let l = 0; l < pyramid.length; l++) {
      if (state.filteredPyramid[l]?.length !== pyramid[l].length) {
        needsRealloc = true;
        break;
      }
    }
  }
  if (needsRealloc) {
    console.log(`[EVM] Reallocating (size drift): pyramid=[${pyramid.map(p => p.length).join(',')}] filteredPyramid=[${state.filteredPyramid.map(p => p?.length).join(',')}] w=${width} h=${height} lastW=${state.lastWidth} lastH=${state.lastHeight}`);
    reallocateBuffers(state, width, height);
  }

  let filterIndex = 0;

  for (let l = 0; l < pyramid.length; l++) {
    const levelData = pyramid[l];
    const filteredData = state.filteredPyramid[l];
    // Should be unreachable after the self-heal above, but a missing/undersized level
    // must never crash a live camera session.
    if (!filteredData) continue;

    let alpha = state.config.amplificationFactor;
    if (l < pyramid.length - 1) {
        alpha = 0;
    }

    for (let i = 0; i < levelData.length && i < filteredData.length; i++) {
      const filterState = state.filters[filterIndex++];
      filteredData[i] = filterState ? processBiquadFilter(filterState, levelData[i]) * alpha : 0;
    }
  }

  const reconstructed = new Float32Array(roiPixels.length);
  reconstructed.set(roiPixels);

  const topLevel = pyramid.length - 1;
  const amplifiedBase = state.filteredPyramid[topLevel];

  if (amplifiedBase && amplifiedBase.length > 0) {
    const scale = 1 << topLevel;
    const wTop = Math.ceil(width / scale);
    const hTop = Math.ceil(height / scale);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const topY = Math.min(hTop - 1, Math.floor(y / scale));
        const topX = Math.min(wTop - 1, Math.floor(x / scale));

        const srcIdx = (topY * wTop + topX) * 3;
        const dstIdx = (y * width + x) * 3;

        if (srcIdx + 2 < amplifiedBase.length) {
          reconstructed[dstIdx] += amplifiedBase[srcIdx];
          reconstructed[dstIdx + 1] += amplifiedBase[srcIdx + 1];
          reconstructed[dstIdx + 2] += amplifiedBase[srcIdx + 2];
        }
      }
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
