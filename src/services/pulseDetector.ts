import { useRef, useState, useCallback } from 'react';
import { useFrameProcessor, runAtTargetFps } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { MIN_SAMPLES, PulseSignalProcessor, SAMPLING_RATE } from './pulseSignalProcessor';

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

    const updateFromSample = useCallback((
        sample: number,
        timestampMs: number,
        averageRed: number,
        averageGreen: number,
        coveredPixelsRatio: number,
    ) => {
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
        sampleTimesRef.current.push(timestampMs);
        if (sampleTimesRef.current.length > SAMPLING_RATE * 3) {
            sampleTimesRef.current.shift();
        }

        processorRef.current.addSample(sample, timestampMs);
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

            runOnJS(updateFromSample)(
                normalizedSample,
                Date.now(),
                averageRed,
                averageGreen,
                coveredPixelsRatio,
            );
        });
    }, [updateFromSample]);

    return { bpm, signalQuality, confidence, fps, statusText, frameProcessor, reset };
};
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
