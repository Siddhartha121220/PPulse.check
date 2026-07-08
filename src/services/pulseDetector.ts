import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrameProcessor, runAtTargetFps } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { MIN_SAMPLES, PulseSignalProcessor, SAMPLING_RATE } from './pulseSignalProcessor';

/**
 * MIT EVM Inspired Pulse Detector
 *
 * 1. Spatial Decomposition: Average the dominant (red-like) channel in the center ROI.
 * 2. Temporal Filtering: Bandpass filter (0.8–3.0 Hz) to isolate the pulse frequency.
 *
 * NOTE: Android cameras with pixelFormat="rgb" sometimes deliver BGR byte order.
 * We use max(byte0, byte2) as "red" — a finger always makes red the brightest
 * channel, so this works correctly for both RGB and BGR orderings.
 */

const ROI_SAMPLE_STRIDE = 8;

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
        const fingerCovered = averageRed > 80 && coveredPixelsRatio > 0.3;

        if (!fingerCovered) {
            missCountRef.current += 1;
            if (missCountRef.current >= 5) {
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
        const qualityScore = clamp(stats.amplitudeScore * 0.6 + coveredPixelsRatio * 0.4, 0, 1);
        const nextQuality: SignalQuality =
            qualityScore > 0.6 ? 'Strong' : qualityScore > 0.35 ? 'Good' : 'Weak';

        setFps(currentFps);
        setConfidence(Math.round(qualityScore * 100));
        setSignalQuality(nextQuality);

        if (stats.sampleCount < MIN_SAMPLES) {
            setBpm(0);
            setStatusText('Hold steady for 2-4 seconds');
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

    const pushSampleToJs = useMemo(() => Worklets.createRunOnJS(updateFromSample), [updateFromSample]);

    const frameProcessor = useFrameProcessor((frame) => {
        'worklet';

        runAtTargetFps(30, () => {
            'worklet';

            const buffer = frame.toArrayBuffer();
            const data = new Uint8Array(buffer);
            const bytesPerPixel = Math.max(3, Math.round(frame.bytesPerRow / Math.max(frame.width, 1)));
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
                    const byte0 = data[index] ?? 0;
                    const byte1 = data[index + 1] ?? 0;  // green in both RGB and BGR
                    const byte2 = data[index + 2] ?? 0;

                    // max(byte0, byte2) is always the red channel —
                    // whether camera delivers RGB (byte0=R) or BGR (byte2=R)
                    const red = byte0 > byte2 ? byte0 : byte2;
                    const green = byte1;

                    redSum += red;
                    greenSum += green;
                    sampleCount += 1;

                    if (red > 80 && red > green) {
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
            const timestampMs = frame.timestamp != null
                ? Math.round(frame.timestamp / 1_000_000)
                : Date.now();

            pushSampleToJs(
                averageGreen,
                timestampMs,
                averageRed,
                averageGreen,
                coveredPixelsRatio,
            );
        });
    }, [pushSampleToJs]);

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
