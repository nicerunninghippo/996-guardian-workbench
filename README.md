# 996 Guardian — Automation Workbench

A browser workbench for automation that can explain and recover from a failed step. Derived from real development of the Windows 996 Guardian assistant, this project ports its route priorities, verified arrival gates, bounded waits and instance separation into a reproducible simulator.

**Status:** preparation build for TestSprite Season4. The entry has not yet been submitted. TestSprite runs and GitHub PR evidence will be linked only after they actually exist.

## Live application

Intended hosting URL: https://guardian-workbench-s4.lucky-crane-6426.chatgpt.site
Deployment is being prepared; see docs/submission-status.md for verified state.

## Try it

1. Select Agent01 and start the guardian. Use +10s or +60s to advance the virtual clock.
2. Load Primary entrance missing and start again. After60s of searching the first route, the policy cools it down and attempts the next eligible route.
3. Load Entry without arrival. A single entry has a25s total budget and does not gain another spending allowance just because feedback timed out.
4. Switch to Agent02. Coordinates, virtual time, retries and evidence stay separate.
5. Export JSON, then Import replay. The same commands and timestamps reconstruct the same decisions.

The simulator also checks countdown-based BOSS selection, token budgets, blank-area reward dismissal and verified Automatic mode. Resources and combat outcomes are simulated, clearly labeled in the interface.

## Scope and provenance

- Browser policy is in dist/engine.js; the UI uses this same module.
- docs/reference/MapRouteCatalog.cs is the original GuardianV4.19.12 route policy used as a design reference. The browser engine is a port, not a Windows executable running remotely.
- Node tests exercise deadlines, spent budgets, level eligibility, exact-arrival admission, isolation, replay, task ordering and BOSS rotation.
- TestSprite covers the real deployed browser controls and outcomes. The planned suite is docs/testsprite-test-plan.md; local unit checks do not constitute TestSprite evidence.
- The existing Windows release had206 offline checks. That number describes a separate project and is not this workbench's test count.
- This repository contains authored code and a synthetic scene, without game artwork, real account data, private logs or OS control credentials.

## Run locally

Node22 or newer; no runtime dependencies or install step.

```sh
npm run check
npm test
npm start
```

Open http://127.0.0.1:4173. Local preview is for development; competition testing uses the public URL.

## CI and TestSprite

The engine workflow runs on pushes and PRs. TestSprite integration will use its official GitHub App or GitHub Actions after the portal suite is generated. A working deployment must precede suite generation. No API keys belong in the repository.

Submission requires a public repository, live URL, real TestSprite PR check and a Discord post. Schedule and requirements: https://www.testsprite.com/hackathon-s4 . Currently published project window: Oct16–22,2026, closing23:59 Pacific; final schedule is confirmed in the official Discord.

## Verification limits

This demo verifies scheduling and simulator decisions. It does not verify OCR accuracy, OS click delivery, real combat or external resource availability. Browser configurations are stored locally; this version is not a centralized device-control service.
