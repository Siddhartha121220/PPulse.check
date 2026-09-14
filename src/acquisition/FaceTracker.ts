import type { FaceDetectionResult, SmoothedFace, BoundingBox } from '../types/pipeline';

// Landmark smoothing was removed: face detection runs with contourMode/landmarkMode 'none'
// (see usePulsePipeline.ts), so FaceDetectionResult.landmarks is always empty, and nothing
// downstream (ROIManager, ConfidenceEstimator, FaceOverlay) ever reads SmoothedFace.landmarks
// anyway. It's kept as an always-empty field only to satisfy the SmoothedFace type.

export interface FaceTrackerState {
  alphaBbox: number;
  maxVelocity: number;
  currentBbox: BoundingBox | null;
  velocityX: number;
  velocityY: number;
}

export function createFaceTrackerState(alphaBbox = 0.3, maxVelocity = 5.0): FaceTrackerState {
  'worklet';
  return {
    alphaBbox,
    maxVelocity,
    currentBbox: null,
    velocityX: 0,
    velocityY: 0,
  };
}

export function updateFaceTracker(detection: FaceDetectionResult, state: FaceTrackerState): SmoothedFace {
  'worklet';
  if (!state.currentBbox) {
    state.currentBbox = { ...detection.bbox };
    state.velocityX = 0;
    state.velocityY = 0;
  } else {
    const newX = state.alphaBbox * detection.bbox.x + (1 - state.alphaBbox) * state.currentBbox.x;
    const newY = state.alphaBbox * detection.bbox.y + (1 - state.alphaBbox) * state.currentBbox.y;

    state.velocityX = newX - state.currentBbox.x;
    state.velocityY = newY - state.currentBbox.y;

    state.currentBbox.x = newX;
    state.currentBbox.y = newY;
    state.currentBbox.width = state.alphaBbox * detection.bbox.width + (1 - state.alphaBbox) * state.currentBbox.width;
    state.currentBbox.height = state.alphaBbox * detection.bbox.height + (1 - state.alphaBbox) * state.currentBbox.height;
  }

  const velocityMag = Math.sqrt(state.velocityX * state.velocityX + state.velocityY * state.velocityY);

  return {
    bbox: { ...state.currentBbox },
    landmarks: [],
    velocity: { dx: state.velocityX, dy: state.velocityY },
    isStable: velocityMag <= state.maxVelocity,
  };
}

export function predictFaceTracker(state: FaceTrackerState): SmoothedFace | null {
  'worklet';
  if (!state.currentBbox) return null;
  const velocityMag = Math.sqrt(state.velocityX * state.velocityX + state.velocityY * state.velocityY);
  return {
    bbox: { ...state.currentBbox },
    landmarks: [],
    velocity: { dx: state.velocityX, dy: state.velocityY },
    isStable: velocityMag <= state.maxVelocity,
  };
}

export function resetFaceTrackerState(state: FaceTrackerState): void {
  'worklet';
  state.currentBbox = null;
  state.velocityX = 0;
  state.velocityY = 0;
}

export class FaceTracker {
  constructor() {}
  update() { return null; }
  predict() { return null; }
  reset() {}
}
