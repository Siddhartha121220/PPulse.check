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

13. **`state.filters[filterIndex]` undefined in `processEVMFrame`** (`EulerianMagnification.ts`,
    Enhanced/Visualization modes): `reallocateBuffers` and `buildGaussianPyramid` compute the
    filter-pool size and pyramid-level sizes independently (by the same ceil-halving formula, so
    they should always agree), but crashed on-device with `Cannot read property 'b0' of undefined`
    — meaning they went out of sync in practice, likely from `EVMState` being shared and
    reallocated across 3 differently-sized ROI patches (forehead/leftCheek/rightCheek) every frame.
    The exact trigger wasn't pinned down through static reading alone (no live device access at
    the time), so rather than guess, `processEVMFrame` now self-heals: after building the pyramid,
    it counts the pixel-channels the pyramid actually needs and reallocates if `state.filters`/
    `state.filteredPyramid` don't match — using the pyramid itself as ground truth instead of
    trusting two independently-derived size formulas to stay in agreement. A per-sample fallback
    (pass the sample through unfiltered if a filter is still somehow missing) backs that up so a
    mismatch can never crash a live session again, even in a case this reasoning missed.
14. **Follow-up to #13**: the length-based self-heal above wasn't enough — it crashed again with
    `Cannot set property '0' of undefined` on `state.filteredPyramid[l]` directly. The bug: outer
    array LENGTH checks (`filteredPyramid.length !== pyramid.length`) can never detect this kind of
    drift, because both are always exactly `pyramidLevels` (a fixed config value) regardless of
    whether the reallocation actually matches the current patch's width/height — only checking
    each level's actual `Float32Array.length` against the real pyramid catches a genuine mismatch.
    Replaced the check with a per-level size comparison, guarded every remaining
    `state.filteredPyramid[l]`/`amplifiedBase` access so a miss degrades (skips that level /
    treats missing data as zero) instead of throwing, and added a `console.log` that dumps the
    exact pyramid vs. filteredPyramid sizes and width/height/lastWidth/lastHeight whenever a
    reallocation is triggered — if this still misbehaves, that log line has the numbers needed to
    find the actual trigger instead of guessing again.

#11–#14 were all latent from the start but only surfaced once face detection began actually
succeeding (fix #10) — the code paths they're in simply hadn't run before. Expect more of this
shape if further issues show up: something that only manifests once an *earlier* stage starts
working isn't a new regression, it's dead code becoming live for the first time.

15. **ROI pixels reading zero / ROI box misplaced — a wrong fix for a real symptom.** The crash in
    #12 was real (unclamped sub-boxes → negative array length), but the *follow-on* theory — that
    ML Kit returns `face.bounds` in a rotated coordinate space needing correction before indexing
    into the raw buffer — turned out to be wrong for this app. It was a reasonable hypothesis from
    reading the face-detector plugin's own Kotlin comment ("frame is always -90deg rotated"), but
    that comment describes an *internal* assumption of that plugin's own (unused-by-us) `autoMode`
    scaling path, not the shape of the `bounds` it actually returns to JS.

    A `toBufferSpace()` transform was added in `extractROIs` to swap width/height based on
    `frame.orientation`, and it made things *worse* — visually confirmed on-device: a correctly
    shaped, roughly-positioned cheek/forehead box got stretched into a tall, narrow rectangle in
    the wrong place. A debug overlay added to the status text (`[orient=... fw=... fh=...
    bbox=(x,y,w,h)]`, temporary — `usePulsePipeline.ts` → `PipelineController.onFrameProcessed`'s
    `debugInfo` param) gave the actual numbers: `orient=landscape-left fw=640 fh=480
    bbox=(29,216,353,354)`. `bbox.x`/`bbox.x+width` (29→382) fit comfortably within `fw=640`, and
    `bbox.y`/`bbox.y+height` (216→570) only modestly exceeds `fh=480` (~90px, consistent with a
    close-up face's chin extending toward/past the frame edge, not a coordinate-space mismatch).
    **`face.bbox` was already in the same coordinate space as `frame.width`/`frame.height` all
    along** — no transform was ever needed. `toBufferSpace()` has been removed from `ROIManager.ts`
    entirely; `extractROIs` uses `face.bbox` directly again, as it originally did.

    Lesson for next time: when a coordinate-space bug is suspected, get the actual numbers (via a
    visible debug overlay, as done here) *before* writing a correction — reasoning from a library's
    internal comments about a code path this app doesn't even use produced a confident, wrong
    answer that took a full round-trip to falsify. The debug overlay is still in place in
    `PipelineController.ts`/`usePulsePipeline.ts`; remove it once ROI extraction is confirmed
    working end-to-end (RGB reading non-zero, a BPM eventually appearing).

16. **EVM reallocating on almost every frame (severe lag) once Enhanced/Visualization mode
    actually started running**: `usePulsePipeline.ts` shared one `EVMState` across all three ROI
    patches (forehead/leftCheek/rightCheek), calling `processEVMFrame` for each in sequence every
    frame. Since forehead and cheek patches have different pixel dimensions, `processEVMFrame`'s
    self-heal (#13/#14) correctly detected a size mismatch on nearly every call and fully
    reallocated the filter bank (thousands of object allocations) 2-3 times per frame, every
    frame — plus the reallocation's diagnostic `console.log` firing that often, itself a known RN
    performance killer at high frequency. Fixed by giving each region its own persistent
    `EVMState` (`evmStateForehead`/`evmStateLeftCheek`/`evmStateRightCheek` in `workletContext`),
    so each one is sized once and reallocates only when that specific region's own dimensions
    change (rare, since `ROIManager` quantizes to a 4px grid) instead of every time a
    differently-sized sibling patch was processed in between.

## Performance — lag that isn't a bug, it's the architecture's per-frame cost

Lag persisted even after #16, in modes that don't touch EVM at all — this isn't a one-line bug,
it's the cumulative cost of everything this pipeline does per frame, all in interpreted JS
(Hermes) on the frame-processor thread, every single frame at up to 30fps:

1. `frame.toArrayBuffer()` copies the *entire* camera buffer GPU→CPU — at the original 720p
   request, ~920k pixels, even though only 3 small ROI regions are ever read from it.
2. Every pixel in those ROI regions gets walked for skin classification (`isSkinPixel` — an HSV
   *and* a YCrCb conversion, several `Math` calls each).
3. In Enhanced/Visualization mode, every pixel additionally gets walked again for EVM's per-pixel
   biquad filtering across a 4-level pyramid.
4. ML Kit face detection itself runs synchronously on this same thread (throttled to every 200ms,
   but when it does run, the frame processor blocks waiting for it — see `Tasks.await(task)` in
   `VisionCameraFaceDetectorPlugin.kt`).

None of this is a "bug" in the sense of wrong logic — it's just a lot of real work, done in a
scripting runtime, on a mobile CPU, every frame. Fixes applied so far, roughly ordered by
leverage:

- **Camera resolution dropped 720p → VGA (640x480)** (`CameraManager.ts`) — the single biggest
  lever available without moving work into native code. rPPG only needs a spatial *average* over
  face regions, not fine detail — VGA is a long-established sufficient resolution in published
  webcam-based rPPG research, and this alone cuts the per-frame pixel count (and thus the buffer
  copy and every per-pixel loop downstream) by roughly 3x.
- **Skin classification subsampled** (`SkinSegmenter.ts`) — `coveredRatio` only feeds a
  15%-weighted confidence sub-score, so it doesn't need every pixel classified; sampling every
  4th pixel gives a statistically equivalent ratio for a quarter of the HSV/YCrCb math.

**Further levers, not yet applied, roughly in order of effort**:
- **Make face detection asynchronous** via VisionCamera's `runAsync()`, so the ML Kit call runs
  on its own cadence instead of blocking the main per-frame ROI-extraction work every time it
  fires. This is a real structural change (the frame processor would need to read the *last
  completed* detection result rather than waiting on a fresh one each throttle interval) but
  doesn't touch any of the DSP/algorithm code.
- **Move pixel processing into a native Frame Processor Plugin** (Kotlin/Swift), so the RGBA
  conversion, skin classification, and (if kept) EVM filtering run as compiled native code
  instead of interpreted JS. This is the approach production rPPG apps use for exactly this
  reason — it's a genuinely bigger undertaking (a native module, not a JS change) — but it's the
  ceiling-raising fix if VGA + subsampling + async detection still isn't enough.

None of this requires discarding the app and starting over. A rewrite would face the identical
constraints (camera frames + face detection + per-pixel color math, ~30 times a second, on the
same class of hardware) — the fix is in *how* the work is distributed (resolution, sampling,
sync vs. async, JS vs. native), which applies the same whether it's done to this codebase or a
fresh one.

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
