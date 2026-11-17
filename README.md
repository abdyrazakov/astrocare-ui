# AstroCare Core

**NASA Space Apps Challenge 2026 — "Create Health Monitoring Software for Astronauts on Space Missions"**

Fork of [Kwandiye/astrocare](https://github.com/Kwandiye/astrocare), adapted to consume the **AstroCare brain**
(`astro-brain`, a separate Python backend) as the single source of truth for status, body-zone colours, plans
and likely conditions, instead of computing them only in the browser.

Offline-first crew health monitoring built around an interactive **3D Digital Twin** of the astronaut.
Body zones are colour-coded by status. Clicking a zone answers the five questions from the challenge brief and gives a step-by-step protocol.

> Decision-support prototype, **not a medical device**. Thresholds come from open NASA documents; all data is synthetic.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (triage engine, hard triggers, trends, brain v0.6 contract, zone colours)
npm run build
```

## Brain connection

The brain (`astro-brain`) is a separate Python project that scores raw vitals into the `BrainTick` contract
(`src/types/brain.ts`) and streams it to this app over WebSocket. **When connected, the brain is the single
source of truth** for `alertLevel`, body-zone colours (`bodySystems`), the exercise/nutrition plans (`plans`)
and the likely-conditions list (`likelyConditions`) — the in-browser triage engine (`src/lib/triageEngine.ts`)
only computes a local fallback with the same 3 alert levels while no brain is connected.

```bash
# .env.local (see .env.example)
NEXT_PUBLIC_BRAIN_WS_URL=ws://localhost:8787    # BrainTick JSON over WebSocket (default)
NEXT_PUBLIC_BRAIN_HTTP_URL=http://localhost:8765 # brain HTTP API: /ask, /report, /log (next phase — not yet called by this app)
```

Run the real brain (from the `astro-brain` checkout):

```bash
python -m astro_brain.dashboard --ws-port 8787
```

Or, without the real brain, replay real brain output captured from it:

```bash
npm run mock-brain                                   # ws://localhost:8787, replays real brain ticks green → yellow → red
NEXT_PUBLIC_BRAIN_WS_URL=ws://localhost:8787 npm run dev
```

If no backend is reachable, the app switches to an in-browser mock automatically and shows a **MOCK DATA** badge. The mock uses the same contract — including the v0.6 fields (`bodySystems`, `flagDetails`, `plans`, `doctorSource`) — but computed locally as a fallback, never as the real brain's output.

## Demo (60 s)

Press **Demo**. It plays astro-01, days 45 → 53, on a Mars transit. During the replay:
- the CO₂ scrubber fails and a solar particle event starts;
- lungs and brain turn **yellow** (day 52), then **red** (day 53);
- the camera flies to the lungs and the protocol opens;
- the report to Mission Control shows the 22-min comm-delay countdown, and **Autonomous mode** turns on.

## Interface
| Tab | What it answers |
|---|---|
| **Overview** | In priority order: critical alert with the action to take → overall status (STABLE / WARNING / CRITICAL), the most important issue, recovery score, active alerts, last sync → six vital cards (HR, BP, SpO₂, respiration, temperature, glucose; click for 24 h / 7 d / 30 d history) → interactive 3D body (front/back, layers, click an organ) → next actions + alerts → spacecraft environment. |
| **Health Analytics** | Trend charts with 24 h / 7 d / 30 d filters, personal baseline band, abnormal readings marked; detected patterns; readiness scores; any-metric mission explorer. |
| **AI Assistant** | *Astro AI* — offline, rule-based companion with four roles (Doctor, Fitness Coach, Nutritionist, Mind & Sleep): briefings, priority alerts, quick actions, free-text questions, guided breathing. It explains data and onboard protocols; it does not diagnose. |
| **Training & Recovery** | Recovery / strain / EVA readiness / bone health, today's exercise plan, muscle & bone status, daily measurement routine. |
| **Mission History** | Daily status across the mission, events (EVA, SPE, CO₂ scrubber failures), reports to Mission Control, activity log. |

Colour always means the same thing: green normal · amber warning · red critical · grey no data · blue information. Cabin O₂, pressure, temperature and humidity are not in the dataset — they are labelled **demo** and never raise alerts; the 24-hour charts are a labelled synthetic profile and are not scored.

## Features
| Area | What |
|---|---|
| Anatomy layers | Body mesh `public/models/astronaut_body.fbx` (normalised to 1.755 m in `src/lib/bodyModel.ts`; organs/bones fitted with `node scripts/fbxinfo.mjs`). Starts in **Skin** view: abnormal zones glow through the skin. Click the body / **Peel** / key `L` → skin dissolves into **Muscles** (arm and leg/back regions carry their zone status) → **Organs** → **Skeleton** → **X-ray**. Selecting a hidden zone switches to its layer. |
| 3D twin | 16 clickable zones (`brain … skin_immune`), hologram shell (Fresnel), X-ray focus, layer modes, system filters, labels such as "HR 84 bpm ↑ +35%". Only RED animates (one pulse). 2D SVG fallback. A `public/models/astronaut_twin.glb` with the same object names replaces the procedural model automatically. |
| ICU-style live layout | Composite status + data freshness (> 5 s Delayed, > 15 s SIGNAL LOST), doctor recommendation, active flags (reason always visible, spike vs sustained), vital tiles with NEWS2-adapted range bars, trend arrows and sparklines, a separate radiation panel. |
| Vital Six | Blood pressure, heart rate, blood sugar (mg/dL ↔ mmol/L), temperature, sleep hours, mood. |
| Judge questions | Every zone panel answers: *Can it be measured in space? / Why this exam? / How spaceflight affects it (HRP hazards) / When to act / What to do*. |
| Triage engine | Personal phase baselines (z-scores), NASA hard triggers, Mission Fatigue Index, multi-signal syndromes, 26 protocols. |
| Scores | Recovery, Strain, Stress, Sleep, Cognitive readiness, EVA Go/No-Go, Bone health. Each shows its contributors and formula. |
| Input | Daily check-in: mood emoji, sleep, manual BP/glucose/temp with plausibility checks, **pain by clicking the 3D body**, experimental **webcam heart rate (rPPG)**, image attachments for the flight surgeon. |
| Mission context | Environments (ISS, Gateway, Moon, Mars transit, Mars base, rover) change radiation, bone-loss rate, comm delay and risks. What-if simulator. Earth dual-use mode. |
| Other views | Crew grid sorted by severity, HRP Risk Radar (click highlights zones), measurement routine with data confidence, streaks/XP/badges, Learn tab with glossary. |

## Triage rules
- `z = (value − μ_phase) / σ_phase`. |z| ≤ 1.5 is green, 1.5–3 is yellow, > 3 is red. Only the harmful direction counts.
- Hard RED triggers: ppCO₂ ≥ 7.6 mmHg (Flight Rule B17-5), optic disc edema, SpO₂ < 90 %, core temperature ≥ 39 or < 35 °C, glucose < 54 or > 250 mg/dL, BP ≥ 180/120 or SBP < 90, resting HR > 130 or < 40.
- Minimum-YELLOW triggers: ppCO₂ > 3.0, sleep efficiency < 89.2 %, PVT worst-10 % > 500 ms, glucose < 70 or > 180.
- **MFI** = mean of 5 sub-scores (HR 4 bpm, RMSSD 6 ms, PVT 45 ms, sleep efficiency 2 %, ppCO₂ 1.5 mmHg scales). ≥ 65 is red, ≥ 30 is yellow.
- NEWS2 bands are a clinical early-warning score **adapted** for healthy astronauts. They are used only as visual context; the brain's `alertLevel` always wins.

## Architecture
```
src/types        health.ts (domain), brain.ts (zod contract — brain v0.6)
src/data         astronauts, deterministic 4 × 180-day generator with scripted stories, zone knowledge,
                 brainSamples/ (real brain output captured per scenario, used by tests and the mock)
src/lib          triageEngine, protocols, scores, trend, brainMock, brainSocket, zoneLevels, flagZone,
                 simulator, environments
src/store        Zustand (ring buffer of 600 ticks, alerts, audit log, persisted protocol checks)
src/components   twin/, live/, panel/, scores/, charts/, alerts/, checkin/, views/, layout/
scripts          mock-brain.ts (ws server)
```

## 3D anatomy model
`public/models/astronaut_anatomy.glb` (muscles, organs, skeleton) is generated by `scripts/blender/build_anatomy.py` from the
**Z-Anatomy** atlas — © Lluís Vinent and contributors, [z-anatomy.com](https://www.z-anatomy.com), licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), itself based on **BodyParts3D** © The Database Center for Life Science
(DBCLS), CC BY-SA 2.1 JP. Changes: selection of structures, re-posing of the limbs to the A-pose body, recolouring, merging per body
zone and polygon reduction. The derived model is distributed under **CC BY-SA 4.0**.

Rebuild (Blender 4.2+):
```bash
blender -b --disable-autoexec Startup.blend --python scripts/blender/build_anatomy.py -- --out public/models/astronaut_anatomy.glb
```
`Startup.blend` is inside `Z-Anatomy.zip` from https://github.com/Z-Anatomy/Models-of-human-anatomy.

## References
NASA-STD-3001 Vol. 1 & 2 · OCHMO-TB-004 (CO₂) · NASA Human Research Program risks (nasa.gov/hrp) · CSA "Radiation in space" · NEWS2 (Royal College of Physicians).
