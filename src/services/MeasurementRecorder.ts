import { saveReading, DEFAULT_USER_ID } from './readingsService';
import { DeviceInfoService } from './DeviceInfoService';
import { PulseReading } from '../types';
import { HeartRateResult, PipelineMode } from '../types/pipeline';

export class MeasurementRecorder {
  private startTime: number = 0;

  startSession(): void {
    this.startTime = Date.now();
  }

  async record(
    result: HeartRateResult,
    mode: PipelineMode,
    algorithms: { enhancement: string; extraction: string; processing: string },
    fps: number,
    durationSeconds: number,
    lightingEstimate: number | null = null,
    motionEstimate: number | null = null
  ): Promise<PulseReading> {
    const reading: Omit<PulseReading, 'id' | 'created_at'> = {
      user_id: DEFAULT_USER_ID,
      bpm: result.bpm,
      confidence: result.confidence * 100, // convert 0-1 to 0-100
      signal_quality: result.signalQuality,
      mode: mode,
      enhancement_algo: algorithms.enhancement,
      extraction_algo: algorithms.extraction,
      processing_algo: algorithms.processing,
      processing_fps: fps,
      lighting_estimate: lightingEstimate,
      motion_estimate: motionEstimate,
      device_model: DeviceInfoService.getDeviceModel(),
      os_version: DeviceInfoService.getOSVersion(),
      duration_seconds: durationSeconds,
    };

    return await saveReading(reading);
  }
}
