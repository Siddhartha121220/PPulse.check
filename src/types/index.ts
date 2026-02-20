export interface PulseReading {
    id: string;
    user_id: string;
    created_at: string;
    bpm: number;
    confidence: number;
    signal_quality: 'Weak' | 'Good' | 'Strong';
}

export type RootStackParamList = {
    Dashboard: undefined;
    PulseCheck: undefined;
    History: undefined;
    Login: undefined;
};
