const BUFFER_SIZE = 120; // ~10 seconds at 12fps
const MIN_BPM = 48; // 0.8 Hz
const MAX_BPM = 180; // 3.0 Hz
const MIN_SAMPLES = 24;
const SAMPLING_RATE = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export { MIN_SAMPLES, SAMPLING_RATE };

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
            const isPeak =
                smoothed[i] > smoothed[i - 1] &&
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

        const intervalsMs: number[] = [];
        for (let i = 1; i < peakIndexes.length; i++) {
            const previousTimestamp = this.timestamps[peakIndexes[i - 1]];
            const currentTimestamp = this.timestamps[peakIndexes[i]];

            if (previousTimestamp == null || currentTimestamp == null) {
                continue;
            }

            intervalsMs.push(currentTimestamp - previousTimestamp);
        }

        if (intervalsMs.length === 0) return 0;

        const averageIntervalMs = intervalsMs.reduce((sum, value) => sum + value, 0) / intervalsMs.length;
        if (averageIntervalMs <= 0) return 0;

        const calculatedBpm = 60000 / averageIntervalMs;

        if (calculatedBpm < MIN_BPM || calculatedBpm > MAX_BPM) return 0;
        return calculatedBpm;
    }
}
