export interface PulseReading {
    id: string;
    user_id: string;
    created_at: string;
    bpm: number;
    confidence: number;
    signal_quality: 'Weak' | 'Good' | 'Strong';
    mode?: 'standard' | 'enhanced' | 'visualization';
    enhancement_algo?: string;
    extraction_algo?: string;
    processing_algo?: string;
    processing_fps?: number | null;
    lighting_estimate?: number | null;
    motion_estimate?: number | null;
    device_model?: string | null;
    os_version?: string | null;
    duration_seconds?: number | null;
}

export type RootStackParamList = {
    Dashboard: undefined;
    PulseCheck: undefined;
    History: undefined;
    Visualization: undefined;
    Login: undefined;
};
