import type { IEnhancementPlugin, EnhancementConfig } from '../../types/pipeline';

/**
 * No Enhancement Plugin
 *
 * A pass-through implementation for Standard Mode.
 * Returns the ROI pixels unchanged.
 */
export class NoEnhancement implements IEnhancementPlugin {
  readonly id = 'none';
  readonly name = 'None';
  readonly description = 'Pass-through processing (Standard Mode)';

  initialize(config: EnhancementConfig): void {
    // No initialization needed
  }

  processFrame(roiPixels: Float32Array, width: number, height: number): Float32Array {
    // Zero-overhead pass-through
    return roiPixels;
  }

  reset(): void {
    // No state to reset
  }

  dispose(): void {
    // No resources to dispose
  }
}
