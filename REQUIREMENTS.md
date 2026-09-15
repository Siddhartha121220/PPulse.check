# HeartSense — Requirements v2 (Rebuild)

## Status (update this section as phases complete)

- **Phase 1 (scaffold) — DONE, confirmed on-device.** New design system (palette, `Card`,
  `Button`, `ModeSelector` with the fixed full-width horizontal rows), navigation
  (Home/PulseCheck/History), all visually verified against a screenshot from the user's real
  device. Last relevant commits: `5bb8377` (scaffold), `af8e1ab` (fixed disabled-row legibility
  bug found from that on-device screenshot).
- **Phase 2 (camera + native face-detection plugin) — DONE, confirmed on-device.** Custom Kotlin
  frame-processor plugin (`android/app/src/main/java/com/ppulsecheck/FaceDetectionFrameProcessorPlugin.kt`)
  wraps ML Kit face detection directly, fed the frame's native YUV image (not a decoded RGBA
  bitmap). Returns a plain bbox — `{faceDetected, boundingBox, frameWidth, frameHeight}` — no
  contours/landmarks. JS side: `src/acquisition/faceDetectionPlugin.ts` (module-level singleton
  per §5.3) + `src/screens/PulseCheckScreen.tsx` (live preview, alignment guide that highlights on
  detection, debug overlay). On-device screenshot confirmed: face detected: true, plausible bbox
  (282x282) inside a 640x480 frame (VGA, matching §5.4 by default), guide turned lavender
  correctly. FPS reads 10, but that's from the debug overlay's per-frame `runOnJS` round-trip, not
  the plugin itself — deliberately not optimizing this yet (§7.6 polish phase).
- **Phase 3 (ROI + RGB extraction) — DONE, confirmed on-device.** Extended the same native plugin
  to average YUV->RGB over forehead/left-cheek/right-cheek ROIs, sampled directly from the raw
  Y/U/V planes (not a decoded bitmap). This surfaced a real §5.2 coordinate-space bug: ML Kit's
  `Face.boundingBox` is in the *rotated/upright* space (width/height swapped vs. the raw buffer
  when rotation is 90/270), confirmed from Phase 2's own screenshot numbers (a bbox that didn't
  fit the raw buffer's reported height). Fixed by deriving (not guessing) the inverse-rotation
  mapping from upright ROI rects back to raw buffer coordinates before sampling pixels — see the
  doc comment in `FaceDetectionFrameProcessorPlugin.kt`. `frameWidth`/`frameHeight` now correctly
  report the upright (bbox) space. On-device: all three regions show plausible skin-tone RGB at
  100% coverage, values changed as expected moving closer/farther from the camera. Known
  simplification: front-camera mirroring isn't corrected, so "left"/"right" cheek labels may be
  swapped from the user's anatomical left/right — doesn't affect signal extraction, only labeling.
- **Phase 4 (signal pipeline) — NOT STARTED.** Next: port `POSExtractor`, `SignalBuffer`,
  `FFTAnalyzer`, `HREstimator`, `ConfidenceEstimator` from v1's git history largely as-is (they
  were audited correct — the rebuild never disputed the DSP, only the camera/native layer around
  it), per §7.4.
- v1 is erased from the working tree as of commit `ac06161` but fully intact before that commit
  if anything needs to be referenced (the POS/FFT math especially — it was correct and is meant
  to be ported forward largely as-is in Phase 4).
- Environment note: this sandbox cannot `git push` (no GitHub credentials) — the user pushes
  manually after each session. Don't assume a push failure here means something is wrong with git
  itself.

## 0. Why this document exists

v1 (the code being replaced) had a technically correct DSP core — POS extraction and the FFT/PSD
stack were audited in depth and never the source of a single bug. Every real bug traced back to
one of three places: (1) a community face-detection library's JS wrapper interacting badly with
`react-native-worklets-core`'s closure-capture model, (2) heavy per-pixel color math running in
interpreted JS on the frame-processor thread instead of native code, and (3) architectural
assumptions (coordinate spaces, shared mutable state across differently-sized ROI patches) that
were guessed at instead of verified against real device data before being coded against.

This rebuild keeps the parts that were never the problem (POS, FFT, the general pipeline shape)
and replaces the parts that were, informed directly by what went wrong. See `ARCHITECTURE.md` in
git history (pre-rebuild) for the full incident log if a similar bug shows up again.

## 1. Goals

- A working camera-based heart rate (BPM) measurement from a live front-camera feed, using the
  POS algorithm and FFT-based frequency estimation (both proven correct in v1, carried forward).
- Visibly reliable face detection and ROI (forehead/cheek) tracking on real Android hardware —
  not just "it type-checks," verified on-device at every milestone.
- A redesigned UI (see §4) fixing the specific layout defect in v1 (see §4.2) and adopting a new
  visual identity.
- Built-in observability from day one (see §6) so a future bug is diagnosable from the app's own
  UI/logs, not from re-deriving root causes through blind code reading and guesswork.

## 2. Non-goals (for this rebuild's first pass)

- EVM (Eulerian Video Magnification) enhancement — v1's own analysis concluded it was unlikely to
  improve accuracy and was the single largest source of performance bugs. Not carried forward
  unless the core pipeline (Standard mode) is proven solid on-device first.
- A "visualization" mode showing magnified video — never had a real rendering backend in v1
  either; drop it rather than reimplement a feature that was cosmetic scaffolding.
- Multi-user accounts / auth — v1 flagged Supabase RLS as wide open with no real auth. Out of
  scope for this rebuild unless explicitly requested; if reading history is kept, treat it as
  device-local (AsyncStorage) rather than reintroducing an unauthenticated cloud writeback.

## 3. Functional requirements

1. Request camera permission; show a clear permission-denied state if refused.
2. Front-camera live preview with a face-alignment guide overlay shown before and during
   recording (kept from v1 — it was a good idea, worth carrying forward as designed).
3. On starting a measurement: detect a face, track it frame to frame, extract forehead + left
   cheek + right cheek ROIs, compute a spatially-averaged RGB sample per frame.
4. Feed the RGB stream through POS extraction → signal buffer → FFT → BPM, exactly as v1's
   `POSExtractor`/`FFTAnalyzer`/`SignalBuffer` did (port this code largely as-is; it was correct).
5. Show live FPS, confidence, signal quality, and BPM during a session.
6. On stop, save a completed reading (BPM, confidence, timestamp) to local storage; show history.
7. Handle "no face detected," "face detected but signal too weak," and "reading complete" as
   distinct, clearly-worded states — no silent NaN/zero states surfaced as if they were normal.

## 4. Design system

### 4.1 Visual direction

Reference: attached inspiration image (a fitness/training app card layout). Adopt its palette and
card language, not its content:

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B1A16` (deep teal-black) | App background |
| `surface` | `#F3EEE3` (warm cream) | Primary card background |
| `surfaceDark` | `#15191B` (near-black) | Inset panels within a cream card |
| `accent` | `#C7BDF5` (soft lavender) | Badges, progress indicators, primary highlights |
| `textOnSurface` | `#17181A` | Text on cream cards |
| `textOnDark` | `#F5F3EF` | Text on dark backgrounds/panels |
| `danger` | keep a warm coral/red, e.g. `#E8674F` | Stop/error states — cream+lavender alone reads too soft for a "stop recording" action |

Rounded corners throughout (16–24px radius), generous padding, bold sans-serif headings. The
inspiration image's nested-card scalloped-seam effect (dark inset panels connecting to the cream
card via small quarter-circle cutouts) is a nice-to-have, not a requirement — don't burn time on
custom SVG masking for it before the core app works; flat rounded-rect nesting is an acceptable
first pass.

### 4.2 Fix: mode-selector cards (Standard/Enhanced/Visualize → whatever modes remain)

v1's processing-mode selector used three cards **side by side**, each a narrow vertical
rectangle — too narrow for their own title ("Standard" wrapped to "Standar" / "d"). Replace with
three cards **stacked vertically**, each a **full-width horizontal rectangle** (title + one-line
description side by side or stacked within the wide card, never wrapping a single word). This is
a required layout change, not a suggestion.

## 5. Architecture

### 5.1 Face detection & ROI extraction — native, not community-JS-wrapped

**Decision: write a small custom VisionCamera Frame Processor Plugin** (Kotlin for Android;
Swift/iOS can follow once Android is solid) that:
- Wraps Google ML Kit Face Detection directly (bounding box only — no contours, no landmarks, no
  classification, no `autoMode` scaling; v1 proved none of that was consumed downstream and
  contour mode made detection measurably less reliable).
- Also performs the ROI pixel-averaging (forehead/cheek spatial RGB mean) **in the same native
  call**, returning plain numbers (`{ bpm-relevant RGB triples, faceBbox, coveredRatio }`) to JS —
  not a raw pixel buffer for JS to walk. This moves the single most expensive per-frame operation
  (per-pixel color math) out of interpreted JS entirely, which is the real fix for the lag v1
  fought via increasingly desperate JS-side optimization (resolution drops, pixel subsampling).
- Returns a **plain data object**, the standard, well-supported VisionCamera frame-processor-
  plugin return shape — no function values crossing the worklet boundary, which is what broke in
  v1 (`react-native-worklets-core` re-parses each worklet function in isolation and can silently
  return `undefined` for a captured reference to another JS function; a plugin returning plain
  data sidesteps this category of bug entirely).

**Fallback if native development stalls**: `react-native-fast-tflite` + a BlazeFace (or similar)
TFLite model. Same author as `react-native-vision-camera` (mrousavy), so its worklet integration
is first-party rather than a third-party community wrapper — meaningfully lower risk than v1's
dependency even though it still returns data through a JS layer. Only fall back to this if the
native-plugin route proves impractical; don't start both in parallel.

### 5.2 Coordinate spaces — verify before coding, every time

v1 lost a full round-trip to a wrong assumption about ML Kit's coordinate space (reasoned from a
library's internal comment about a code path this app didn't even use, instead of getting actual
on-device numbers first). Rule for this rebuild: **any time a coordinate transform is suspected
necessary, add a visible debug readout showing the actual raw values first, confirm the
hypothesis against real numbers, then write the transform.** Never ship a geometric correction
based on reasoning alone when it's this cheap to verify.

### 5.3 State ownership

- One `EVMState`-style shared-mutable-object-per-differently-sized-input mistake was made in v1
  (one enhancement state shared across 3 differently-sized ROI patches, causing constant
  reallocation). Since enhancement (EVM) isn't in scope for this rebuild (§2), this specific trap
  doesn't recur — but the general rule carries forward: **never share one mutable state object
  across multiple differently-shaped inputs processed in the same frame.**
- Config (mode, camera position) should have exactly one owning module-level singleton, imported
  everywhere it's needed — v1 had this bug (two independent `ConfigurationManager` instances
  drifting out of sync) before fixing it; start the rebuild with the singleton pattern already in
  place rather than discovering the bug again.

### 5.4 Camera resolution & format

Request VGA (640x480), not 720p/1080p, from the start. rPPG needs a spatial average over face
regions, not fine detail — v1 confirmed VGA is sufficient and is standard in published
webcam-based rPPG research. Don't request higher resolution "for quality" and rediscover this the
hard way.

## 6. Observability requirements (non-negotiable — this is the explicit ask)

- **A dev-mode debug overlay**, visible directly in the running app (no Metro/logcat dependency),
  showing at minimum: current FPS, face-detected boolean, raw face bbox, frame width/height,
  per-ROI covered ratio, and the last N pipeline stage timings. This is what v1 had to bolt on
  reactively (a `debugInfo` string threaded through `PipelineController` mid-debugging-session) —
  build it in from the first milestone instead of adding it after the third blind bug.
- **Loud failure over silent wrong data**: any internal invariant that should always hold (e.g.
  "a pixel buffer's length equals width×height×3", "an array index is in bounds") gets an
  explicit dev-mode assertion that throws with a clear message, not a silent fallback that
  produces plausible-looking-but-wrong output. v1's `0.000/0.000/0.000` RGB reading (from a
  silent out-of-bounds-read fallback) looked like "no signal yet" for far longer than it should
  have before anyone realized it meant "reading the wrong memory entirely."
- **On-device checkpoint after every milestone in §7** — no milestone is "done" until it's been
  run on a real Android device and its debug overlay confirms the expected values, not just until
  `tsc` is clean.

## 7. Phased delivery plan

Each phase ends with an on-device checkpoint (§6) before starting the next. Do not build ahead of
what's been verified working — v1's very first commit was "complete research-grade rPPG platform
implementation," built before any single stage had been confirmed working on hardware, and the
consequences of that took the rest of this project's history to fully surface.

1. **Scaffold**: navigation, new design system components (cards, buttons, the fixed horizontal
   mode-selector), empty screens. No camera yet.
2. **Camera + native face detection plugin**: get the custom Kotlin plugin returning a face bbox,
   rendered live via the alignment-guide + detected-box overlay, debug overlay showing raw
   values. Checkpoint: box visibly tracks a real face correctly, on-device.
3. **ROI + RGB extraction** (native, per §5.1): extend the plugin to also return per-region
   averaged RGB. Checkpoint: debug overlay shows plausible, non-zero, changing RGB values that
   respond to moving toward/away from the camera and covering/uncovering the lens.
4. **Signal pipeline**: port `POSExtractor`, `SignalBuffer`, `FFTAnalyzer`, `HREstimator`,
   `ConfidenceEstimator` from v1 largely as-is (audited correct). Checkpoint: a real BPM reading
   appears within a reasonable warm-up window, and roughly tracks a real pulse (compare
   informally against a smartwatch or manual pulse count).
5. **History + persistence**: local storage of completed readings, history screen.
6. **Polish**: final design-system pass, error-state copy, performance headroom check (confirm
   FPS is acceptable on a real device, not just "better than before").

## 8. Open questions (to confirm before/while building, not blockers to starting §7.1)

- Keep Supabase for reading history, or move to local-only storage given the RLS/auth gap noted
  in §2? Recommend local-only for this rebuild's first pass; revisit if multi-device sync matters.
- iOS support timeline — this document assumes Android-first (matching the test device used
  throughout v1's debugging); Swift equivalent of the native plugin is a follow-up, not part of
  the initial phases above.
