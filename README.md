# linelogic

LineLogic — visual consultation tool for aesthetic treatments (Botox projections, age-aware outcome simulation). Browser-based MediaPipe prototype.


A browser-only proof of concept for aesthetic injectable consultations. It
takes five photos of a client, finds 478 face landmarks on the device
(MediaPipe Face Landmarker), and shows what glabella-only vs. + forehead vs.
+ crow's feet plans can and can't change, in each expression.

**Demo build.** Everything is stored in the browser on the device you use.
Use staff or volunteer photos, not client records. Nothing is uploaded.

## The rules that keep it honest

- **Rest ceiling.** Treated areas soften toward the client's *own relaxed
  photo*, never past it. Etched lines stay, which is the honest result for older
  clients.
- **Untreated areas don't change.** The demo never adds compensatory lines on
  its own.
- **Brow position is part of the trade-off.** Forehead treatment lowers the
  brows. The drop is larger when the eyes-closed photo shows the forehead is
  holding the brows up. Treating only the central forehead can arch the brow
  tails ("Spock brow").
- **Response levels, never units.** Light / moderate / full, plus a
  lower–typical–upper range toggle.
- **Every simulated image is watermarked.** A persistent disclaimer, side
  effects from the label, and a "what this won't change" panel sit next to it.
- **Uncalibrated.** Coefficients are placeholders (`src/lib/sim/brow.ts`,
  `src/lib/types.ts`) until they are tuned against real follow-ups.

## How a demo consultation works

1. Add a client (name or initials).
2. Consent, then take photos: relaxed, relaxed with eyes closed, frown, brows
   raised, smile. Each photo is checked for pose and expression.
3. Compare plans A/B/C in each expression: slider, side by side, or all plans.
   Provider details hold measured forehead compensation, findings and the
   predicted brow change.
4. Choose the plan given. At 2 weeks, add a follow-up with the same photos.
   The follow-up screen shows consultation photo, projection and actual result,
   with line and brow numbers saved for calibration.
5. **Export dataset** (home screen) saves everything as one JSON file;
   **Import** loads it on another device.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (camera needs localhost or https)
npm test           # engine tests (identity, rest ceiling, brow model)
npm run build
```

`npm run dev` and `npm run build` first run `scripts/prepare-assets.mjs`, which
copies the MediaPipe wasm into `public/mediapipe/` and downloads Google's
official Face Landmarker model into `public/models/`. If that download fails,
the app loads the model from Google at runtime.

## Deploy on Vercel

1. Import this repo in Vercel. Framework preset: **Vite** (auto-detected).
2. No environment variables. Build command `npm run build`, output `dist`
   (already set in `vercel.json`).
3. Add the subdomain under Project → Settings → Domains.

`vercel.json` sets a strict Content-Security-Policy: scripts only from the site
itself, and network calls only to the site (plus Google's model host as a
fallback). Photos have nowhere to go. Don't add analytics, pixels or session
replay. This demo stores no data on Vercel, so it needs no BAA; the client
portal will (see the design doc).

## Code map

| Path | What it does |
| --- | --- |
| `src/lib/sim/simulate.ts` | Prepare (frames, band split, crease maps) and render one view under a plan |
| `src/lib/sim/brow.ts` | Brow heights, forehead compensation κ, predicted brow shift |
| `src/lib/sim/fields.ts` | Where each treatment acts, per expression |
| `src/lib/sim/crease.ts` | Multi-scale Hessian valley filter with direction priors |
| `src/lib/warp.ts` | Piecewise-affine warp (Delaunay), bicubic sampling |
| `src/lib/landmarker.ts` | MediaPipe Face Landmarker wrapper |
| `src/lib/db.ts`, `src/lib/dataset.ts` | IndexedDB store, dataset export/import |
| `src/pages/*` | Clients, capture, consultation comparison, follow-up |

## Known limits

- Landmarks come from a model built for AR effects, not clinical
  measurement. Hooded lids, bangs and glasses reduce accuracy.
- The eyes-closed method for forehead compensation is an approximation; the
  provider can override it with their exam value.
- Lighting differences between photos change line visibility more than
  treatment does. Keep the same spot, light and distance.
- Crease detection has not been tested across skin tones yet. Do that
  before any client sees it.
- mm values assume a 90 mm outer eye-corner width.
