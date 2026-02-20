# PPulse Check (HeartSense)

A React Native mobile application that measures heart rate in real-time using the device camera. The app leverages photoplethysmography (PPG) principles inspired by MIT's Eulerian Video Magnification to detect subtle color changes in the skin caused by blood flow.

## Features

- **Camera-Based Pulse Detection** -- Uses the rear camera and flashlight to measure heart rate by analyzing the green channel of the video feed in real-time.
- **Signal Processing Pipeline** -- Implements bandpass filtering (0.8 Hz - 3.0 Hz) with peak detection to isolate the cardiac pulse from raw pixel data.
- **Dashboard** -- Displays average BPM, last check time, and a scrollable history of recent sessions with confidence scores.
- **Session History** -- Browse past readings with timestamps and BPM values, backed by Supabase.
- **Dark Theme UI** -- Teal-accented dark interface styled with NativeWind (TailwindCSS for React Native).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.83 |
| Language | TypeScript |
| Navigation | React Navigation 7 (Native Stack) |
| Styling | NativeWind 4 + TailwindCSS 3 |
| Camera | React Native Vision Camera 4 |
| Animations | React Native Reanimated 4 |
| Backend | Supabase (Auth, Database) |
| Icons | Lucide React Native |

## Project Structure

```
src/
  components/ui/    -- Reusable UI components (Button, Card)
  screens/          -- DashboardScreen, PulseCheckScreen, HistoryScreen
  services/         -- pulseDetector.ts (signal processing logic)
  types/            -- TypeScript type definitions
  lib/              -- Supabase client configuration
```

## Prerequisites

- Node.js >= 20
- React Native development environment ([setup guide](https://reactnative.dev/docs/set-up-your-environment))
- Android Studio with NDK 27+ (for Android builds)
- Xcode 15+ (for iOS builds, macOS only)
- A Supabase project with the required tables

## Getting Started

1. **Clone the repository**

   ```sh
   git clone https://github.com/<your-username>/PPulse.check.git
   cd PPulse.check
   ```

2. **Install dependencies**

   ```sh
   npm install
   ```

3. **Configure environment variables**

   ```sh
   cp .env.example .env
   ```

   Fill in your Supabase project URL and anon key in the `.env` file.

4. **Start Metro bundler**

   ```sh
   npm start
   ```

5. **Run the app**

   ```sh
   # Android
   npm run android

   # iOS (macOS only)
   cd ios && bundle exec pod install && cd ..
   npm run ios
   ```

## How It Works

1. The user places their fingertip over the rear camera lens.
2. The camera captures video frames at ~30 FPS with the flashlight on.
3. Each frame's green channel is spatially averaged over a center ROI (Region of Interest).
4. The time series of averages is detrended and passed through a bandpass filter.
5. Peak detection counts cardiac cycles, and BPM is calculated from the peak frequency.
6. Results are displayed in real-time and saved to Supabase for history tracking.

## License

MIT
