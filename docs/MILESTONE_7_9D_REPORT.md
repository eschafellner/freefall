# FREEFALL 7.9D · Cooperative mission balance

**Release acceptance remains open.** The server matrix reached 77 authoritative `MissionResult`s across all four planets and party sizes, with 73 extractions and four team wipes. The 72 regular Normal routes took **58.2–223.3 seconds**, with a median of **131.1 seconds**. An 18-minute exposure fixture exercised longer mission state and finished in 19:25.3. Representative human pacing and fairness remain untested. The shipped registry stays on `390e375eec0bf943` after the relay-duration trial.

## 1. Repository audit

| Prior milestone | Verified implementation and acceptance evidence |
| --- | --- |
| 7.2A | The checked-in JSON definitions, schema, cross-reference validation, immutable registry, resolver, balance traces, and client/server version exchange are active. [Balance architecture](BALANCE_ARCHITECTURE.md) |
| 7.4 | Enemy navigation, attacks and the five-phase Director run under the encounter, spawn and occupancy budgets. Human combat acceptance and target-device performance approval were open in the report. [7.4 acceptance](MILESTONE_7_4_FINAL_ACCEPTANCE.md) |
| 7.5 | The generator, plan validation, DAG runtime and shared plan replication exist. Prior technical completion covered four peers. The long-run performance gate was blocked and human acceptance was open. [7.5 acceptance](MILESTONE_7_5_FINAL_ACCEPTANCE.md) |
| 7.6 | The four generated profiles supply heightfields, geometry, locations and collision to the actual server runtime. The client reconstructs the same world identity. The prior implementation report left manual and visual acceptance open. [7.6 acceptance](MILESTONE_7_6_FINAL_ACCEPTANCE.md) |
| 7.7 | Weather and atmosphere are installed on deployment from the procedural identity. The latest report included accelerated missions and audio/render evidence. Human audio and target-device approval were open. [7.7 acceptance](MILESTONE_7_7_FINAL_ACCEPTANCE.md) |
| 7.8 | Server-confirmed combat effects, presentation event deduplication and reconnect operate in the current runtime. The report marked aggregate acceptance open. [7.8 acceptance](MILESTONE_7_8_FINAL_ACCEPTANCE.md) |
| 7.9A | The local weapon and audio work is present. 7.9A.2 identifies measurements and a controlled Kestrel change. Human A/B and normal 20–30-minute resource validation remain untested. [Weapon balance](COMBAT_BALANCE_7_9A_2.md) · [Weapon audio](WEAPON_AUDIO_7_9A.md) |
| 7.9B | The local registry ships the Schabe windup and Director PEAK profile from 7.9B. Its technical report records automated and rendered stress evidence. The human gameplay gate remains untested. [7.9B report](MILESTONE_7_9B_REPORT.md) |
| 7.9C | The local posture, queue, hitbox and presentation changes are present and covered by current tests. Human control and survivability acceptance remains untested. [7.9C report](MILESTONE_7_9C_REPORT.md) |

| Area | Authority and location |
| --- | --- |
| World and mission identities | `WorldGenerator.ts`, `PlanetProfiles.ts`, `MissionGenerator.ts`, `proceduralMissions.ts`, and `missionPlan.ts` supply separate world and mission seeds, versioned templates and a frozen plan. The current world and mission generators are v1. The mission seed uses a salt that includes the registry hash. |
| Placement, validation, retry | `MissionLocations.ts` provides openness, reachability and deployment checks using `GroundNavigation.ts`. `MissionGenerator.ts` validates the DAG, required placements, extraction approaches and spawn regions, allows up to 12 attempts, and exposes rejection reasons. A validated authored fallback is registered for Dev’ Ault. Selection on the four procedural planets reports a generation failure when attempts are exhausted. |
| Runtime and results | `MissionInstance.ts` owns boarding, deployment, objective availability, extraction and settlement. `ObjectiveManager.ts` checks prerequisites, presence, nest destruction, idempotent completion and final objective states. The result settles once, with per-operator rewards and existing partial-extraction rules. |
| Replication, briefing and HUD | `FreefallRoom.ts` authorizes operations and sends mission state, plan and event streams. `Match.ts` joins plan references to snapshots. `App.tsx`, `MissionHud.tsx`, `MissionPresentation.ts` and `MissionMarkers.ts` display briefing, progress, notices, failures and available objectives. `Battlefield.ts` and the client timelines retain prediction, reconciliation and remote interpolation. |
| Enemy pressure and standing forces | `EncounterDirector.ts`, `HordeDirector.ts`, `SpawnManager.ts` and `PatrolManager.ts` arbitrate authored patrols, alarms, validated emergence, extraction pressure and dynamic waves. `SwarmNestManager.ts` owns nests and their spawn lifecycle. `Convicts.ts` owns the finite NPC squad that disembarks and covers Albatross, with difficulty-resolved kits, hit points, firing, reloads and permanent casualties. |
| Resupply and extraction | `Albatross.ts`, `Resupply.ts`, `equipment.ts` and `ExtractionSystem.ts` handle the vehicle, shared containers, interruption-safe equipment actions and the two extraction strategies. `MissionInstance` gives authenticated inputs to these systems and builds `MissionResult`. |
| Operator lifecycle | `FreefallRoom.ts` owns room capacity, host handoff and reconnect. The roster freezes at deployment. A disconnected player’s pending actions and targeting are cleared. Connection recovery reuses the existing player and sends current authoritative state. A new identity cannot join mid-mission. |
| Registry, prior telemetry and test infrastructure | `packages/shared/src/balance/` freezes effective settings. `systems/telemetry.ts` records combat and optional movement counters. `FixedLoop.ts`, the benchmark command, browser scripts and Node test suite provide timing, encoding, memory and network probes. |

The audit found a diagnostics gap. Generated-world rejection returned before logging the failure when a fallback was unavailable. 7.9D reports the rejection before returning, including both selected seeds and the source registry hash when available.

## 2. Baseline configuration

- Source `ffc81913055f9673ffb55fa027b7488ef0ec9d71` with pre-existing local 7.9A–C changes. The existing local state passed 357/357 tests before 7.9D. The starting source fingerprints for `Battlefield.ts`, `systems/combat.ts` and `systems/telemetry.ts` are `283bad95c92d6fd54f4f8ae07a777b3dc168c7f0fa5bb66605512b85698a5888`, `fe9ae97fa5a646cf51e6a17a7ab174e565e1d8dbc8ae2e00e94a74089bea00dc`, and `43d8d255aa914e3b8e12578452f2beac5e0e69c166d7139aa2538693718ee1d5` respectively.
- Build `0.1.0`, registry `7.9B`, schema 2, hash `390e375eec0bf943`. The snapshot is the captured working baseline. Its SHA-256 is `399f66da5d661cadb8c2edbfe691a2fb60aa6b15fde5521fa5f04c871e170390`. [Loadable registry snapshot](playtest/7-9d/baseline-registry.json)
- The script uses simulation seed `51296`, 30 Hz simulated time, and the observed world/mission seed pairs in section 8. The normal routes board, deploy, use movement and combat inputs, interact and extract through the production mission runtime. Tests use direct in-process connections for this matrix. The separate network suite uses WebSockets.

| Setting | Baseline |
| --- | --- |
| Operator and equipment | 100 HP, 5.8 m/s walk, 9.2 m/s sprint, Kestrel 45 rounds and eight reserves, P-01 12 rounds and four reserves, two grenades and five stims that heal up to 40 HP each. |
| Normal opposition | 200 active enemy cap, 360 HP nest, 202-tick base nest spawn interval, four Convicts with the `field-standard` kit. FREEFALL resolves a 1,000-enemy cap, 450 HP nests and the `minimum-issue` kit. |
| Director | CALM 27–33 s, BUILDUP 6 s, ASSAULT 8–20 s, PEAK 7–12 s and RECOVERY 16–30 s under eligible conditions. Wave bounds 4–42 enemies with 0.24 added to the wave scale per additional living, connected operator. Encounter holds, pressure and budget can interrupt a phase or prevent a wave. |
| Objectives | Generated relay defense requires 8 s of presence from any living grounded operator in range. Relay Chain unlocks its second relay after defense. Nest Purge requires destruction of the designated nest. The relay templates can supply an optional nest. |
| Resupply | Two containers of four charges, 2.2 m interaction range and 1 s interaction. A use gives up to two primary magazines, one secondary magazine, one grenade and two stims, capped by carry capacity. |
| Extraction and mission timing | Albatross uses 4 s to lift, then 2 s to settle. Balloon uses 90 s, 3 s approach and 2 s lift. The plan’s early-pressure modifier multiplies the 6 s initial reinforcement pressure delay by 0.65 when selected. Boarding includes a 3 s ready countdown. `MissionResult.durationTicks` starts at `MissionStarted` on departure and ends at settlement. |

## 3. Mission duration and pacing

The existing baseline suite completed 11 scripted generated routes in 44.2–206.1 seconds. The expanded matrix exercises live combat with seeded movement and firing decisions. It produced the following deployment-to-result distributions. [Full mission data](playtest/7-9d/mission-matrix.json) · [77 matching deterministic replays](playtest/7-9d/matrix-replay.txt)

| Cohort | Runs | Extractions / failures | Minimum / median / P95 / maximum |
| --- | ---: | ---: | --- |
| Regular Normal | 72 | 72 / 0 | 58.2 / 131.1 / 216.8 / 223.3 s |
| Extended Forest Normal | 1 | 1 / 0 | 1,165.3 s, including 1,080 s of planned exposure near deployment |
| Forest FREEFALL Nest Purge | 4 | 0 / 4 | 57.4 / 59.0 / 99.9 / 99.9 s |

Percentiles use nearest rank. In the regular matrix, deployment took 8.3 s. The approach took 16.8–50.5 s. Nest interaction and firing took 1.1–1.5 s once in position. A defended relay accumulated 8 s of staffed time. Inter-objective travel reached 28.4 s. Extraction travel took 1.3–56.1 s. The eight resupply detours included movement and deliberate reloads and took up to 29.6 s. Final extraction and settlement took 6 s by Albatross or 95 s by balloon. The route controller recorded stages separately from authoritative combat events. Telemetry observed 0–5.9 seconds per run with a confirmed operator combat event on that tick. Combat contact can last through ticks without a hit or a shot.

All five Director phases occurred in the normal matrix. CALM accounted for 85% of measured Director ticks. All 48 observed wave endings were interrupted, with 38 yielding to defense and ten to reinforcement. Existing force and extraction pressure remained active. The extended run reached the 200-enemy cap and recorded 12 wave starts. The team spent 1,096 seconds stationary without operator combat events, so the run primarily measured extended server and mission state.

**Interpretation.** Fast direct routes, short objective holds and uneven combat interruptions explain the low scripted duration. The 16-second relay trial adds seconds to comparable routes. It cannot account for the roughly 16–19 minutes between the regular maximum or median and the design target.

## 4. Cooperative scaling

| Operators | Regular Normal runs | Median duration | Median / maximum rounds fired by team | Peak active enemy range | Extracted / deployed operators |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | 122.2 s | 21 / 177 | 41–96 | 20 / 20 |
| 2 | 16 | 131.1 s | 23 / 167 | 43–96 | 32 / 32 |
| 3 | 16 | 131.1 s | 26 / 170 | 43–96 | 48 / 48 |
| 4 | 20 | 166.5 s | 68 / 181 | 43–98 | 76 / 80 |

Nest Purge adds more Albatross runs to the solo cohort and more balloon runs to the four-operator cohort. Compare the same route, world, mission seed and extraction in the matrix to isolate party size. For example, Forest World `76` and Mission `20` Relay Chain with balloon took **222.7, 217.7, 216.7 and 216.4 s** for parties of one through four. Normal technical viability held at every size. In FREEFALL, the fixed Forest Nest Purge strategy wiped at every size after completing its primary objective. Two teams wiped during the resupply detour and two while moving to the pickup site. This single replayed seed is evidence of a difficult route for this controller. Player skill, approach choice and squad tactics need human comparison.

The runtime derives live wave scale from connected living operators, giving 1.00/1.24/1.48/1.72 at full strength. An in-flight wave may reduce the unspawned budget when party strength drops. Already-spawned enemies, active objectives and supply charges persist. Player count has no direct multiplier on cockroach health or damage.

## 5. Objective balance

- **Relay activation and defense.** Normal routes reached every required relay tested, and one operator could start and staff a defense. Existing tests cover the contested relay, paused and resumed presence clock, sequential unlock, duplicate requests and damage or disconnect during a hold. The single staffed objective duration is authored centrally. [Procedural mission tests](playtest/7-9d/procedural-mission.txt)
- **Schwarmnester.** The normal primary nest objectives completed across all four biomes with confirmed shots. The runtime matches the destroyed structure to the objective location, records destruction once and stops its spawns. The synchronized-throw regression applies damage from three operators before settling one nest. The exact-one assertion also covers the transition into extraction availability and `MissionCompleted`. [Regression output](playtest/7-9d/regression.txt)
- **Convict Defense.** The existing NPC defense protects the deployment area, with survival recorded in `MissionResult`. Relay defense supplies the timed objective. The 72 normal routes recorded 1,512 Convict shots, 504 Convict kills and all four Convicts alive at settlement in each run. Focused tests exercised finite kits, fire cadence, fatal melee and permanent casualties. The rendered 1,000-enemy fixture also recorded Convict damage and casualties. [Regression output](playtest/7-9d/regression.txt) · [Forest browser data](playtest/7-9d/forest-browser.json)

## 6. Resource economy

Normal routes fired 4,434 rounds, started and completed 56 reloads, discarded 225 rounds through Tactical Reload, and completed five stims. Eight resupply transactions each restored one primary magazine and used one shared container charge. The controller used zero grenades in that cohort. The four FREEFALL routes threw four grenades and completed two resupplies, receiving two primary magazines and two grenades in aggregate. The first-depletion clocks and ending inventories are available per slot. Normal ranged combat required no sidearm ammunition in the sampled routes.

Server and network probes cover availability while damaged or grounded, range, interruption, an empty container, concurrent use of the last charge, grants capped by inventory and reconnect without duplicate transactions. The two high-pressure wipes during the return to Albatross make resupply route risk a human test priority. Both the approach and use matter when evaluating whether eight shared charges are enough. [Mission matrix](playtest/7-9d/mission-matrix.json) · [Regression output](playtest/7-9d/regression.txt)

## 7. Extraction

| Strategy | Authority, failure and result | Measured normal routes |
| --- | --- | --- |
| Albatross 02 | A living grounded operator in the airworthy cabin requests launch. Other operators in position secure individually. The server rechecks stance, proximity, connection and vehicle airworthiness before capture. A failed or empty start returns to the available state. | 36 settlements, 6 s from activation to result and zero operator HP lost to enemies during that window. |
| Rescue balloon | A living grounded operator triggers the validated pickup zone after objectives. Operators secure inside the 25 m tether. The server promotes the next secured operator on early drop. A missed pickup starts another pass at the same balloon. Captures persist through a disconnect after lift. | 36 settlements, 95 s from activation to result. The Forest Nest Purge recorded 300 HP of enemy damage during the balloon window and extracted three of four. In Ice Nest Purge, the three deaths preceded balloon activation. |

Both routes produced valid results at every party size. Objective locks, a damaged or empty Albatross, a missed balloon pass and reconnect before and after capture were also exercised. The protected Bodenbruch benchmark completed four-player balloon recovery with 1,000 active enemies in 2,834 of 2,850 extraction ticks. [Mission matrix](playtest/7-9d/mission-matrix.json) · [Recovery benchmark](playtest/7-9d/benchmark.txt)

## 8. Planet compatibility

| Planet | World seeds for Relay Defense / Relay Chain and Nest Purge | Normal runs | Minimum–maximum duration | Tracked lead route length |
| --- | --- | ---: | ---: | ---: |
| Green Plains | 76 / 17 | 18 | 58.2–223.3 s | 356–960 m |
| Desert | 31 / 32 | 18 | 61.9–210.7 s | 390–915 m |
| Ice | 48 / 49 | 18 | 65.2–193.7 s | 394–1,000 m |
| Forest | 63 / 76 | 18 | 61.4–222.7 s | 362–960 m |

Mission seeds are `0`, `20` and `4` for Relay Defense, Relay Chain and Nest Purge. Each relay template was run on each planet with one through four operators and both extraction methods. Nest Purge added solo Albatross and four-operator balloon runs per planet. The lead route distance records actual movement, including modeled detours. Generator tests verified deterministic identity, validator tamper rejection, 512 Dev’ Ault mission seeds across seven difficulties and 100 world seeds per procedural planet. Terrain traversal and objective, resupply and extraction access worked on the exercised routes. Forest additionally exercised low visibility and rendering stress. [Regression output](playtest/7-9d/regression.txt)

## 9. Implemented changes

| File | Purpose |
| --- | --- |
| `apps/server/src/mission/MissionTelemetry.ts` | Bounded counters for authoritative mission state ticks, objective timings, party transitions, movement, combat, resources, Director and extraction. Captures phase samples and received enemy damage without retaining per-enemy or per-tick timelines. |
| `apps/server/src/mission/MissionInstance.ts` | Hooks telemetry into existing deployment, stepping, interaction, extraction and reset paths. Emits complete failure diagnostics for generation. |
| `apps/server/src/rooms/FreefallRoom.ts` | Enables local or deployed server measure mode via `FREEFALL_MISSION_TELEMETRY=1`. Logs one summary with the existing result when each measured mission settles. |
| `apps/server/test/procedural-mission.test.ts` | Verifies measured state totals match `MissionResult.durationTicks`, defended time matches the objective clock, the lift is recorded, and result, reconnect and cleanup counts stay consistent. |
| `scripts/measure-mission-balance.ts` | Reproduces the 77 missions with seed, balance, time, result and performance evidence. Allows filtering cases and loading isolated registry snapshots. |
| `docs/MILESTONE_7_9D_REPORT.md` and `docs/playtest/7-9d/` | Release-gate assessment, baseline and raw evidence. |

Telemetry is opt-in and stays on the server. Ground movement and stationary ticks are observational proxies. `stateTicks` covers deployment through settlement, and resupply operator ticks can overlap among players. Combat counters use server-confirmed actions. Each resource records the first ground tick at zero for each living operator.

## 10. Balance change table

| Parameter | Previous value | New value | Reason | Measured result |
| --- | --- | --- | --- | --- |
| `swarm.missionGeneration.relayDefenseSeconds` | 8 s | Trial 16 s. Shipped 8 s. | Test whether a longer existing hold adds pressure and helps the pacing shortfall. | 16/16 Albatross extractions on trial hash `8c72af9a81a8ed0c`. On the eight matching required routes in Green Plains and Forest, total time rose 7.9–8.8 s and enemy damage to operators stayed at zero. Desert and Ice picked different relays under the trial hash and are excluded from that paired estimate. The longer hold was rejected. |

The registry hash is an input to placement, so the matched comparison uses the same required objective location and lead route length. Secondary placements and spawn regions can still differ. All authoritative values in the shipped profile retain the baseline hash. [Trial runs](playtest/7-9d/relay-defense-16-trial.json)

## 11. Multiplayer validation

The full regression suite opened four real peer connections, rejected a fifth, transferred host, synchronized deployment and restored an in-flight balloon rescue state. Four peers saw the same plan, contested relay progress and resulting extraction in generated Green Plains and fixed Dev’ Ault tests. Drop and reconnect during active combat restored the same session, including two reconnects at the 1,000-enemy cap. Server-side tests exercised resupply interruption, supply restoration, balloon takeover and a failed result that stayed settled after reconnect.

The Colyseus suite simulated 140 ms RTT. Client tests also exercised ordered jitter with a queued stall, duplicate and late snapshots, and omitted application events. Physical transport-level packet loss and representative WAN missions remain untested. [Regression output](playtest/7-9d/regression.txt)

## 12. Test results and reproduction

| Command | Observed outcome |
| --- | --- |
| `npm test` | 357/357 before and after. The initial sandbox run hit `listen EPERM` on `127.0.0.1`. Runs with local socket access passed, including objective, resupply, multiplayer and reconnect tests. [Final output](playtest/7-9d/regression.txt) |
| `npm run typecheck` | All three workspaces passed. |
| `npm run build` | Production build passed with the existing Vite main-chunk size warning. [Build output](playtest/7-9d/build.txt) |
| `node --conditions=development --test --test-isolation=none apps/server/test/procedural-mission.test.ts` | 20/20, including generated mission, objective, result, reset and 1,000-enemy objective transition tests. [Output](playtest/7-9d/procedural-mission.txt) |
| `npm run balance:check`, `npm run balance:trace`, `sha256sum --check docs/enemies/schabe/baseline.sha256`, `git diff --check` | Registry valid, all eight gameplay traces matched, all three cockroach reference hashes matched, and whitespace checks passed. |
| `NODE_TEST_CONTEXT=1 npm run benchmark -- mission 900 421337 4 director` | All scenarios completed. Cap, balloon recovery and release to `CARRIER_HUB` verified. [Output](playtest/7-9d/benchmark.txt) |
| Scripted mission matrix and replay below | 77 results with identical repeated durations, outcomes, gameplay counts, objectives and ending inventory. [Replay comparison](playtest/7-9d/matrix-replay.txt) |
| Human playtests | NOT TESTED. |

```bash
export FREEFALL_SOURCE_REVISION=$(git rev-parse HEAD)
node --conditions=development scripts/measure-mission-balance.ts /tmp/mission-matrix.json '.*' docs/playtest/7-9d/baseline-registry.json
node --conditions=development scripts/measure-mission-balance.ts /tmp/mission-replay.json '.*' docs/playtest/7-9d/baseline-registry.json
node --input-type=module -e 'import {readFileSync,writeFileSync} from "node:fs"; const x=JSON.parse(readFileSync("docs/playtest/7-9d/baseline-registry.json","utf8")); x.swarm.missionGeneration.relayDefenseSeconds=16; writeFileSync("/tmp/relay-defense-16.json",JSON.stringify(x))'
node --conditions=development scripts/measure-mission-balance.ts /tmp/relay-defense-trial.json 'relay-defense.*albatross$' /tmp/relay-defense-16.json
```

```bash
export PLAYWRIGHT_MODULE=/home/edgar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/home/edgar/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LIVE_MAX=1 \
FREEFALL_COMBAT_STEADY_POPULATION=1 FREEFALL_COMBAT_MOVEMENT=1 FREEFALL_COMBAT_LOAD=1000 \
FREEFALL_COMBAT_SAMPLE_MS=30000 FREEFALL_MISSION_TELEMETRY=1 \
node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/freefall-7-9d-forest
```

## 13. Performance

Host AMD Ryzen 7 9700X, 16 available logical CPUs, 63.9 GiB RAM, Linux `7.3.3-300.fc45.x86_64`, Node `24.18.0`. In-process bandwidth below estimates serialized payloads per recipient, excluding transport overhead. Browser HUD bandwidth is an application estimate. RSS includes other allocations in the harness process.

| Scenario | Actual active population | Server mean / P95 / P99 step | Other observations |
| --- | --- | --- | --- |
| Regular Normal complete matrix | Peak 41–98 | Per-run P95 0.02–0.07 ms and P99 0.03–0.16 ms | Largest per-run P95 for objective update 0.00026 ms and Director update 0.00110 ms. Median payload approximately 42 KiB/s. Peak sampled RSS 315 MiB. |
| Extended Forest run | Peak 200 | 0.082 / 0.137 / 0.145 ms | 19:25.3 simulation time, 59.6 KiB/s estimated payload per recipient and peak sampled RSS 319 MiB. |
| Bodenbruch saturation benchmark | 1,000 in 900/900 ticks | 0.811 / 0.843 / 0.863 ms | Estimated 154,296 B/s per client. Peak sampled RSS about 130 MiB. Separate protected extraction completed four pickups and returned to carrier. |
| Forest, four peers, 30 s rendered load | 995–1,000, cap in 898/902 measured ticks | 0.924 / 1.932 / 3.666 ms | Zero dropped steps. Chromium 153 and SwiftShader at 800 × 450 Medium, one rendered and three SDK clients. 22.5 FPS, frame P95/P99 66.8/83.4 ms, 130 draw calls in the HUD sample, four peak audio voices and approximately 199 kB/s HUD bandwidth. Node RSS about 668→700 MiB and browser JS heap about 27→32 MiB. |

Forest used World `76`, Mission `0`, FREEFALL, dawn ground mist, vegetation, combat audio, explosives, movement and a nest event. The harness replenished entities that the server simulated in combat. Normal mission transitions, supplies and both extraction strategies were measured in the complete routes and in focused server/network probes. The combined rendered objective, resupply and extraction run at sustained cap remains open, along with GPU memory and target-device frame budget measurements. [Browser report](playtest/7-9d/forest-browser.json) · [Terminal output](playtest/7-9d/forest-browser.txt) · [Complete mission metrics](playtest/7-9d/mission-matrix.json)

## 14. Release gates

| Gate | Status | Evidence |
| --- | --- | --- |
| D-G1 · Repository audit | PASS | Prior reports, sources and current working baseline verified. |
| D-G2 · Mission baseline | PASS | Loadable snapshot, 77 settled missions and an exact gameplay replay. |
| D-G3 · Cooperative difficulty | PASS | All four party sizes evaluated in Normal and matched FREEFALL probes. |
| D-G4 · Mission pacing | FAIL | All 72 regular missions under four minutes on the scripted routes. Target remains unverified for human play. |
| D-G5 · Procedural generation | PASS | Seed separation, versions, placement, validation and DAG tests passed. |
| D-G6 · Objective balance | NOT TESTED | Reachability, completion and presence passed technical probes. Human fairness and difficulty remain untested. |
| D-G7 · Schwarmnest integration | PASS | Valid primary completion on four planets, synchronized destruction and no duplicate progress. |
| D-G8 · Convict Defense | PASS | Relay presence tested. Convict deployment, combat, kits, casualties and result counts exercised. |
| D-G9 · Albatross Resupply | PASS | Capped actual grants, atomic charge consumption, cancellation and reconnect passed. |
| D-G10 · Albatross extraction | PASS | 36 regular completions and solo/co-op eligibility and cancellation tests. |
| D-G11 · Balloon extraction | PASS | 36 regular completions, partial results, repeat pass, reconnect and cap recovery tests. |
| D-G12 · Four-planet compatibility | PASS | 18 standard settlements per procedural planet and independent world seed sweeps. |
| D-G13 · Multiplayer authority | PASS | Four-peer shared state, reconnect, extraction and event deduplication passed. |
| D-G14 · Central Balance Registry | PASS | Baseline preserved, isolated trial hash reproducible, gameplay traces matched. |
| D-G15 · Performance | PASS | Complete-mission and actual 1,000-enemy server measurements, with a short rendered stress probe. |
| D-G16 · Cooperative gameplay acceptance | NOT TESTED | Human sessions are pending. |
| D-G17 · Regression | PASS | 357/357 tests, typecheck, build and protected cockroach reference checks. No introduced P0/P1 defect reproduced. |

## 15. Outstanding issues and human playtest plan

- Run the same seeded routes with solo, pairs, trios and four real operators, using both extraction methods and all four planets. Repeat with different seeds and rotate squad familiarity. Record source revision, balance hash, party size, both seeds and the plan ID for each result. Make note of pauses, disengagements and failed interactions using server ticks. Mark cut-short sessions separately from `MissionResult`s.
- After each run, record a short rating and timestamped examples for pacing, intensity, downtime, objective variety and clarity, solo or co-op difficulty, coordination, ammunition pressure, resupply, stim availability, extraction tension, duration, planet-specific play, fairness and whether the tester would play another mission.
- Examine the Ice resupply-to-pickup corridor, the Forest balloon hold and the FREEFALL return-to-supply route with different player positions. The controller favors direct routes, precise input and a fixed engagement distance. The recorded casualty counts describe that policy on the specified seeds.
- If normal human runs also finish far below target, the design decision is whether to increase meaningful objective work using existing templates or approve broader mission content changes. The duration experiment found little benefit from simply lengthening a hold. Any change to objective or extraction rules requires design approval.

## 16. Requirements for Milestone 7.9E acceptance

Use the resulting human mission traces to set pacing and difficulty acceptance. Execute a representative four-client Forest mission at approved rendering and transport budgets, with sustained server-simulated population, Convict and nest behavior, resupply, extraction and reconnect in the same run. Measure transport bytes, frame costs, GPU memory, audio and resources across multiple successive runs on target hardware. Keep the 7.9D seed matrix and loss/recovery cases as regression coverage.
