# PPulse Check (HeartSense) — orientation for a new session

This project is **mid-rebuild**. Read `REQUIREMENTS.md` in the repo root first — it has the
full plan, the reasons for the rebuild, and a "Status" section at the top telling you exactly
what phase is done and what's next. Don't start writing code before reading it.

## Quick facts

- v1 (the original implementation) is fully erased from the working tree but recoverable in git
  history — see `REQUIREMENTS.md` for the exact commit hash if anything from it is ever needed.
- The rebuild is happening in phases (`REQUIREMENTS.md` §7), each ending with an **on-device
  checkpoint** before the next phase starts. Do not build ahead of what's been visually confirmed
  working on the user's real Android device — v1's biggest recurring problem was code that
  type-checked but had never actually been run on hardware.
- The user's dev device is a personal phone connected via `adb`. It is sometimes actively in use
  (calls, messages) or locked/asleep. **Never tap/swipe/interact with it if it's locked, mid-call,
  or shows personal app content you weren't asked to touch** — check with a screenshot first, and
  if it's not clearly idle/available, ask the user to test manually instead of driving it yourself.
- **This sandbox has no GitHub push credentials.** Commits work fine locally; `git push` will fail
  with "could not read Username for 'https://github.com'". Tell the user to push themselves rather
  than repeatedly retrying or assuming it's a transient error.
- Face detection in v1 used `react-native-vision-camera-face-detector`, a community JS wrapper
  whose worklet closures silently returned `undefined` for cross-function calls in a way that cost
  a great deal of debugging time. v2's plan is a small custom native Frame Processor Plugin
  instead (see `REQUIREMENTS.md` §5.1) — if that decision changes, or if any new native/worklet
  boundary code starts doing something similar, get real on-device values (a visible debug
  overlay) before writing a fix, not reasoning from a library's internal comments alone.
