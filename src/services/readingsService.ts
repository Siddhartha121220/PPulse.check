import { supabase } from '../lib/supabase';
import { PulseReading } from '../types';

export const DEFAULT_USER_ID = 'local-user';

export async function saveReading(
    reading: Omit<PulseReading, 'id' | 'created_at'>,
): Promise<PulseReading> {
    const { data, error } = await supabase
        .from('readings')
        .insert(reading)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data as PulseReading;
}

export async function fetchReadings(limit = 50): Promise<PulseReading[]> {
    const { data, error } = await supabase
        .from('readings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        throw error;
    }

    return (data ?? []) as PulseReading[];
}

export function computeAverageBpm(readings: PulseReading[]): number | null {
    if (readings.length === 0) {
        return null;
    }

    const total = readings.reduce((sum, reading) => sum + reading.bpm, 0);
    return Math.round(total / readings.length);
}

export function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) {
        return 'Just now';
    }
    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export function formatSessionTime(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) {
        return `Today, ${time}`;
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`;
}
