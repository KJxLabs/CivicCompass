# Civic Compass

An interactive, mobile-friendly Level 2 wayfinding experience for Marin County Civic Center visitors traveling from the **North Arch**, **Center Arch**, or **South Arch** to:

- **Room 208** — County Assessor
- **Room 232** — County Recorder / Official Records
- **Room 234** — County Clerk / Marriage Licenses

Visitors click their arch directly on the 3D site model, choose a room, and receive a highlighted route through the building. On phones, the interface keeps the map full-screen and presents the current task in a compact bottom sheet. “Guide Me” presents one concise instruction and one matching landmark photo at a time beside a locked 3D view of the instruction’s actual floor.

## What is included

- Rotatable and zoomable Three.js model of the Civic Center
- Clickable arch markers with keyboard-accessible button alternatives
- Large, labeled, pulsing 3D arrows above the roofline that point down to each selectable arch
- Level 2 room sides and order registered to the supplied annotated structure
- Compact numbered boxes for every annotated Level 2 room and the ATM
- Elevator-aware shortest-path routing
- Correct public elevator service: Elevator 1 serves Levels 1–4; Elevator 3 serves Levels 2–4
- South Arch guidance via Elevator 1 on the left, with the straight-ahead escalator identified as the Level 2 alternative
- An East-up first-load camera on mobile and desktop that keeps all three clickable arch markers in view
- A map-first mobile workflow with a persistent progress header and thumb-friendly bottom-sheet controls
- Mobile destination choices shown immediately beside the map after an arch is selected
- A compact mobile route summary with one primary “Start guidance” action and automatic orientation-change reframing
- 3D route overview, floor-plan view, and guided step mode with a 90-degree-left cutaway that automatically switches floors and zooms to each active turn
- A dimmed full route plus high-contrast flowing arrows on the active walking segment, ending at a labeled elevator target when a vertical transfer is next
- Elevator-transfer steps that suppress hallway arrows and focus only on the correct elevator bank and destination floor
- Real photos for each arch, destination, passage, and elevator bank
- Turn-specific direction arrows and uncropped 3:4 landmark images
- Guide Me in Step 3 of the top workflow ribbon
- Mobile step sequencing that automatically brings the current task into view and collapses inactive steps
- Read-aloud instructions using the browser speech API with a preferred female English voice when the device provides one
- WCAG-oriented readable typography, reduced-motion behavior, semantic step state, and visible keyboard focus states
- Automatic GitHub Pages deployment workflow

## Run locally

```bash
npm ci
npm run validate
npm run build
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. The 3D renderer loads Three.js from `esm.sh`, so an internet connection is required on first load.

## Publish on GitHub Pages

1. Create a new GitHub repository and upload this project.
2. Push it to the `main` branch.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. The included workflow builds and publishes the site automatically.

## Project structure

```text
src/index.html             Complete application and routing model
src/assets/                Arch, elevator, passage, room, and reference images
scripts/build.mjs          Dependency-free static build
scripts/validate-wayfinding.mjs  Direction and route regression checks
.github/workflows/         GitHub Pages deployment
.openai/hosting.json       ChatGPT Sites hosting configuration
```

## Verified direction rules

| Entrance | Left | Ahead | Right |
| --- | --- | --- | --- |
| North Arch | Elevators 7 & 8 | — | Stairs F |
| Center Arch | Elevators 5 & 6 | — | Stairs D |
| South Arch | Elevator 1 | Escalator | Stairs |

| Route | Room side at arrival |
| --- | --- |
| North or Center Arch → 208 | Right |
| North or Center Arch → 232 | Right |
| North or Center Arch → 234 | Right |
| South Arch → 232 | Left |
| South Arch → 234 | Left |

These owner-verified rules are enforced by `npm run validate` before every build.

## Level 2 room layout — canonical East-up view

- Administration upper band, Rotunda to terminal: 225, Elevator 3, 219, 217, Stairs B, 209, 205, Stairs A
- Administration lower band, Rotunda to terminal: Elevator 1, 208, 202, 200
- Hall upper band, Rotunda to terminal: 233, ATM, Elevators 5 & 6, 241, 245, 247, 251, 255, Elevators 7 & 8, 263, 265
- Hall lower band, Rotunda to terminal: Stairs C, 232, 234, 236, Stairs D, 244, 246, 248, Stairs E, 260, Stairs F, 266, 271, 275

All of these rooms appear in the Level 2 model. Public route selection remains intentionally limited to Rooms 208, 232, and 234.

## Updating the Level 2 model

`LEVEL2_PLAN_REGISTER` inside `src/index.html` is the single source of truth for upper/lower-band room, stair, and elevator placement. `LEVEL2_PRECISION` supplies its corresponding coordinates. Because the Hall and Administration wings have opposite handedness in the East-up view, never assume the same local-axis sign means “upper” on both wings. Keep room nodes connected as leaves of the walking graph so a route never cuts through a room.

## Production readiness notes

Before broad public release, obtain Facilities review of the modeled entrances, elevator access, room-door positions, and current public circulation rules. Temporary closures and elevator outages are not represented. The application is an orientation aid and is not an emergency evacuation map.

© 2026 Komal Joshi, Business Systems Analyst, ARCC, County of Marin. All rights reserved.
