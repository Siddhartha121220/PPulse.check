import { PulseSignalProcessor } from '../src/services/pulseSignalProcessor';

describe('PulseSignalProcessor', () => {
    it('calculates bpm from a stable pulse-like waveform', () => {
        const processor = new PulseSignalProcessor();
        const targetBpm = 72;
        const sampleRate = 12;
        const sampleCount = 120;

        for (let index = 0; index < sampleCount; index += 1) {
            const timeSeconds = index / sampleRate;
            const baseline = Math.sin((2 * Math.PI * targetBpm * timeSeconds) / 60);
            const harmonic = 0.18 * Math.sin((4 * Math.PI * targetBpm * timeSeconds) / 60);
            processor.addSample(baseline + harmonic, index * (1000 / sampleRate));
        }

        expect(processor.getBPM()).toBeGreaterThanOrEqual(targetBpm - 2);
        expect(processor.getBPM()).toBeLessThanOrEqual(targetBpm + 2);
    });

    it('returns zero when there are not enough peaks yet', () => {
        const processor = new PulseSignalProcessor();

        for (let index = 0; index < 12; index += 1) {
            processor.addSample(Math.sin(index), index * 80);
        }

        expect(processor.getBPM()).toBe(0);
    });
});
