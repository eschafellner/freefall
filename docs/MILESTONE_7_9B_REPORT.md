# FREEFALL 7.9B Enemy Difficulty and Horde Director Balance

Two Central Balance Registry changes are implemented. Schabe melee gives operators 100 ms more warning and a dynamic wave stays in PEAK for at least seven seconds under low pressure. The release is `7.9B`, schema 2, hash `390e375eec0bf943`. All 347 automated tests passed. Four Chromium clients shared 1,000 live enemies during the Forest attack sample. **Gameplay acceptance is NOT TESTED.** Human sessions and representative completed 20–30-minute missions are still needed.

## 1. Repository audit

The 7.4E report documents implemented 7.4A–E systems with open human telegraph and target-device acceptance. The working tree also contains 7.9A.1's sampled Kestrel/P-01 weapon bank and 7.9A.2's Kestrel recoil recovery at three ticks. The 7.9A.2 report and current registry agree on hash `8cf1c12067347de6`. That revision was available as a reproducible technical baseline. Human A/B weapon balance and full-mission resource economy were already open. [7.4E acceptance](MILESTONE_7_4_FINAL_ACCEPTANCE.md) · [7.9A.1 report](WEAPON_AUDIO_7_9A.md) · [7.9A.2 report](COMBAT_BALANCE_7_9A_2.md) · [Weapon audio catalogue code](../apps/client/src/audio/WeaponAudioCatalog.ts)

| Area | Implementation verified in source |
| --- | --- |
| 7.4A Target selection | Arena chooses per enemy by distance with commitment and switch hysteresis. Missions use group perception, noise, last-known position, line of sight, reachability and target life identity. Reconnect drops stale attack bindings and preserves the mission roster and current life. [Target selection](../apps/server/src/systems/enemyTargeting.ts) · [Patrol states and target binding](../apps/server/src/mission/PatrolManager.ts) |
| 7.4B Navigation and swarm coordination | Direct corridors, shared distance fields, limited local neighbor/contact scans, attack ring sectors and world collision. Progress monitoring drives bounded clearance, cooldown and retry stages. Invalid-origin repair is an emergency recovery path. [Ground navigation](../apps/server/src/mission/GroundNavigation.ts) · [Steering and collision](../apps/server/src/systems/horde.ts) · [Separation grid](../apps/server/src/ecs/UniformGrid.ts) · [Approach slots](../apps/server/src/ecs/EnemyApproach.ts) · [Stuck detection and recovery](../apps/server/src/ecs/EnemyNavigation.ts) |
| 7.4C Enemy combat | The server commits facing, target object and life, reserves an attack sector and runs WINDUP, ACTIVE and RECOVERY. Active ticks revalidate posture volume, angle, reach, cover and target identity. It consumes one hit before applying damage. Damage uses the current faction policy, removes dead Schaben from the active list and emits an authoritative operator hit event. Convicts and Albatross use secondary contact validation. [Enemy combat](../apps/server/src/ecs/EnemyCombat.ts) · [Damage and death](../apps/server/src/systems/combat.ts) · [Entity lifetime](../apps/server/src/ecs/HordeManager.ts) |
| 7.4D Director | Five phases, seeded wave groups, hysteresis, capacity reservation, aborts and recovery. Mission phase, relay defense, resupply, nest destruction and higher-priority reinforcements gate dynamic waves. [Director](../apps/server/src/mission/HordeDirector.ts) · [Mission priorities](../apps/server/src/mission/EncounterDirector.ts) |
| 7.4E Spawning and instrumentation | Mission spawns share candidate, capacity and initialization budgets. Candidate gates cover terrain, structures, posture clearance, occupancy, conservative visibility for each living observer, and connectivity. Authored nest emergence uses an announced exit. Arena refill uses its separate bounded ring. Server already tracks combat, routes, spawn, Director and step metrics. [Spawn manager](../apps/server/src/mission/SpawnManager.ts) · [Arena encounter](../apps/server/src/simulation/ArenaEncounter.ts) · [Simulation counters](../apps/server/src/simulation/Battlefield.ts) |
| Replication and mission integration | Authoritative 30 Hz simulation and 10 Hz binary horde frames with existing attack-start and timing fields. Client interpolates poses and de-duplicates presentation. The room sends current mission and Director state on reconnect. Mission progression owns objectives, Convict Defense, Albatross containers, both extraction types and MissionResult. [Room and reconnect](../apps/server/src/rooms/FreefallRoom.ts) · [Horde frames](../apps/server/src/networking/snapshots.ts) · [Attack pose](../apps/client/src/rendering/EnemyAttackPose.ts) · [Mission lifecycle](../apps/server/src/mission/MissionInstance.ts) |

## 2. Baseline configuration

Source revision `ffc81913055f9673ffb55fa027b7488ef0ec9d71` with the pre-existing, uncommitted 7.9A.1/A.2 changes present at task start. The full versioned baseline input is loadable with `createBalanceRegistry` and includes raw enemies, swarm, all difficulties, structures, operator, movement, combat policy, weapons, supplies and equipment. The current registry was compared field by field to this snapshot. [Baseline registry](playtest/7-9b/baseline-registry.json)

| System | Baseline values |
| --- | --- |
| Schabe | 48 HP, 3.55 m/s movement, 0.68 m hit radius, 0.72 m attack/hit height, 1.45 m reach, 8 HP damage, 1.3 s cooldown, 31 m base detection. No standalone Schabe acceleration parameter. Steering response 14 and turn rate 10 govern existing motion. |
| Attack | 11/3/8 ticks windup/active/recovery at 30 Hz, 60° half-angle, 2-tick decision interval, 0.25 m vertical attack half-height. |
| Target stability | Arena target interval 6 ticks, commitment 30 ticks, required 2 m absolute and 0.8 relative distance improvement. Mission perception 6 ticks, 9 m close awareness, 0.24 patrol FOV dot, 6 s contact memory. |
| Movement and recovery | Steering every 2 ticks, 1.65 m separation radius with 8 neighbors, 32 contact candidates per cell, steering/contact strengths 0.95/1.35, 0.37 m ground radius, attack ring fraction 0.78, spacing 0.74 m, approach range 6 m. Route refresh 12 ticks or 0.7 m goal displacement, 144 requests and 2 field builds per tick, 32 cached fields, 5 m grid, 18-tick stuck detection at progress ratio 0.15, 3 recovery retries, 45-tick cooldown. |
| Director timing | CALM 810 + 0–180 ticks, BUILDUP 180, ASSAULT 240–600, PEAK 120–360, RECOVERY 480–900. |
| Director pressure | Samples every 15 ticks, smoothing 0.25, start at ≤0.42 and pause at ≥0.68. Weights for population/nearby/attacks/weakness/recent damage/casualties are 0.25/0.40/0.15/0.25/0.35/0.35. |
| Director waves and spawn limits | 4–42 wave enemies within available capacity, group size 2–5, +0.24 wave scale per additional living connected operator, ±20% budget jitter, 60/6 tick group/member scheduling, 16 retries per group, 32 total and 4 dynamic validations per tick, 24 slots of priority headroom. Dynamic candidates require 27 m clearance to living bodies and a reachable operator within 125 m. |
| Difficulty | Authored enemy caps 120/200/320/450/600/800/1,000. Difficulty changes patrol/nest counts, production, perception, reinforcement and extraction pressure. The seven current profiles use the same enemy damage multiplier of 1. Generated contracts can resolve different authored encounter caps by template. |
| Operator and weapons | 100 HP. Kestrel 24 damage, 10 shots/s, 45-round magazine and 8 reserves, 2.10 s reload, 0.10 s recoil recovery delay. P-01 base 21.6 damage before central rounding, 4 shots/s, 12 rounds and 4 reserves, 1.45 s reload, 0.06 s recovery delay. |

Local machine was an AMD Ryzen 7 9700X (8 cores, 16 logical CPUs), 62.4 GiB RAM, Radeon RX 9070 XT, Linux 7.3.3-300.fc45.x86_64, Node 24.18.0 and Chromium 153.0.8010.12. Headless comparisons use simulation seed `421337`; generated patrol and stress cases pin mission seed `0`, generator v1, and world seeds Green Plains `76`, Desert `31`, Ice `48` and Forest `63`. Fixed Bodenbruch fixtures have authored geometry and no world seed, mission generator seed or generator version. Browser fixtures pin world and mission seeds and produce a plan ID. The room's random initialization seed was unavailable in browser telemetry. [Headless baseline evidence](playtest/7-9b/baseline.json) · [Final headless evidence](playtest/7-9b/final.json)

## 3. Identified problems

- **Combat fairness.** A contact at 1.25 m that locked before the operator started retreating caused a confirmed 8 HP hit if walking input began after the 11th windup tick. Six surrounding enemies killed a stationary operator in 3.0 s, with up to three confirmed hits on one tick. Fourteen ticks offer extra reaction time without cutting close-range damage or enforcing a global simultaneous-hit limit.
- **Director pacing.** In the first contact-range wave, PEAK ended at four seconds for every party size. The solo trial had higher mean pressure during the first Recovery than PEAK, 0.141 versus 0.111. The four-operator fixture had no time-in-melee-range during its first PEAK despite closeness rising. The later spawn groups needed time to arrive. Extending this existing window shifts phase timing. It cannot guarantee contact when terrain, sightlines or operator movement delay the horde.
- **Spawn constraints.** The second open-fixture contact wave was fully blocked for each party size under both profiles. The 176 attempted validations per squad were rejected for range/clearance with one or two operators and visibility with three or four. The guarded exit into Recovery and zero spawned count were correct. Generated Forest still admitted 20 dynamic spawns in 41 validations in the four-operator final route. Spawn safety remains useful even when it limits pacing.
- **Navigation and congestion.** The fixed 1.2 m corridor admitted 37 enemies across the choke at the end of the 1,000-enemy baseline sample. Forest load at almost 1,000 enemies produced 535 baseline stuck episodes and 540 after tuning, with zero recorded unreachable episodes in that fixture. Clustered movement and distance fields consumed more time than contact validation. A stuck episode here records limited progress and can include queuing behind neighbors. A playtest is needed to distinguish legitimate crowd pressure from visible stalls. [Fixed corridor baseline](playtest/7-9b/fixed-corridor-baseline.txt)
- **Network and readability.** The exercised paths produced no duplicate wave/end/damage events or stale impacts after reconnection. Human recognition of a telegraph in fog, behind teammates or under sustained gunfire remains a hypothesis to test. [Multiplayer regressions](../apps/server/test/multiplayer.test.ts) · [Browser evidence](playtest/7-9b/forest-browser-final.json)

## 4. Implemented changes

| File | Change |
| --- | --- |
| [swarm.json](../packages/shared/src/balance/data/swarm.json) and [manifest.json](../packages/shared/src/balance/data/manifest.json) | Two timing values and release metadata. The existing registry resolves the values and existing horde frames carry the measured attack timing. |
| [measure-enemy-pressure.ts](../scripts/measure-enemy-pressure.ts) | Offline authoritative mission runner with seeded contact, pacing, patrol and high-density profiles. It counts combat events directly on the server and reconciles damage against server totals. It records target changes by allocation identity, active population, volume and spawn probes, navigation recovery, per-phase pressure and workload timings. Its encoder verifies the decoded entity count against the active list. |
| [balance.test.ts](../apps/server/test/balance.test.ts) and [mission.test.ts](../apps/server/test/mission.test.ts) | Re-pinned eight intentional simulation changes. The Convict lethality test includes the configured attack windup in its observation window and still checks death, no respawn and equipment progression. |
| [Enemy combat behavior](ENEMY_COMBAT_BEHAVIOR.md), [Director state machine](HORDE_DIRECTOR_STATE_MACHINE.md) and [balance workflow](BALANCE_WORKFLOW.md) | Updated the current timing and replay information. |
| [7.9B evidence](playtest/7-9b/) | Registry baseline, measurements, isolated experiments, seeded mission results and browser evidence. |

Production changes are data-only. The protected Schabe source-file checksums passed, and a comparison against the starting working tree verified that the existing weapon data and audio work were preserved. The measurement runner uses per-run aggregates and timing samples outside the production room and adds no traffic to the game protocol.

## 5. Balance change table

| Parameter | Previous | New | Reason | Measured result and decision |
| --- | --- | --- | --- | --- |
| `swarm.meleeAttack.windupTicks` | 11 ticks (367 ms) | 14 ticks (467 ms) | Give the same committed strike more visible reaction time. | The delayed retreat changed from 1/1 confirmed hits to 0/1. The single stationary case still took 13 hits and died after 16.13 s versus 16.03 s. Its 39-tick repeat interval held. Six surrounding attackers still confirmed 13 hits, at most three per tick, and killed in 3.10 s versus 3.00 s. Kept. |
| `swarm.director.timing.peakMinTicks` | 120 ticks (4 s) | 210 ticks (7 s) | Let staggered groups approach during the existing PEAK before starting the lower-pressure phase. | First contact PEAK lasted seven seconds in all four squad sizes. Mean pressure in the first four-operator PEAK/Recovery changed from 0.353/0.270 to 0.375/0.226. First-wave counts stayed 5/6/8/9 and Recovery lasted 16 s in those four samples. Kept. |

One attacker still sustained one hit every 1.3 s after the first impact, equivalent to 6.15 HP/s before the final clamped hit. The immediate retreat took zero hits with both profiles. The experiments used the archived registry with one changed value per run. The final profile combined the two. Isolated hashes were `401c6eaca90908b9` for windup and `56c1dcc6fa3be37c` for PEAK. [Isolated experiments](playtest/7-9b/isolated-timing-experiments.json)

## 6. Horde Director report

CALM remains eligible to enter BUILDUP after the seeded delay when pressure, mission priority and capacity permit. BUILDUP tries a first group. ASSAULT schedules the rest up to the allowed wave budget or time limit. At least one successful spawn qualifies a wave for PEAK. Pressure or another mission hold can interrupt a live wave. RECOVERY ends under low pressure after its configured minimum or reaches its maximum, and existing enemies continue fighting. [State machine](../apps/server/src/mission/HordeDirector.ts)

| Phase | Observed on the baseline | Observed with 7.9B |
| --- | --- | --- |
| CALM | First entry 32.7 s across the controlled fixtures. | First entry 32.7 s. The following start still depended on eligibility. |
| BUILDUP | 6.0 s, first group attempted. | 6.0 s, first group attempted. |
| ASSAULT | 8.0 s when the wave budget filled in time, 20.0 s when the schedule timed out. | Same bounds and outcomes in the first matched wave. A fully rejected second wave skipped PEAK. |
| PEAK | First matched contact wave 4.0 s at all four party sizes. Mean pressure 0.111/0.150/0.198/0.353. | 7.0 s. Mean pressure 0.125/0.162/0.219/0.375. |
| RECOVERY | First matched contact wave 16.0 s. Mean pressure 0.141/0.106/0.127/0.270. | 16.0 s. Mean pressure 0.125/0.087/0.089/0.226. |

Mean pressure is the existing smoothed Director metric, which includes nearby population and health. In the two-operator contact fixture, damage from the previous wave continued during a later failed wave. Across the second ASSAULT/RECOVERY boundary it moved from 128/172 HP to 160/140 HP with total pressure still sufficient to kill one bot. RECOVERY can permit continued attrition even when wave spawns are zero. These results describe seeded phase timing and a cautious change to the arrival window. They leave the quality of player recovery open.

Eight longer probes per configuration allowed up to 25 simulated minutes. Every scripted squad exhausted its test policy and died before the limit, after 203–532 s with 7.9B. The longest four-operator run observed seven wave endings, including completed, partial and blocked outcomes, plus a pressure hold. The script did not activate objectives, rotate weapons, resupply or organize teammates. [Baseline endurance](playtest/7-9b/director-long-baseline.json) · [Final endurance](playtest/7-9b/director-long-final.json)

## 7. Multiplayer and cooperative balance

The table uses the 150 s contact fixture with the same seed and operator input policy. Target time is enemy-ticks per operator slot and can be concentrated on whoever is exposed. Attack starts and damage count enemy attacks against operators. The script can fire, auto-reload, walk out of contact and use stims, but its friendly fire and wasted ammunition differ from coordinated play.

| Operators | First wave spawned | Final HP per slot | Targeted enemy-ticks | Direct switches | Starts / hits / damage |
| --- | ---: | --- | --- | ---: | --- |
| 1 | 5 | 100 | 5,240 | 0 | 1 / 0 / 0 HP |
| 2 | 6 | 100, 0 | 3,845 / 5,735 | 3 | 39 / 38 / 300 HP after stims |
| 3 | 8 | 100, 100, 52 | 3,881 / 410 / 3,840 | 3 | 8 / 6 / 48 HP |
| 4 | 9 | 100, 51, 100, 79 | 3,898 / 3,520 / 13 / 900 | 4 | 2 / 0 / 0 HP |

Two-operator pressure was concentrated on the exposed slot. The four-operator spread Forest cohort targeted all four, and the grouped Green Plains route found only two exposed slots. Targeting tests explicitly exercise comparable-distance commitment, real distance advantages, separated targets, unreachable cover, operator death, life changes and same-tick disconnect/reconnect. The local WebSocket suite verified shared attack timing at 140 ms RTT, a single wave and two reconnects at the cap, and procedural mission synchronization through results. Client tests exercised delayed, missed and reordered presentation frames and event de-duplication. A fresh WAN/jitter or TCP-loss test was not run. [Final measurements](playtest/7-9b/final.json) · [Target and recovery tests](../apps/server/test/enemy-ai.test.ts) · [WebSocket tests](../apps/server/test/multiplayer.test.ts)

## 8. Planet compatibility and mission integration

The 150 s Normal route joined the actual generated world and approached the first relay using movement inputs while tracking visible enemies. Maxima below are measured active populations for the 1/4 operator runs. Wave spawns are the four-operator total. These low-contact routes recorded pursuit on every planet. Close combat was evaluated separately.

| Planet / world seed | Peak live enemies, solo / four | Wave spawns / dynamic validations, four | Test result |
| --- | --- | --- | --- |
| Green Plains / 76 | 57 / 69 | 19 / 40 | Open approaches and dispersed wave entry. The four-operator relay-chain mission also ran through balloon extraction on seed 20 (Easy). |
| Desert / 31 | 75 / 73 | 19 / 72 | Dune and canyon terrain retained valid enemy positions in periodic ground samples. Solo/four relay defense and Albatross extraction completed in 121.8/122.0 s. |
| Ice / 48 | 62 / 65 | 18 / 34 | Patrol movement and spawn search used the generated ice geometry. Solo/four relay defense and Albatross completed in 65.2/65.3 s. |
| Forest / 63 | 62 / 67 | 20 / 41 | Short sightlines and tree collision exercised in the movement and heavy-contact profiles. Solo/four relay defense and Albatross completed in 63.3/63.5 s. |

Eleven generated contracts completed through regular input and interaction paths, with per-run seeds, routes, health and resources recorded. The Green Plains nest-purge fixture fired 15 hits into the nest, completed the objective, reloaded and used an Albatross container to refill a magazine. The objective and Convict Defense suites exercised reinforcement, damage, convoy death, objective holds and MissionResult. Fixed Bodenbruch ran both extraction paths with one, two and four operators, including clearance and interrupted extraction tests. Completed generated routes lasted 44.2–206.1 simulated seconds. Their scripted paths and optional-objective choices leave the 20–30-minute player experience unvalidated. The generator uses the registry hash in its existing contract salt, so a versioned balance change can produce a different layout at the same mission and world seeds. [Generated mission results](playtest/7-9b/automated-missions.json) · [Input-driven mission test](../apps/server/test/procedural-mission.test.ts) · [Generator salt](../apps/server/src/mission/MissionGenerator.ts)

## 9. Performance

Forest headless stress used world `63`, mission `0`, generator v1, FREEFALL difficulty, four spaced operators and 450 measured ticks per cohort. Direct placement and replenished operator HP keep the experiment focused on combat load. Authored spawn production is held in this fixture and Convict Defense can still reduce the peak cohort. The harness found valid ground in periodic checks, decoded each horde frame it encoded, and observed movement over 0.05 m/tick from every seeded ID at least once in the final matrix. The sampled grid-cell co-location count is a coarse congestion diagnostic.

| Peak real active | Actual min–max (final profile) | Baseline tick mean / P95 / P99 ms | Final tick mean / P95 / P99 ms | Final AI / navigation P95 ms |
| ---: | --- | --- | --- | --- |
| 50 | 43–50 | 0.045 / 0.088 / 0.178 | 0.047 / 0.091 / 0.180 | 0.067 / 0.053 |
| 100 | 85–100 | 0.085 / 0.189 / 0.270 | 0.093 / 0.202 / 0.271 | 0.132 / 0.107 |
| 250 | 239–250 | 0.240 / 0.527 / 0.626 | 0.251 / 0.560 / 0.615 | 0.259 / 0.236 |
| 500 | 492–500 | 0.526 / 1.109 / 1.628 | 0.539 / 1.111 / 1.509 | 0.606 / 0.563 |
| 750 | 741–750 | 0.791 / 1.659 / 1.891 | 0.823 / 1.718 / 1.936 | 0.886 / 0.829 |
| 1,000 | 990–1,000 | 1.110 / 2.263 / 2.627 | 1.135 / 2.315 / 2.714 | 1.309 / 1.236 |

At 1,000 peak, final target selection P95 was 0.017 ms and attack work P95 was 0.056 ms. End RSS was 302 MiB for the offline process and measured CPU time was 624 ms over 543 ms wall-clock, including harness and encoding work. Horde payload was 101,189 B/s per recipient before transport overhead. Navigation recorded 5,509 deferred routes and 98 successful recovery steps under saturation. In the generated route profiles, a spawn-processing sample peaked at 0.386 ms and used at most 10 total validations and 4 dynamic validations on a tick. [Baseline data](playtest/7-9b/baseline.json) · [Final data](playtest/7-9b/final.json)

| Local Forest browser profile | Live enemies and exercised load | FPS / frame P95 / P99 | Server tick mean / P95 / P99 |
| --- | --- | --- | --- |
| Baseline, 4 Chromium views, 6 s | All sampled frames held 1,000. 998 enemies moved >0.1 m and zero operator attack starts were recorded. Ground mist, dawn, medium, 1280×720. | 60.0 / 16.8 / 16.8 ms | 1.206 / 1.565 / 1.756 ms |
| 7.9B, 4 Chromium views, 12 s | All sampled frames held 1,000. 954 moved >0.1 m and 320 attacks started. Windup audio played in each view, up to 16 simultaneous audio voices. Same world and graphics with live threat fixture. | 60.0 / 16.8 / 16.8 ms | 1.134 / 1.480 / 1.602 ms |
| 7.9B, 1 Chromium view plus 3 SDK peers, 30 s | Forest world seed 76, mission 0, generator v1. 997–1,000 active, exactly 1,000 for 897 of 900 sampled ticks using real entity replenishment. Four firing operators, 806 shot events including allied fire, six confirmed blasts, weapon audio and combat HUD/VFX. | 60.0 / 16.7 / 16.8 ms | 0.680 / 1.278 / 1.700 ms |

All three samples recorded zero dropped server steps. The four-view live-threat run measured 100,703 horde B/s per recipient, 40–106 draw calls in the sampled camera views and 756 MiB end RSS for the Node harness/room process. The weapons/VFX HUD reported 130 draw calls, 184.31 kB/s estimated traffic and 75.5 MiB of decoded audio. The two final browser profiles independently exercised live strikes and sustained operator fire. The weapons/VFX run recorded zero confirmed enemy hits against operators in the sampled interval. Different fixtures, durations and view counts preclude a direct speedup claim. [Four-view baseline](playtest/7-9b/forest-browser-baseline.json) · [Four-view attack sample](playtest/7-9b/forest-browser-final.json) · [Weapons and VFX sample](playtest/7-9b/forest-combat-browser.json)

## 10. Automated and runtime tests

- `npm test` passed **347/347** before tuning and after the final test adjustment. The first candidate run passed 346/347. Its Convict assertion used a fixed deadline inherited from the shorter windup. The focused retest and full suite passed with the configuration-derived deadline.
- `npm run typecheck`, `npm run build`, `npm run balance:check`, `npm run balance:trace`, `sha256sum -c docs/enemies/schabe/baseline.sha256` and `git diff --check` completed. Vite reported its existing warning for the main chunk above 500 kB. The runner also passed standalone TypeScript validation.
- The AI suite exercised real posture, cover, melee sector sharing, attack interruption, stale life, blocked paths, bent 1.2 m corridors, near-player occupancy, all-observer visibility and bounded retries. Regression coverage included both weapons, tactical reload, grenade, melee, stim, Friendly Fire, supply, mission objectives, and both extraction systems.
- Scripted playtests covered A (solo), B (two operators), C (four operators), D (stationary/immediate/delayed telegraph response), E (full Director cycle), F (four planets), G (regular-input complete missions) and H (heavy swarm). The baseline and final matrix also covered three operators. Human playtest feedback was **NOT TESTED**.

Exact local headless invocations follow. `NODE_TEST_CONTEXT=measurement` keeps the console mission telemetry out of JSON output. Per-tick combat stats still come from the live server simulation. Re-run the isolated profiles from the archived registry with only the specified value changed, keeping the baseline manifest for those experiments.

```bash
export FREEFALL_SOURCE_REVISION="$(git rev-parse HEAD)"
export NODE_TEST_CONTEXT=measurement

FREEFALL_WORKSPACE=7.9A-working-tree node --conditions=development \
  scripts/measure-enemy-pressure.ts all docs/playtest/7-9b/baseline-registry.json
FREEFALL_WORKSPACE=7.9B-working-tree node --conditions=development \
  scripts/measure-enemy-pressure.ts all
FREEFALL_PRESSURE_SECONDS=1500 FREEFALL_WORKSPACE=7.9A-working-tree \
  node --conditions=development scripts/measure-enemy-pressure.ts director docs/playtest/7-9b/baseline-registry.json
FREEFALL_PRESSURE_SECONDS=1500 FREEFALL_WORKSPACE=7.9B-working-tree \
  node --conditions=development scripts/measure-enemy-pressure.ts director
npm run benchmark -- enemy-ai 360 421337 4 distributed
npm run benchmark -- enemy-ai 360 421337 4 corridor

./node_modules/.bin/tsc --ignoreConfig --noEmit --target ES2023 --module NodeNext \
  --customConditions development --types node --rewriteRelativeImportExtensions \
  --resolveJsonModule --skipLibCheck --strict scripts/measure-enemy-pressure.ts
node --conditions=development --test --test-isolation=none \
  --test-name-pattern='Convicts fire' apps/server/test/mission.test.ts
```

The two existing enemy-AI benchmarks above were run before tuning. The fresh after-tuning load uses the Forest matrix in the registry-selectable runner. Browser replay uses the local Chromium and Playwright installation and localhost WebSockets. The six-second baseline command ran before switching the live registry.

```bash
export PLAYWRIGHT_MODULE=/home/edgar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/home/edgar/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
export FREEFALL_BROWSER_ANGLE=gl

FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63 FREEFALL_GENERATED_SEED=0 \
FREEFALL_WEATHER=ground-mist FREEFALL_TIME_OF_DAY=dawn FREEFALL_BROWSER_PEERS=4 \
FREEFALL_OPERATORS=4 FREEFALL_BROWSER_ENEMIES=1000 FREEFALL_BROWSER_SAMPLE_MS=6000 \
FREEFALL_BROWSER_LOAD_ONLY=1 FREEFALL_BROWSER_COOP_ACCEPTANCE=1 \
node --conditions=development scripts/playtest-horde-director.mjs

FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63 FREEFALL_GENERATED_SEED=0 \
FREEFALL_WEATHER=ground-mist FREEFALL_TIME_OF_DAY=dawn FREEFALL_BROWSER_PEERS=4 \
FREEFALL_OPERATORS=4 FREEFALL_BROWSER_ENEMIES=1000 FREEFALL_BROWSER_SAMPLE_MS=12000 \
FREEFALL_BROWSER_LOAD_ONLY=1 FREEFALL_BROWSER_COOP_ACCEPTANCE=1 \
FREEFALL_BROWSER_AUDIO=1 FREEFALL_BROWSER_THREAT=1 \
node --conditions=development scripts/playtest-horde-director.mjs

FREEFALL_BROWSER_WIDTH=1280 FREEFALL_BROWSER_HEIGHT=720 FREEFALL_COMBAT_PLANET=forest \
FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LIVE_MAX=1 FREEFALL_COMBAT_STEADY_POPULATION=1 \
FREEFALL_COMBAT_LOAD=1000 FREEFALL_COMBAT_SAMPLE_MS=30000 \
node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/freefall-79b-combat-browser
```

## 11. Release gates

| Gate | Status | Evidence and scope |
| --- | --- | --- |
| B-G1 Enemy Architecture Audit | PASS | Inspected ownership, target, navigation, combat, spawning, Director, timing and mission paths. |
| B-G2 Enemy Balance Baseline | PASS | Replayable `8cf1c12067347de6` snapshot, clean baseline suite and seeded measurements. |
| B-G3 Attack Fairness | PASS | Measured hit timing, frequency, damage, combined pressure and retreat counterplay. Validated cover, posture, simultaneous hits and cancellation. Human perception is tracked under B-G14. |
| B-G4 Target Selection | PASS | Measured 1–4 operator distribution and switches. Tests covered commitment, invalid targets and reconnection. |
| B-G5 Swarm Coordination | PASS | Bounded local separation/steering, corridor flow, collision, route recovery and dense terrain tests. Congestion remains observable at stress loads. |
| B-G6 Horde Director | PASS | Five phases measured and seeded replayed. Observed holds, blocked and completed waves, live enemies during Recovery, bounded reservations and pressure sampling. |
| B-G7 Spawn Safety | PASS | Tests rejected bad terrain, overlap, invalid routes and candidates visible to the fourth observer. Generated checks stayed within shared budgets. |
| B-G8 Cooperative Difficulty | PASS | Scripted 1–4 operator combat, pressure and resource scenarios evaluated. Human difficulty and cooperation are tracked under B-G14. |
| B-G9 Four-Planet Compatibility | PASS | Generated movement, spawns and complete mission paths exercised across all four planets. |
| B-G10 Mission Integration | PASS | Input-driven relay, nest-purge, Convict Defense, supply, Albatross, balloon and MissionResult regressions. |
| B-G11 Multiplayer Authority | PASS | Local WebSockets, shared horde, scoped combat events, 140 ms RTT and reconnect at the cap. |
| B-G12 Central Balance Registry | PASS | Two centralized changes, isolated A/B evidence, schema 2 hash and recoverable baseline. |
| B-G13 Performance | PASS | All six peak active sizes measured. Short native Forest probes exercised attack audio and separate sustained four-peer combat with 1,000 real simulated enemies. |
| B-G14 Gameplay Acceptance | NOT TESTED | No human participants or representative completed 20–30-minute playthroughs. |
| B-G15 Regression | PASS | 347/347 automated tests, TypeScript/build, hash and protected-file checks. No new P0/P1 reproduced. |

## 12. Open issues

- Full-mission difficulty, resource use, perceived fairness and time to recovery still need human sessions with solo, two-, three- and four-operator squads. Test both extraction paths and report the longest sustained high-pressure segment.
- Longer arrival routes, full visibility or disconnected operator positions can leave waves late or blocked. Open-fixture Recovery sometimes contained greater combat pressure than the preceding PEAK. Map-specific tuning should work with existing safe positions and phase rules.
- Narrow corridors and extreme Forest concentrations can produce long queues and deferred route work. The saturated benchmark offers several approach paths. Single-choke throughput and emergency reposition visibility need a closer human look.
- The browser evidence is local and short. WAN jitter, induced TCP loss, target hardware coverage and combined long-duration 7.9E release stress remain open.
- The existing weapon audio technical acceptance and untested human listening feedback are recorded in 7.9A.1. No changes from that milestone were required.

## 13. Recommendations for Milestone 7.9C

- Compare exit success from one and multiple committed sectors with ordinary walking, crouch, dive and get-up in open terrain and against Forest cover. The current measured delay-response gain was for standing, unobstructed walking.
- Measure the time between visible windup, input transmission and server movement under elevated RTT and client interpolation. Compare forewarned and unexpected attacks with actual players.
- Reproduce flank blockage at doors, dunes and tree lines. Measure how often the standing and grounded footprints permit repositioning and whether a failed dive ends in recoverable cover.

7.9C work has not started.
