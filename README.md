# PPulse Research Platform

A high-performance, open-source React Native application for contactless physiological monitoring (rPPG). 

This project implements state-of-the-art Eulerian Video Magnification (EVM) alongside Plane-Orthogonal-to-Skin (POS) signal extraction to estimate heart rate using only a smartphone camera.

## Research Objectives
This platform is designed to evaluate the following research hypothesis:
> **H₁**: Eulerian Video Magnification pre-processing of facial skin ROI patches improves the accuracy of POS-based smartphone rPPG heart rate estimation compared to POS alone.

## Architecture

The system is built on a high-speed, zero-bridge-crossing architecture:
- **Acquisition**: `react-native-vision-camera` + `react-native-worklets-core`
- **Face Tracking**: Google ML Kit via `react-native-vision-camera-face-detector`
- **Processing Engine**: A purely synchronous, `Float32Array`-based pipeline running directly on the JavaScript UI thread to maintain a strict 30 FPS budget.

### Pipeline Stages
1. **ROI Extraction**: Face bounding boxes are tracked with an Exponential Moving Average (EMA). Forehead and cheek ROIs are isolated and filtered for skin-tone using YCrCb/HSV thresholds.
2. **Enhancement (EVM)**: Subtle color variations in the skin are amplified using a 4-level Gaussian spatial pyramid and a temporal Butterworth bandpass filter (0.7 - 3.0 Hz).
3. **Signal Extraction (POS)**: The amplified RGB signals are projected orthogonally to the skin-tone plane to remove specular reflection and motion artifacts.
4. **Frequency Analysis**: A Radix-2 Cooley-Tukey FFT calculates the Power Spectral Density (PSD) to locate the dominant frequency.
5. **Quality Estimation**: Signal-to-Noise Ratio (SNR) and time-domain heuristics (Zero-Crossing Rate, Skewness) define a Confidence Score (0-100%).

## Setup and Installation

### 1. Database Configuration
This project uses Supabase to securely store reading metadata for offline analysis.
Run the provided SQL migrations in your Supabase SQL Editor:
- `supabase/readings.sql`
- `supabase/migration_002_pipeline_metadata.sql`

Configure your environment variables in `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Running the App
**Note**: rPPG algorithms require a physical camera. Emulators will not work.

**Android:**
```bash
npm run android
```

**iOS:**
```bash
cd ios && pod install && cd ..
npm run ios
```

## Application Modes
- **Standard Mode**: Runs the POS and FFT pipeline. Robust for standard heart rate tracking.
- **Enhanced Mode**: Pre-processes the camera feed with EVM before running POS. Designed for research comparisons.
- **Visualization Mode**: Applies EVM directly to the camera preview. Visually amplifies the user's pulse in real time.

## License
MIT
