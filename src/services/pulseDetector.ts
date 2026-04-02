import { useRef, useState, useCallback } from 'react';
import { useFrameProcessor, runAtTargetFps } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';

/**
 * MIT EVM Inspired Pulse Detector
 * 
 * 1. Spatial Decomposition: We take the average of the Green channel (strongest PPG signal)
 *    in the center ROI. This is equivalent to the lowest level of a Laplacian pyramid
 *    (the "DC" component of the spatial frequencies).
 * 
 * 2. Temporal Filtering: We apply a bandpass filter (0.8Hz - 3.0Hz) to the time series 
 *    of these averages to isolate the pulse.
 */

const BUFFER_SIZE = 120; // ~10 seconds at 12fps
const MIN_BPM = 48; // 0.8 Hz
const MAX_BPM = 180; // 3.0 Hz
const SAMPLING_RATE = 12;
const MIN_SAMPLES = 24;
const ROI_SAMPLE_STRIDE = 12;

type SignalQuality = 'Weak' | 'Good' | 'Strong';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const usePulseDetector = () => {
    const [bpm, setBpm] = useState<number>(0);
    const [signalQuality, setSignalQuality] = useState<SignalQuality>('Weak');
    const [confidence, setConfidence] = useState<number>(0);
    const [fps, setFps] = useState<number>(0);
    const [statusText, setStatusText] = useState<string>('Cover the camera and flash fully');
    const processorRef = useRef(new PulseSignalProcessor());
    const sampleTimesRef = useRef<number[]>([]);
    const missCountRef = useRef(0);

    const reset = useCallback(() => {
        processorRef.current.reset();
        sampleTimesRef.current = [];
        missCountRef.current = 0;
        setBpm(0);
        setSignalQuality('Weak');
        setConfidence(0);
        setFps(0);
        setStatusText('Cover the camera and flash fully');
    }, []);

    const updateFromSample = useCallback((sample: number, averageRed: number, averageGreen: number, coveredPixelsRatio: number) => {
        const redDominance = averageRed / Math.max(averageGreen, 1);
        const fingerCovered = averageRed > 120 && redDominance > 1.15 && coveredPixelsRatio > 0.55;

        if (!fingerCovered) {
            missCountRef.current += 1;
            if (missCountRef.current >= 3) {
                processorRef.current.reset();
                sampleTimesRef.current = [];
                setBpm(0);
                setConfidence(0);
                setFps(0);
                setSignalQuality('Weak');
                setStatusText('Cover the lens and flash fully with one finger');
            }
            return;
        }

        missCountRef.current = 0;
        const now = Date.now();
        sampleTimesRef.current.push(now);
        if (sampleTimesRef.current.length > SAMPLING_RATE * 3) {
            sampleTimesRef.current.shift();
        }

        processorRef.current.addSample(sample);
        const currentFps = calculateFps(sampleTimesRef.current);
        const stats = processorRef.current.getSignalStats();
        const nextBpm = processorRef.current.getBPM();
        const qualityScore = clamp(stats.amplitudeScore * 0.7 + coveredPixelsRatio * 0.3, 0, 1);
        const nextQuality: SignalQuality =
            qualityScore > 0.72 ? 'Strong' : qualityScore > 0.45 ? 'Good' : 'Weak';

        setFps(currentFps);
        setConfidence(Math.round(qualityScore * 100));
        setSignalQuality(nextQuality);

        if (stats.sampleCount < MIN_SAMPLES) {
            setBpm(0);
            setStatusText('Hold steady for 3-5 seconds');
            return;
        }

        if (nextBpm > 0) {
            setBpm(Math.round(nextBpm));
            setStatusText('Reading pulse...');
        } else {
            setBpm(0);
            setStatusText('Signal is noisy. Keep your finger still');
        }
    }, []);

    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';

        runAtTargetFps(SAMPLING_RATE, () => {
            'worklet';

            if (frame.pixelFormat !== 'rgb') {
                return;
            }

            const buffer = frame.toArrayBuffer();
            const data = new Uint8Array(buffer);
            const bytesPerPixel = 4;
            const startX = Math.floor(frame.width * 0.3);
            const endX = Math.floor(frame.width * 0.7);
            const startY = Math.floor(frame.height * 0.3);
            const endY = Math.floor(frame.height * 0.7);

            let redSum = 0;
            let greenSum = 0;
            let sampleCount = 0;
            let coveredPixels = 0;

            for (let y = startY; y < endY; y += ROI_SAMPLE_STRIDE) {
                const rowOffset = y * frame.bytesPerRow;
                for (let x = startX; x < endX; x += ROI_SAMPLE_STRIDE) {
                    const index = rowOffset + x * bytesPerPixel;
                    const red = data[index];
                    const green = data[index + 1];

                    redSum += red;
                    greenSum += green;
                    sampleCount += 1;

                    if (red > 120 && red > green) {
                        coveredPixels += 1;
                    }
                }
            }

            if (sampleCount === 0) {
                return;
            }

            const averageRed = redSum / sampleCount;
            const averageGreen = greenSum / sampleCount;
            const coveredPixelsRatio = coveredPixels / sampleCount;
            const normalizedSample = averageGreen / Math.max(averageRed, 1);

            runOnJS(updateFromSample)(normalizedSample, averageRed, averageGreen, coveredPixelsRatio);
        });
    }, [updateFromSample]);

    return { bpm, signalQuality, confidence, fps, statusText, frameProcessor, reset };
};

/**
 * Real-time Signal Processing Class (Logic extracted for readability)
 */
export class PulseSignalProcessor {
    private buffer: number[] = [];

    addSample(value: number) {
        this.buffer.push(value);
        if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();
    }

    reset() {
        this.buffer = [];
    }

    getSignalStats() {
        if (this.buffer.length === 0) {
            return { sampleCount: 0, amplitudeScore: 0 };
        }

        const mean = this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
        const variance =
            this.buffer.reduce((sum, value) => sum + (value - mean) ** 2, 0) / this.buffer.length;
        const stdDev = Math.sqrt(variance);
        const amplitudeScore = clamp(stdDev * 180, 0, 1);

        return {
            sampleCount: this.buffer.length,
            amplitudeScore,
        };
    }

    getBPM(): number {
        if (this.buffer.length < MIN_SAMPLES) return 0;

        const mean = this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
        const acSignal = this.buffer.map(v => v - mean);
        const smoothed = acSignal.map((_, index, samples) => {
            const start = Math.max(0, index - 2);
            const end = Math.min(samples.length - 1, index + 2);
            let total = 0;
            let count = 0;

            for (let i = start; i <= end; i++) {
                total += samples[i];
                count += 1;
            }

            return total / count;
        });

        const variance = smoothed.reduce((sum, value) => sum + value * value, 0) / smoothed.length;
        const threshold = Math.sqrt(variance) * 0.45;
        const minPeakDistance = Math.round((SAMPLING_RATE * 60) / MAX_BPM);
        const peakIndexes: number[] = [];

        for (let i = 1; i < smoothed.length - 1; i++) {
            const isPeak = smoothed[i] > smoothed[i - 1] &&
                smoothed[i] >= smoothed[i + 1] &&
                smoothed[i] > threshold;

            if (!isPeak) {
                continue;
            }

            const lastPeak = peakIndexes[peakIndexes.length - 1];
            if (lastPeak != null && i - lastPeak < minPeakDistance) {
                continue;
            }

            peakIndexes.push(i);
        }

        if (peakIndexes.length < 2) return 0;

        const intervals: number[] = [];
        for (let i = 1; i < peakIndexes.length; i++) {
            intervals.push(peakIndexes[i] - peakIndexes[i - 1]);
        }

        const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
        const calculatedBpm = (SAMPLING_RATE * 60) / averageInterval;

        if (calculatedBpm < MIN_BPM || calculatedBpm > MAX_BPM) return 0;
        return calculatedBpm;
    }
}

const calculateFps = (timestamps: number[]) => {
    if (timestamps.length < 2) {
        return 0;
    }

    const durationMs = timestamps[timestamps.length - 1] - timestamps[0];
    if (durationMs <= 0) {
        return 0;
    }

    return Math.round(((timestamps.length - 1) * 1000) / durationMs);
};
