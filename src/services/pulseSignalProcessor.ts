const BUFFER_SIZE = 120;
const MIN_BPM = 48;
const MAX_BPM = 180;
const MIN_SAMPLES = 18;
const SAMPLING_RATE = 12;
const LOW_PASS_HZ = 3.0;
const HIGH_PASS_HZ = 0.8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export { MIN_SAMPLES, SAMPLING_RATE };

function highPassFilter(samples: number[], sampleRate: number, cutoffHz: number): number[] {
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const alpha = rc / (rc + dt);
    const filtered: number[] = [];
    let previousInput = samples[0] ?? 0;
    let previousOutput = 0;

    for (const sample of samples) {
        const output = alpha * (previousOutput + sample - previousInput);
        filtered.push(output);
        previousInput = sample;
        previousOutput = output;
    }

    return filtered;
}

function lowPassFilter(samples: number[], sampleRate: number, cutoffHz: number): number[] {
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const alpha = dt / (rc + dt);
    const filtered: number[] = [];
    let previousOutput = samples[0] ?? 0;
    filtered.push(previousOutput);

    for (let index = 1; index < samples.length; index += 1) {
        const output = previousOutput + alpha * (samples[index] - previousOutput);
        filtered.push(output);
        previousOutput = output;
    }

    return filtered;
}

function bandpassFilter(samples: number[], sampleRate: number): number[] {
    const highPassed = highPassFilter(samples, sampleRate, HIGH_PASS_HZ);
    return lowPassFilter(highPassed, sampleRate, LOW_PASS_HZ);
}

function detectPeaks(signal: number[]): number[] {
    const variance = signal.reduce((sum, value) => sum + value * value, 0) / signal.length;
    const threshold = Math.sqrt(variance) * 0.35;
    const minPeakDistance = Math.round((SAMPLING_RATE * 60) / MAX_BPM);
    const peakIndexes: number[] = [];

    for (let index = 1; index < signal.length - 1; index += 1) {
        const isPeak =
            signal[index] > signal[index - 1] &&
            signal[index] >= signal[index + 1] &&
            signal[index] > threshold;

        if (!isPeak) {
            continue;
        }

        const lastPeak = peakIndexes[peakIndexes.length - 1];
        if (lastPeak != null && index - lastPeak < minPeakDistance) {
            continue;
        }

        peakIndexes.push(index);
    }

    if (peakIndexes.length >= 2) {
        return peakIndexes;
    }

    return [];
}

function bpmFromPeaks(peakIndexes: number[], timestamps: number[]): number {
    const intervalsMs: number[] = [];

    for (let index = 1; index < peakIndexes.length; index += 1) {
        const previousTimestamp = timestamps[peakIndexes[index - 1]];
        const currentTimestamp = timestamps[peakIndexes[index]];

        if (previousTimestamp == null || currentTimestamp == null) {
            continue;
        }

        intervalsMs.push(currentTimestamp - previousTimestamp);
    }

    if (intervalsMs.length === 0) {
        return 0;
    }

    const averageIntervalMs = intervalsMs.reduce((sum, value) => sum + value, 0) / intervalsMs.length;
    if (averageIntervalMs <= 0) {
        return 0;
    }

    return 60000 / averageIntervalMs;
}

function bpmFromAutocorrelation(signal: number[], sampleRate: number): number {
    const minLag = Math.max(2, Math.floor((sampleRate * 60) / MAX_BPM));
    const maxLag = Math.min(signal.length - 1, Math.ceil((sampleRate * 60) / MIN_BPM));

    if (maxLag <= minLag) {
        return 0;
    }

    let bestLag = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let score = 0;

        for (let index = 0; index < signal.length - lag; index += 1) {
            score += signal[index] * signal[index + lag];
        }

        if (score > bestScore) {
            bestScore = score;
            bestLag = lag;
        }
    }

    if (bestLag <= 0 || bestScore <= 0) {
        return 0;
    }

    return (60 * sampleRate) / bestLag;
}

export class PulseSignalProcessor {
    private buffer: number[] = [];
    private timestamps: number[] = [];

    addSample(value: number, timestampMs: number) {
        this.buffer.push(value);
        this.timestamps.push(timestampMs);

        if (this.buffer.length > BUFFER_SIZE) {
            this.buffer.shift();
            this.timestamps.shift();
        }
    }

    reset() {
        this.buffer = [];
        this.timestamps = [];
    }

    getSignalStats() {
        if (this.buffer.length === 0) {
            return { sampleCount: 0, amplitudeScore: 0 };
        }

        const mean = this.buffer.reduce((sum, value) => sum + value, 0) / this.buffer.length;
        const variance =
            this.buffer.reduce((sum, value) => sum + (value - mean) ** 2, 0) / this.buffer.length;
        const stdDev = Math.sqrt(variance);
        const relativeVariation = mean > 0 ? stdDev / mean : 0;
        // Multiplier of 40 means a 2.5% relative variation → score of 1.0 (Strong)
        // Real PPG signals have ~1–4% variation; 25 was too low for many phones
        const amplitudeScore = clamp(relativeVariation * 40, 0, 1);

        return {
            sampleCount: this.buffer.length,
            amplitudeScore,
        };
    }

    getBPM(): number {
        if (this.buffer.length < MIN_SAMPLES) {
            return 0;
        }

        const mean = this.buffer.reduce((sum, value) => sum + value, 0) / this.buffer.length;
        const detrended = this.buffer.map((value) => value - mean);
        const filtered = bandpassFilter(detrended, SAMPLING_RATE);

        const peakIndexes = detectPeaks(filtered);
        const peakBpm = peakIndexes.length >= 2 ? bpmFromPeaks(peakIndexes, this.timestamps) : 0;
        const autocorrBpm = bpmFromAutocorrelation(filtered, SAMPLING_RATE);

        let calculatedBpm = peakBpm;

        if (calculatedBpm <= 0) {
            calculatedBpm = autocorrBpm;
        } else if (autocorrBpm > 0) {
            calculatedBpm = (calculatedBpm + autocorrBpm) / 2;
        }

        if (calculatedBpm < MIN_BPM || calculatedBpm > MAX_BPM) {
            return 0;
        }

        return calculatedBpm;
    }
}
