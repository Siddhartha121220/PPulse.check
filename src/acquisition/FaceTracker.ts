import type { FaceDetectionResult, SmoothedFace, BoundingBox, FaceLandmark } from '../types/pipeline';

export interface FaceTrackerState {
  alphaBbox: number;
  alphaLandmark: number;
  maxVelocity: number;
  currentBbox: BoundingBox | null;
  currentLandmarks: FaceLandmark[] | null;
  velocityX: number;
  velocityY: number;
}

export function createFaceTrackerState(alphaBbox = 0.3, alphaLandmark = 0.3, maxVelocity = 5.0): FaceTrackerState {
  'worklet';
  return {
    alphaBbox,
    alphaLandmark,
    maxVelocity,
    currentBbox: null,
    currentLandmarks: null,
    velocityX: 0,
    velocityY: 0,
  };
}

export function updateFaceTracker(detection: FaceDetectionResult, state: FaceTrackerState): SmoothedFace {
  'worklet';
  if (!state.currentBbox) {
    state.currentBbox = { ...detection.bbox };
    state.currentLandmarks = cloneLandmarks(detection.landmarks);
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

    if (state.currentLandmarks && detection.landmarks.length > 0) {
      if (state.currentLandmarks.length === detection.landmarks.length) {
        for (let i = 0; i < detection.landmarks.length; i++) {
          state.currentLandmarks[i].x = state.alphaLandmark * detection.landmarks[i].x + (1 - state.alphaLandmark) * state.currentLandmarks[i].x;
          state.currentLandmarks[i].y = state.alphaLandmark * detection.landmarks[i].y + (1 - state.alphaLandmark) * state.currentLandmarks[i].y;
        }
      } else {
        state.currentLandmarks = cloneLandmarks(detection.landmarks);
      }
    }
  }

  const velocityMag = Math.sqrt(state.velocityX * state.velocityX + state.velocityY * state.velocityY);

  return {
    bbox: { ...state.currentBbox },
    landmarks: cloneLandmarks(state.currentLandmarks ?? []),
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
    landmarks: cloneLandmarks(state.currentLandmarks ?? []),
    velocity: { dx: state.velocityX, dy: state.velocityY },
    isStable: velocityMag <= state.maxVelocity,
  };
}

export function resetFaceTrackerState(state: FaceTrackerState): void {
  'worklet';
  state.currentBbox = null;
  state.currentLandmarks = null;
  state.velocityX = 0;
  state.velocityY = 0;
}

function cloneLandmarks(landmarks: FaceLandmark[]): FaceLandmark[] {
  'worklet';
  const clone: FaceLandmark[] = [];
  for (let i = 0; i < landmarks.length; i++) {
    clone.push({
      type: landmarks[i].type,
      x: landmarks[i].x,
      y: landmarks[i].y,
    });
  }
  return clone;
}

export class FaceTracker {
  constructor() {}
  update() { return null; }
  predict() { return null; }
  reset() {}
}
