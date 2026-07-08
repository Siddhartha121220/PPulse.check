/**
 * Performance Monitor
 *
 * Tracks per-stage timing, overall FPS, and dropped frames
 * for the rPPG processing pipeline.
 *
 * Usage:
 *   const perf = new PerformanceMonitor();
 *   perf.startFrame('faceDetection');
 *   // ... do work ...
 *   perf.endFrame('faceDetection');
 *
 *   const report = perf.getReport();
 */

import type { PerformanceReport } from '../types/pipeline';
import { createLogger } from './Logger';

const log = createLogger('PerformanceMonitor');

/** Number of recent frame timings to keep for averaging. */
const HISTORY_SIZE = 60;

/** If frame time exceeds this (ms), count as dropped. */
const DROP_THRESHOLD_MS = 50; // >50ms = <20fps, considered dropped

interface StageHistory {
  timings: Float32Array;
  index: number;
  count: number;
  currentStart: number;
}

export class PerformanceMonitor {
  private stages = new Map<string, StageHistory>();
  private frameTimes: Float32Array;
  private frameIndex = 0;
  private frameCount = 0;
  private lastFrameTimestamp = 0;
  private droppedFrames = 0;
  private totalFrames = 0;

  constructor() {
    this.frameTimes = new Float32Array(HISTORY_SIZE);
  }

  /**
   * Mark the start of processing for a named stage.
   */
  startFrame(stage: string): void {
    let history = this.stages.get(stage);
    if (!history) {
      history = {
        timings: new Float32Array(HISTORY_SIZE),
        index: 0,
        count: 0,
        currentStart: 0,
      };
      this.stages.set(stage, history);
    }
    history.currentStart = performance.now();
  }

  /**
   * Mark the end of processing for a named stage.
   */
  endFrame(stage: string): void {
    const history = this.stages.get(stage);
    if (!history || history.currentStart === 0) return;

    const elapsed = performance.now() - history.currentStart;
    history.timings[history.index] = elapsed;
    history.index = (history.index + 1) % HISTORY_SIZE;
    if (history.count < HISTORY_SIZE) history.count++;
    history.currentStart = 0;
  }

  /**
   * Record a complete frame tick (call once per pipeline iteration).
   * Used to compute overall FPS.
   */
  recordFrameTick(): void {
    const now = performance.now();
    this.totalFrames++;

    if (this.lastFrameTimestamp > 0) {
      const delta = now - this.lastFrameTimestamp;
      this.frameTimes[this.frameIndex] = delta;
      this.frameIndex = (this.frameIndex + 1) % HISTORY_SIZE;
      if (this.frameCount < HISTORY_SIZE) this.frameCount++;

      if (delta > DROP_THRESHOLD_MS) {
        this.droppedFrames++;
      }
    }

    this.lastFrameTimestamp = now;
  }

  /**
   * Get the average FPS computed from recent frame deltas.
   */
  getAverageFps(): number {
    if (this.frameCount === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.frameCount; i++) {
      sum += this.frameTimes[i];
    }
    const avgDelta = sum / this.frameCount;
    return avgDelta > 0 ? 1000 / avgDelta : 0;
  }

  /**
   * Get average timing for each named stage (ms).
   */
  getStageTiming(): Record<string, number> {
    const result: Record<string, number> = {};
    this.stages.forEach((history, name) => {
      if (history.count === 0) {
        result[name] = 0;
        return;
      }
      let sum = 0;
      for (let i = 0; i < history.count; i++) {
        sum += history.timings[i];
      }
      result[name] = sum / history.count;
    });
    return result;
  }

  /**
   * Check if the pipeline is dropping frames.
   * Returns true if >10% of recent frames exceeded the drop threshold.
   */
  isDroppingFrames(): boolean {
    if (this.totalFrames < 10) return false;
    const recentTotal = Math.min(this.totalFrames, HISTORY_SIZE);
    const dropRate = this.droppedFrames / recentTotal;
    return dropRate > 0.1;
  }

  /**
   * Generate a full performance report.
   */
  getReport(): PerformanceReport {
    return {
      averageFps: Math.round(this.getAverageFps() * 10) / 10,
      stageTiming: this.getStageTiming(),
      droppedFrames: this.droppedFrames,
      totalFrames: this.totalFrames,
      peakMemoryMB: 0, // TODO: integrate memory profiling if available
    };
  }

  /**
   * Log the current performance report at INFO level.
   */
  logReport(): void {
    const report = this.getReport();
    log.info('Performance report', {
      fps: report.averageFps,
      dropped: report.droppedFrames,
      total: report.totalFrames,
      stages: report.stageTiming,
    });
  }

  /**
   * Reset all counters and history.
   */
  reset(): void {
    this.stages.clear();
    this.frameTimes.fill(0);
    this.frameIndex = 0;
    this.frameCount = 0;
    this.lastFrameTimestamp = 0;
    this.droppedFrames = 0;
    this.totalFrames = 0;
  }
}
