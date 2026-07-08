import type { FaceDetectionResult, SmoothedFace, BoundingBox, FaceLandmark } from '../types/pipeline';

/**
 * Face Tracker
 *
 * Applies Exponential Moving Average (EMA) smoothing to face bounding boxes
 * and landmarks to reduce jitter from the face detector.
 * Also computes velocity to determine if the face is stable.
 */
export class FaceTracker {
  private alphaBbox: number;
  private alphaLandmark: number;
  private maxVelocity: number;

  private currentBbox: BoundingBox | null = null;
  private currentLandmarks: FaceLandmark[] | null = null;
  
  private velocityX = 0;
  private velocityY = 0;

  /**
   * @param alphaBbox EMA alpha for bounding box (0-1). Lower is smoother but lags more.
   * @param alphaLandmark EMA alpha for landmarks (0-1).
   * @param maxVelocity Maximum allowed velocity (px/frame) to be considered stable.
   */
  constructor(alphaBbox = 0.3, alphaLandmark = 0.3, maxVelocity = 5.0) {
    this.alphaBbox = alphaBbox;
    this.alphaLandmark = alphaLandmark;
    this.maxVelocity = maxVelocity;
  }

  /**
   * Update the tracker with a new detection result.
   * MUST be called from worklet.
   */
  update(detection: FaceDetectionResult): SmoothedFace {
    'worklet';

    if (!this.currentBbox) {
      // First detection
      this.currentBbox = { ...detection.bbox };
      this.currentLandmarks = this.cloneLandmarks(detection.landmarks);
      this.velocityX = 0;
      this.velocityY = 0;
    } else {
      // Update Bbox with EMA
      const newX = this.alphaBbox * detection.bbox.x + (1 - this.alphaBbox) * this.currentBbox.x;
      const newY = this.alphaBbox * detection.bbox.y + (1 - this.alphaBbox) * this.currentBbox.y;
      
      this.velocityX = newX - this.currentBbox.x;
      this.velocityY = newY - this.currentBbox.y;
      
      this.currentBbox.x = newX;
      this.currentBbox.y = newY;
      this.currentBbox.width = this.alphaBbox * detection.bbox.width + (1 - this.alphaBbox) * this.currentBbox.width;
      this.currentBbox.height = this.alphaBbox * detection.bbox.height + (1 - this.alphaBbox) * this.currentBbox.height;

      // Update Landmarks with EMA
      if (this.currentLandmarks && detection.landmarks.length > 0) {
        // If counts match, update in place
        if (this.currentLandmarks.length === detection.landmarks.length) {
          for (let i = 0; i < detection.landmarks.length; i++) {
            this.currentLandmarks[i].x = this.alphaLandmark * detection.landmarks[i].x + (1 - this.alphaLandmark) * this.currentLandmarks[i].x;
            this.currentLandmarks[i].y = this.alphaLandmark * detection.landmarks[i].y + (1 - this.alphaLandmark) * this.currentLandmarks[i].y;
          }
        } else {
          // Topology changed (unlikely with same detector, but just in case)
          this.currentLandmarks = this.cloneLandmarks(detection.landmarks);
        }
      }
    }

    const velocityMag = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);

    return {
      bbox: { ...this.currentBbox },
      landmarks: this.cloneLandmarks(this.currentLandmarks ?? []),
      velocity: { dx: this.velocityX, dy: this.velocityY },
      isStable: velocityMag <= this.maxVelocity,
    };
  }

  /**
   * Predict the current face position based on previous state + velocity.
   * Useful when detection is skipped in the current frame.
   */
  predict(): SmoothedFace | null {
    'worklet';
    
    if (!this.currentBbox) return null;

    // Optional: apply velocity to predict movement, but for now we'll just return current
    // to avoid overshooting if face stops.
    const velocityMag = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);

    return {
      bbox: { ...this.currentBbox },
      landmarks: this.cloneLandmarks(this.currentLandmarks ?? []),
      velocity: { dx: this.velocityX, dy: this.velocityY },
      isStable: velocityMag <= this.maxVelocity,
    };
  }

  reset(): void {
    'worklet';
    this.currentBbox = null;
    this.currentLandmarks = null;
    this.velocityX = 0;
    this.velocityY = 0;
  }

  private cloneLandmarks(landmarks: FaceLandmark[]): FaceLandmark[] {
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
}
