# PPulse Check — Architecture

Camera-based rPPG (remote photoplethysmography) heart-rate app. React Native + VisionCamera
frame processors on the acquisition side, a hand-rolled DSP stack (no external FFT/DSP lib) on
the processing side, Supabase for reading history.

## ⚠️ Worklet gotcha — read this before touching acquisition/enhancement code

Everything in `src/acquisition/` and `src/processing/enhancement/EulerianMagnification.ts` runs
inside VisionCamera's frame-processor worklet, compiled by `react-native-worklets-core`'s babel
plugin (`node_modules/react-native-worklets-core/src/plugin/index.js`). That plugin compiles each
`'worklet'`-tagged function by **re-parsing only that function's own source text in isolation**,
then closure-captures any identifier it can't resolve within that isolated reparse — including a
call to another top-level function declared elsewhere in the *same file*. Whether that captured
function value survives being shipped to the actual native worklet runtime is where this breaks:
a same-file sibling worklet function call can come back `undefined` at call time on-device, with
no build-time warning (confirmed by hitting exactly this with `FaceDetector.ts`'s old
`mapFaceResult` helper — it type-checked and looked correct, but threw
`mapFaceResult is not a function (it is undefined)` on-device, and only once face detection
started actually succeeding for the first time).

**The fix, applied throughout this codebase**: helper functions needed only by one worklet entry
point are **nested inside it** (a plain nested `function` declaration, no `'worklet'` directive of
its own) rather than kept as separate top-level siblings or imported from another module. A nested
function is part of the same isolated reparse as its enclosing worklet, so it resolves as a normal
local binding — no cross-runtime closure capture involved. See `ROIManager.ts` (`extractROIs`),
`SkinSegmenter.ts` (`segmentSkin`), and `EulerianMagnification.ts` (`createEVMState`,
`processEVMFrame`) for the pattern. `src/utils/colorSpace.ts` was deleted entirely because its
only consumer, `SkinSegmenter.ts`, had to inline its logic for this reason.

Calling an entry-point worklet function *imported from another module* (e.g. `usePulsePipeline.ts`
calling `detectFace` from `FaceDetector.ts`) appears to work fine — the imported module's own
top-level worklet-building code has already fully run by the time the importing module's worklet
captures it, so ordering isn't an issue there the way it is for two siblings in the same file. But
given this already broke once in a way that type-checked cleanly and looked correct, treat any new
cross-function or cross-module call from inside a worklet as unverified until tested on-device —
when in doubt, nest instead.

## Pipeline

```
Frame → FaceDetect → Track → ROI → Enhance(EVM) → Extract(POS) → Buffer → Process(FFT) → HR
```

| Stage | File | Thread |
|---|---|---|
| Frame capture | `src/hooks/usePulsePipeline.ts` (`useFrameProcessor`) | worklet |
| Face detect (ML Kit, throttled 200ms) | `src/acquisition/FaceDetector.ts` | worklet |
| Track/smooth (EMA bbox, velocity) | `src/acquisition/FaceTracker.ts` | worklet |
| ROI extract (forehead + 2 cheeks, raw RGBA→RGB) | `src/acquisition/ROIManager.ts` | worklet |
| Skin coverage ratio | `src/acquisition/SkinSegmenter.ts` | worklet |
| Enhance (EVM, only in `enhanced`/`visualization` mode) | `src/processing/enhancement/EulerianMagnification.ts` | worklet |
| Extract (POS → single BVP sample) | `src/processing/extraction/POSExtractor.ts` | JS (via `useRunOnJS`) |
| Buffer (ring buffer of BVP samples) | `src/processing/SignalBuffer.ts` | JS |
| Process (FFT/PSD → dominant frequency + SNR confidence) | `src/processing/frequency/FFTAnalyzer.ts`, `src/utils/fft.ts` | JS |
| HR + confidence + UI state | `src/core/PipelineController.ts` | JS |

Everything up through the enhance/ROI-averaging step runs inside the VisionCamera worklet
(`usePulsePipeline.ts`); the worklet hands off one `rgbSample`/`face`/`patches` tuple per frame
to JS via `useRunOnJS`, and `PipelineController.onFrameProcessed` does extraction → FFT → HR →
confidence → throttled UI state push (`throttledNotify`, 500ms).

## Plugin registry

`src/core/AlgorithmManager.ts` is a string-keyed registry of enhancement/extraction/processing
plugins; `src/core/ConfigurationManager.ts` persists the user's chosen `PipelineMode`
(`standard` / `enhanced` / `visualization`) to AsyncStorage and maps it to a plugin preset.

Each plugin family has **two representations**:
- The real logic is pure `'worklet'` functions (`createXState`, `processX`, etc.) so it can run
  on the frame-processor thread without class/`this` binding issues (this split exists because
  of prior Babel/worklet crashes — see commits `6c994f9`, `afb2a7a`).
- A thin class (`FaceDetector`, `FaceTracker`, `ROIManager`, `SkinSegmenter`,
  `EulerianMagnification`) exists only so `AlgorithmManager`'s registry/interface typing
  compiles on the JS thread. These classes' methods are dead stubs (e.g. `detect() { return
  null }`) — don't implement logic in them, extend the worklet functions instead.

`src/acquisition/FrameQueue.ts` is an unused generic ring buffer — no current caller. Leave it
or delete it; don't assume it's on the hot path.

## Known-fixed bugs (don't reintroduce)

1. **`useFaceDetector` options identity** (`usePulsePipeline.ts`): must be a stable
   reference (module-level `FACE_DETECTION_OPTIONS` const). A fresh object literal per render
   makes the library tear down and rebuild the native ML Kit detector on every pipeline state
   update, which starves face detection and tanks FPS.
2. **ROI byte layout** (`ROIManager.ts`): VisionCamera's `pixelFormat="rgb"` is actually 32-bit
   RGBA on both platforms — `bytesPerPixel` must be `4`, and row indexing must use
   `frame.bytesPerRow` (Android pads rows), not `width * bytesPerPixel`.
3. **EVM filter-state thrash** (`EulerianMagnification.ts` + `ROIManager.ts`): the per-pixel
   temporal biquad filters are reallocated (state wiped) whenever the ROI patch's pixel
   dimensions change. Since ROI boxes come from an EMA-smoothed, float bbox, unquantized
   `floor`/`ceil` dimensions changed by ~1px almost every frame, discarding the "temporal"
   filter's history constantly. Fixed by quantizing patch width/height to a 4px grid in
   `extractPatch`, so dimensions — and therefore EVM filter state — stay stable across the
   normal jitter of face tracking.
4. **`modeShared` read the pipeline's stale pre-start mode** (`usePulsePipeline.ts`): `start()`
   read `pipelineRef.current.getState().mode` to decide whether the frame-processor worklet
   should run EVM, but `PipelineController.state.mode` only updates *inside* `start()` itself —
   before that it's always the `INITIAL_STATE` default, `'standard'`. So `modeShared.value` was
   always `'standard'`, and `processEVMFrame` never ran in **any** mode, ever — Enhanced and
   Visualization silently behaved like Standard. Fixed to read `configManager.getMode()` (the
   actual target mode) and pass it explicitly to `pipelineRef.current.start(mode)`.
5. **`FFTAnalyzer` detrended/normalized after zero-padding**: during the "early reading" path
   (buffer only half full), the workspace was zero-padded *then* detrended/normalized over the
   full padded array, biasing the mean/std and creating a step discontinuity at the padding
   boundary (spectral leakage) — corrupting exactly the sooner-but-still-correct first reading
   the half-full threshold was meant to provide. Fixed to detrend/normalize the real samples
   only, then pad.
6. **`butterworthBandpass`'s Q was derived inconsistently**: it pushed the already-digital `w0`
   through an analog pre-warp (`2*tan(x/2)`) meant for s-domain→z-domain bilinear-transform
   designs, then divided two pre-warped values to get `Q`, but plugged that back into a
   pure-digital RBJ formula. Fixed to `Q = f0 / bandwidth` directly, matching the digital formula
   the rest of the function already implements.
7. **`PerformanceMonitor.isDroppingFrames()` divided a lifetime-cumulative counter by a
   window-capped denominator**: `droppedFrames` only ever grows (reset only on session
   `reset()`), while the denominator caps at `HISTORY_SIZE=60` once the session passes 60
   frames — so a handful of dropped frames during startup would flag "dropping frames" for the
   rest of the session even if the last 60 frames were clean. Fixed with a parallel ring buffer
   of per-frame drop flags so the check is actually windowed.
8. **Camera `isActive` wasn't gated on navigation focus**: both camera screens hardcoded
   `isActive={true}`; react-navigation's native-stack keeps screens mounted underneath whatever's
   pushed on top, so navigating away (or backgrounding) mid-scan left the camera/pipeline running
   — battery drain, and a real risk of two screens claiming the physical camera device at once.
   Fixed both screens to use `useIsFocused()`; `PulseCheckScreen` also stops an in-progress
   session when it loses focus.
9. **Two independent `ConfigurationManager` instances**: `DashboardScreen` and
   `usePulsePipeline` each built their own, both reading/writing the same AsyncStorage key with
   no shared in-memory state — a mode/camera change from one wasn't reliably seen by the other
   without an app restart. Fixed by hoisting a single `configManager` singleton export from
   `ConfigurationManager.ts`, imported by both.
10. **Face detection requested contour + landmark data nothing consumes**: `FACE_DETECTION_OPTIONS`
    (`usePulsePipeline.ts`) had `contourMode: 'all'` and `landmarkMode: 'all'`, but grepping every
    consumer (`ROIManager` derives ROI boxes purely from the bbox, `ConfidenceEstimator` only uses
    velocity/coverage, `FaceOverlay` only draws the bbox/ROI rects) shows nothing ever reads
    `face.landmarks`/`face.contours` downstream — it was computed and EMA-smoothed by
    `FaceTracker` every frame for no consumer. Contour extraction is also the heaviest and most
    fragile part of ML Kit's per-frame analysis (it demands much more of the face be clearly,
    fully visible to succeed, and is a known source of total detection failure on a close-up or
    partially-cropped face). Set both to `'none'` — this should noticeably raise achievable FPS
    (previously ~12, well under the requested 30) and make detection far more tolerant of framing.
    `FaceDetector.ts` also now tracks `lastError` (the message from an actual thrown exception,
    distinct from a clean "zero faces found") and surfaces it directly into `statusText` as
    `"Face detection error: ..."` when present, so a real native failure is visible in the app
    itself without attaching a debugger/logcat.
11. **`mapFaceResult`/`cloneLandmarks`/ROI+EVM helper functions silently `undefined` at runtime**:
    see the worklet gotcha section above — fixed by nesting these inside their single caller
    instead of keeping them as separate top-level/imported functions.
12. **Negative `Float32Array` length crash in `extractPatch`** (`ROIManager.ts`): the
    percentage-offset cheek/forehead sub-boxes (e.g. `x: faceBbox.x + faceBbox.width * 0.65`) were
    never clamped to the frame's bounds. For a face that's large/close or near an edge — exactly
    the close-up framing in the original bug report — a cheek box's `x` can exceed `frameWidth`,
    making `frameWidth - startX` negative and crashing on `new Float32Array(negativeLength)` with
    Hermes's "A negative value cannot be an index". Fixed by clamping `startX`/`startY` into
    `[0, frameWidth]`/`[0, frameHeight]` and `rawEndX`/`rawEndY` to be `>= start`, so `patchWidth`/
    `patchHeight` can never go negative (a resulting 0-size patch is valid — `segmentSkin` also now
    guards `totalPixels === 0` to avoid a `0/0` NaN coverage ratio poisoning confidence).

Both #11 and #12 were latent from the start but only surfaced once face detection began actually
succeeding (fix #10) — the code paths they're in simply hadn't run before. Expect more of this
shape if further issues show up: something that only manifests once an *earlier* stage starts
working isn't a new regression, it's dead code becoming live for the first time.

### Time to first BPM reading

Two sequential fill requirements stack before the first reading appears: `POSExtractor`'s own
sliding window must fill (`windowLength`, 32 samples) before it returns a non-NaN BVP value at
all, and only then does `SignalBuffer` start accumulating toward the FFT's half-full threshold
(`windowSize/2`, 64 samples) — roughly 96 valid frames end to end. At the ~12fps this pipeline
was running at (face-detection-bound, see #10 above), that's ~8s; fixing the FPS bottleneck
directly cuts this proportionally (e.g. ~3.2s at a genuine 30fps) without touching either window
size, so accuracy/stability isn't traded away for latency. If it's still not fast enough after
that, the next lever is shrinking `POSExtractor.windowLength` and/or
`DEFAULT_PROCESSING_CONFIG.windowSize`/`windowSize/2` — but `windowSize` is already below the
resolution `fft.ts`'s own header comment documents as the design target (512 samples for
~3.5 BPM/bin; the current 128 gives ~14 BPM/bin), so shrinking it further trades even more
frequency resolution for speed.

## EVM + POS

`enhanced` mode runs EVM (Gaussian pyramid + per-pixel bandpass + coarse-band amplification) on
each ROI patch *before* spatial averaging feeds POS. This is real, wired-up DSP, not a stub —
but treat it as experimental, not a proven accuracy win:
- POS's chrominance projection is already illumination/motion-robust by construction; amplifying
  raw pixel color ahead of it tends to amplify noise along with signal.
- EVM here is significantly more expensive per frame than POS/FFT (per-pixel-per-channel IIR
  filtering across 3 ROI patches) for a pipeline already CPU-constrained.
- `visualization` mode's "see your pulse in real-time" promise has no rendering backend — the
  camera preview is native/unmodified; only the ROI/face overlay and status text reflect the
  pipeline. `src/screens/VisualizationScreen.tsx` says as much in a comment.

If better BPM accuracy is the goal, try `SignalBuffer.getFilteredValues()`
(`src/processing/SignalBuffer.ts`) first — a cheap, already-implemented 1-D Butterworth bandpass
over the extracted BVP trace (standard rPPG practice), currently unused by `PipelineController`.

## Dashboard / storage

`src/screens/DashboardScreen.tsx` → `src/services/readingsService.ts` (`fetchReadings`) →
`src/lib/supabase.ts` client → Supabase `readings` table (`supabase/readings.sql`,
`supabase/migration_002_pipeline_metadata.sql`). If the dashboard fails to load, check the
now-logged real error (`DashboardScreen`'s `catch` logs via `createLogger` before showing the
generic banner) rather than guessing — likely causes are an unapplied migration, an RLS policy
mismatch, or network/DNS to the Supabase project in `.env`.

**Security — flagged, not fixed:** `supabase/readings.sql`'s RLS policies are
`using (true)`/`with check (true)` for both select and insert, and `user_id` is a free-text
column never checked by any policy. Any holder of the anon key (normal for anon keys — expected
to be extractable from the app) can read or write every user's BPM/confidence history under any
`user_id` they like. There's no Supabase Auth wired up in the app at all, so a real fix means
adding auth and scoping policies to `auth.uid()`, not a one-line change — treat this as a known
gap to close before this app handles real users' data, not a bug to patch reactively.

## Build/runtime risk — investigated, not changed

- **`react-native-worklets` (0.8.1) + `react-native-worklets-core` (1.6.3) coexist.** This looked
  suspicious at first (two babel plugins both keying off the `'worklet'` directive), but it's the
  documented, expected setup: Reanimated 4.3.0's peer dependency is `react-native-worklets` (its
  own UI-thread worklet runtime), while VisionCamera 4.7.3's peer dependency is
  `react-native-worklets-core` (a separate runtime required for frame processors) — they're two
  different libraries solving two different problems, not a version conflict. `babel.config.js`
  already orders `react-native-worklets-core/plugin` before `react-native-reanimated/plugin`,
  matching Reanimated's documented requirement that its plugin run last. New Architecture is
  enabled (`android/gradle.properties: newArchEnabled=true`, required by Reanimated 4), and a
  cold app launch on-device loaded `libworklets.so`, `libreanimated.so`, and `libVisionCamera.so`
  cleanly with no fatal exceptions or JSI-runtime errors in logcat. One caveat found but not
  independently verified: `react-native-vision-camera-face-detector`'s README states it was
  tested against `react-native-reanimated: ~3.17.4`, not 4.x — if worklet-runtime crashes ever
  show up (error text like "different runtime" or "non-worklet function"), that library/Reanimated
  4 combination is the first place to look. Live in-app interaction testing (starting a scan,
  navigating away) was not completed — the connected test device had an active phone call in
  progress, and further automated screen taps were stopped rather than risk interfering with it.
- **Android release build signs with the debug keystore** (`android/app/build.gradle`,
  `signingConfig signingConfigs.debug` under `buildTypes.release`) — this is the React Native
  template default, not something introduced by this codebase, but it means a release APK could
  be resigned by anyone holding the well-known public debug key. Needs a real keystore generated
  and wired in before any real release; left alone since that requires credentials only you can
  provide.
