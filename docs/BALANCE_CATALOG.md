# Balance-Katalog

Bestandsaufnahme der Gameplay-Werte nach Milestone 7.2A, fortgeschrieben für 7.2B (geänderte Werte sind markiert, Details in [COMBAT_BALANCE_7_2B](COMBAT_BALANCE_7_2B.md)). Alle Pfade beziehen sich auf `packages/shared/src/balance/data/`. Die Spalte „Vorher“ nennt die Stelle, an der der Wert bis 7.1 fest codiert war. Alle Werte wurden 1:1 übernommen. [Architektur](BALANCE_ARCHITECTURE.md) · [Workflow](BALANCE_WORKFLOW.md)

Aktuelle Version: Release `7.2B`, Schema 2. Den Hash zeigt `npm run balance:check`.

## Waffen (`weapons.json`)

| Wert | Kestrel AR-01 (`kestrel-ar-01`) | P-01 Dienstpistole (`p-01`) | Vorher |
| --- | ---: | ---: | --- |
| Slot / Kategorie | primary / assault-rifle | secondary / pistol | `definitions/combat.ts` |
| `damage` | 24 | **21,6** (7.2A: 18, × 1,2) | `combat.ts` (`TEST_RIFLE`, `SERVICE_PISTOL`) |
| `roundsPerSecond` (Feuerintervall) | 10 (3 Ticks) | 4 (8 Ticks) | `combat.ts`. Intervall in `systems/combat.ts` pro Schuss berechnet |
| `magazineSize` | **45** (7.2A: 30) | 12 | `combat.ts` |
| `reserveMagazines` / `maxReserveMagazines` | **8 / 8** (7.2A: unbegrenzt) | **4 / 4 ganze Magazine** (7.2A: 48 lose Patronen) | taktisches Nachladen, [TACTICAL_RELOADING](TACTICAL_RELOADING.md) |
| `reloadTimeline.removalAt` / `insertionAt` | 0,2 / 0,72 (Tick 13 / 45 von 63) | 0,18 / 0,68 (Tick 8 / 30 von 44) | neu in 7.2B |
| `reloadSeconds` (Ticks) | 2,1 (63) | 1,45 (44) | `combat.ts` |
| `effectiveRange` (harte Grenze) | 72 m | 44 m | `combat.ts` (`range`) |
| `recoil.visualKick` / `cameraKick` (nur Darstellung) | 1 / 0,5° | 1,35 / 0,75° | Rifle: implizit. Pistole: `1.35` in `PlayerVisualController.ts`. FOV-Kick bisher fest 0,63° |
| `recoil.pitchPerShot × verticalMultiplier` | **0,3° × 1,2 = 0,36°** | 0,85° × 1 | neu in 7.2B, serverseitig |
| `recoil.yawPerShot × horizontalMultiplier` | **0,2° × 1,1 = 0,22°** | 0,25° × 1 | neu in 7.2B, serverseitig |
| `recoil.sustainedGrowthPerShot` / `maxSustainedMultiplier` / `maxClimbDegrees` | 0,035 / 1,6 / 7° | 0 / 1 / 4° | neu |
| `recoil.recoveryDelaySeconds` / `recoveryPerSecond` | 0,12 s / 5 °/s | 0,06 s / 9 °/s | neu |
| `spread.hip` / `aim` / `moving` / `bloomPerShot` / `maxBloom` / `bloomRecovery` | 0,9° / 0,22° / × 1,6 / 0,1° / 1,8° / 5 °/s | 0,7° / 0,18° / × 1,4 / 0,3° / 1,5° / 7 °/s | neu |
| `movement.*` | neutral (reserviert) | neutral (reserviert) | nicht vorhanden |
| `assets.visual` | `weapon.kestrel-ar-01` | `weapon.p-01` | `combat.ts` (`visualAssetId`) |
| `sounds.fire` | `rifle` | `pistol` | Slot-Abfrage in `game/Game.ts` |
| `attachmentSlots` | – | – | nicht vorhanden |

## Ausrüstung (`equipment.json`)

| Wert | Aktuell | Vorher |
| --- | ---: | --- |
| Sprenggranate `capacity` | 2 | `combat.ts` (`FRAG`) |
| `throwSeconds` / `releaseSeconds` / `fuseSeconds` | 0,52 / 0,22 / 1,65 s | `FRAG` |
| `baseDamage`, `blastRadius`, `falloff` | **165** (110 × 1,5), **10,5 m** (7 × 1,5), linear | `FRAG`, Formel in `systems/grenades.ts` |
| `structureDamageMultipliers.structure.swarm_nest` | **2,0** (7.2A: 1,45) | zentraler Damage Resolver, [GRENADE_BALANCING](GRENADE_BALANCING.md) |
| `throw.speed` / `pitchOffset` / `minPitch` / `gravity` / `releaseHeight` | 13 / 0,34 / −0,35 / 13 / 1,35 m | Magic Numbers in `systems/grenades.ts` |
| Heilstim `maxCharges` | **5** | `combat.ts` (`STIM`) |
| `applicationSeconds` (Ticks) | 1,2 (36) | `STIM.seconds` |
| `healFractionOfMaxHealth` (Heilung) | 0,4 (40 HP) | `STIM.fraction` |
| `interruptedBy` | Feuern, Sprinten, Nachladen, Waffenwechsel, **Nahkampf** | fest in `systems/equipment.ts` |
| Nahkampf `melee.weapon_strike` | 50 Schaden, 2 m, 80° Kegel, 0,14 s Ausholen, 0,8 s Cooldown, 0,4 s Stagger, 0,8 s Immunität, 1,1 m Knockback | neu, [MELEE_SYSTEM](MELEE_SYSTEM.md) |
| `cooldownSeconds` | 0 (reserviert) | nicht vorhanden |
| Loadout `weaponSwitchSeconds` | 0,48 s | `SWITCH_SECONDS` |
| `resupply.onMissionStart` / `onRespawn` | `full` / `full` | implizit in `freshEquipment()` |
| `resupply.supplyCrates` | `albatross` | 7.2A: `not-implemented` |
| `resupply.perUse` | +2 Primär-MAG, +1 Sekundär-MAG, +1 Granate, +2 Stims | neu, [ALBATROSS_RESUPPLY](ALBATROSS_RESUPPLY.md) |
| `resupply.interactionSeconds` / `interactionRange` | 1 s / 2,2 m | neu |
| `resupply.availableWhen` | beschädigt ja, flugunfähig ja, zerstört nein | neu |

## Kampf (`combat.json`, neu in 7.2B)

| Wert | Aktuell |
| --- | ---: |
| `damagePolicy.operatorToOperator` / `selfDamage` / `operatorToConvict` | 0,3 / 0,3 / 0,3 |
| `damagePolicy.explosionsDamageOperators` | `true` |
| `operatorHitbox.radius` / `height` | 0,42 m / 1,85 m |
| `audio.*` | Stimmenlimit 28 (4 pro Quelle), Hörweite 150 m, Fern-Überblendung 22–95 m, Limiter −6 dB, Profile je Waffe und Umgebung, [WEAPON_AUDIO](WEAPON_AUDIO.md) |

Albatross-Nachschubcontainer stehen in `structures.json › vehicles[0].supplyContainers` (Seite, Seriennummer, Montagepunkt, 4 Ladungen, 420 HP).

## Operator (`operators.json`)

| Wert | Aktuell | Vorher |
| --- | ---: | --- |
| `maxHealth` | 100 | `config/arena.ts` (`PLAYER.health`) |
| `walkSpeed` / `sprintSpeed` | 5,8 / 9,2 m/s | `PLAYER` |
| `respawnSeconds` / `respawnProtectionSeconds` | 3 / 2 s | `PLAYER` |
| `landingProtectionSeconds` | 6 s | Magic Number in `MissionInstance.placeAtLanding` |

## Gegner (`enemies.json`)

| Wert | Schabe (`swarm.schabe`, Fraktion `swarm` „Der Schwarm“, geschützt) | Vorher |
| --- | ---: | --- |
| `wireType` | 0 | `definitions/enemies.ts` |
| `health` | 48 | `enemies.ts` |
| `speed` | 3,55 m/s | `enemies.ts` |
| `hitRadius` / `hitHeight` | 0,68 / 0,72 m | `enemies.ts` |
| `meleeRange` / `meleeDamage` / `meleeCooldown` | 1,45 m / 8 / 1,3 s (≈ 0,77 Angriffe/s) | `enemies.ts` |
| `ai.detectionRange` (Patrouillen-Sicht, Basis) | 31 m | `BASE_SIGHT_RANGE` in `PatrolManager.ts` |
| `resistances.*` | neutral (reserviert) | nicht vorhanden |
| `visualAssetId` | `enemy.swarm.schabe.procedural` | `enemies.ts` |

## Strukturen (`structures.json`)

| Wert | Schwarmnest (`structure.swarm_nest`) | Vorher |
| --- | ---: | --- |
| `maxHealth` | 360 | `NEST_HP` in `SwarmNestManager.ts` |
| `spawnIntervalSeconds` | 5,6 s (168 Ticks) | `BASE_INTERVAL` |
| `breachEmergeSeconds` | 6,4 s | `BREACH_TICKS` |
| `minSpawnIntervalTicks` / `blockedSpawnRetryTicks` | 7 / 9 | Magic Numbers in `SwarmNestManager.update` |
| `reinforcementBoostRate` | 1,85 | Magic Number in `SwarmNestManager.update` |
| `hitRadius` / `hitHeight` / `exits` / `exitRadius` / `collapseTicks` | 3,8 m / 1,55 m / 3 / 4,8 m / 64 | `contracts/mission.ts` (`NEST_*`) |
| `garrison.routeRadius` / `routePoints` / `regroupDistance` / `playerClearance` | 13 m / 8 / 24 m / 7 m | Magic Numbers in `EncounterDirector.spawnGarrison` |

| Wert | Albatross-02 (`vehicle.albatross_02`) | Vorher |
| --- | ---: | --- |
| `hullHealth` / `thrusterHealth` | 1.700 / 330 | `definitions/deployment.ts` (`ALBATROSS`) |
| `disabledThrusters` | 2 | `ALBATROSS` |

Die Geometrie des Albatross (Abmessungen, Thruster-Positionen, Startdauer) bleibt in `deployment.ts`.

## Schwarm (`swarm.json`)

| Bereich | Werte | Vorher |
| --- | --- | --- |
| `hordeAi` | Zielprüfung alle 6 Ticks, Steering alle 2 Ticks, Separation 1,65 m, 12 Nachbarn je Zelle | `AI` in `systems/horde.ts` |
| `arena` | Archetyp `swarm.schabe`, Ring 56 − 5 = 51 m außen, 11 m breit, Auffüllpause 9 Ticks | `ArenaEncounter.ts` |
| `patrols` | Wahrnehmung alle 6 Ticks, Nahbereich 9 m, Sichtkegel 0,24, Kontaktgedächtnis 6 s, Alarmverzögerung 10 Ticks, Verdacht 18 Ticks, Untersuchen 17 s, Suchen 3 s / 4 s, Landeschutz 6 s, Tempo Route 0,71 / Verdacht 0,38, Geräuschradien Schuss 48 / Explosion 82 / Landung 100 / Bake 132 m, Lebensdauer 12 / 12 / 120 / 120 Ticks, max. 48 Geräusche, Spawn-Abstand zu Spielern 14 m | `PatrolManager.ts`, `EncounterDirector.ts` |
| `reinforcements` | Ruf 3 s, Gruppen-Cooldown 35 s, global 4 s, regional 32 s, Nest-Boost 18 s, Boost-Suchradius 150 m, Durchbruch-Suchradius 125 m, 11 Versuche je Region, Abstände Spieler 27 m / Nest 18 m / Landezone +12 m / Service-Vorfeld +9 m / Ziel +12 m | `PatrolManager.ts`, `EncounterDirector.ts` |
| `threat` | Basis 3, je Stufe 3, je Nest 5, Verteidigung 11, Extraktion 13, Nestdruck `1 + threat / 200`, Extraktions-Nestdruck 0,4, Alarmhitze max. 42 / +12 je Verstärkung / −0,008 je Tick / Landung 4 + 2 je Stufe / Bake 8 + 3 je Stufe | `EncounterDirector.ts` |
| `extraction` | erster Druckimpuls nach 6 s, danach alle 15 s (jeweils ÷ Extraktionsfaktor) | `EncounterDirector.ts` |

## Convicts (`convicts.json`)

Trupp: 4 Convicts, 5,1 m/s, Kampfreichweite 37 m, Neu-Zielsuche alle 5 Ticks, Nachladedauer der `kestrel-ar-01` (2,1 s). Vorher: Tupel-Tabelle und Magic Numbers in `mission/Convicts.ts`, Nachladedauer aus `TEST_RIFLE` geliehen.

| Kit (`id`, Wire `equipmentId`) | Waffenvariante | HP | Panzerung | Schaden | Schuss/s | Magazin | Stufe |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `security-surplus` | `kestrel-service` | 150 | 5 | 24 | 7 | 28 | 1 Leicht |
| `field-standard` | `kestrel-standard` | 132 | 4 | 22 | 6,7 | 26 | 2 Normal |
| `light-webbing` | `kestrel-reserve` | 118 | 3 | 20 | 6,2 | 24 | 3 Herausfordernd |
| `aged-infantry` | `kestrel-legacy` | 106 | 2 | 18 | 5,8 | 22 | 4 Schwer |
| `worn-reserve` | `kestrel-worn` | 96 | 1 | 16 | 5,4 | 19 | 5 Extrem |
| `restricted-issue` | `kestrel-restricted` | 84 | 0 | 14 | 5 | 16 | 6 Albtraum |
| `minimum-issue` | `kestrel-minimum` | 72 | 0 | 12 | 4,5 | 12 | 7 FREEFALL |

Die Zuordnung Stufe → Kit erfolgte vorher über den Index `level − 1`. Jetzt verweist jede Stufe per `convictKitId` auf ihr Kit.

## Schwierigkeit (`difficulty.json`)

| Stufe | Gegner | Nester | Durchbrüche | Gruppen | Größe | Sicht × | Ruf-CD × | Nest-Intervall × | Nest-HP × | Extraktion × | Budget | Spawns/Tick |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 Leicht | 120 | 2 | 1 | 5 | 3–5 | 0,82 | 1,55 | 1,55 | 0,85 | 0,5 | 5 | 8 |
| 2 Normal | 200 | 3 | 1 | 8 | 4–7 | 1 | 1,25 | 1,2 | 1 | 0,75 | 8 | 10 |
| 3 Herausfordernd | 320 | 4 | 2 | 12 | 6–9 | 1,07 | 1 | 1 | 1 | 1 | 12 | 12 |
| 4 Schwer | 450 | 5 | 2 | 15 | 8–13 | 1,14 | 0,83 | 0,8 | 1,1 | 1,25 | 16 | 14 |
| 5 Extrem | 600 | 6 | 3 | 20 | 10–16 | 1,22 | 0,68 | 0,62 | 1,15 | 1,5 | 20 | 16 |
| 6 Albtraum | 800 | 8 | 3 | 24 | 13–20 | 1,3 | 0,55 | 0,47 | 1,2 | 1,8 | 24 | 18 |
| 7 FREEFALL | 1.000 | 10 | 4 | 30 | 16–24 | 1,38 | 0,43 | 0,32 | 1,25 | 2,1 | 32 | 24 |

Neu, in 7.2A überall neutral: `enemyHealthMultiplier` = 1, `enemyDamageMultiplier` = 1. Vorher: `definitions/difficulty.ts`. Die Multiplikatoren wurden in drei Managern verteilt angewendet.

Effektive Werte je Stufe (aus `npm run balance:check`):

| Stufe | Nest-HP | Nest-Intervall (Ticks) | Sicht (m) |
| --- | ---: | ---: | ---: |
| 1 Leicht | 306 | 260 | 25,42 |
| 2 Normal | 360 | 202 | 31,00 |
| 3 Herausfordernd | 360 | 168 | 33,17 |
| 4 Schwer | 396 | 134 | 35,34 |
| 5 Extrem | 414 | 104 | 37,82 |
| 6 Albtraum | 432 | 79 | 40,30 |
| 7 FREEFALL | 450 | 54 | 42,78 |

## Entfernte Duplikate und Widersprüche

| Fund | Lösung |
| --- | --- |
| Convicts nutzten `TEST_RIFLE.reloadSeconds`, obwohl sie eigene Kits haben | expliziter, validierter Verweis `squad.reloadWeaponId` |
| `SwarmNest.difficultyModifier` speicherte den Intervall-Faktor ein zweites Mal (ungenutzt) | entfernt. Der Snapshot liefert das effektive Intervall. |
| Difficulty-Multiplikatoren in `SwarmNestManager`, `PatrolManager` und `EncounterDirector` je eigenständig angewendet | einmalige Auflösung in `resolveMissionBalance()` |
| Reserve-Logik an `slot === 'secondary'` gekoppelt, Anzeige `∞` an `slot === 'primary'` | aus `reserveMagazines` abgeleitet |
| Pistolen-Kick 1,35 und Audio-Cue im Client über den Slot fest verdrahtet | `recoil.visualKick` und `sounds.fire` der Waffe |
| HUD-Texte „Heilstim“ und „Sprenggranate“ doppelt zu den Definitionen | `displayName` der Definition |
| Convict-Kit über den Index `level − 1` | `convictKitId` je Stufe |

## Bewusst im Code verbliebene Werte

Diese Werte sind Geometrie, Netzwerk, Präsentation oder Missionsablauf und keine Kampfbalance. Sie bleiben vorerst im Code:

- Weltgeometrie, Hindernisse, Patrouillenrouten, Durchbruchsregionen (`definitions/missions.ts`), Albatross- und Carrier-Geometrie (`deployment.ts`).
- Netz- und Tickraten (`NET`, `MOVEMENT_INPUT`, `INTERPOLATION`), Kamera und Zielstrahl (`config/movement.ts`).
- Navigations- und Formationsdetails: Kollisionsradien (0,35–0,5 m), Wegpunkt-Ankunft 4 m, Formationswinkel 2,39996, Abstandsstreuung 0,8 + 0,35 r, Patrouillen-Streuung 1,7 + 7 r, Granaten-Bodenhöhe 0,09 m und Kollisionsradius 0,075 m.
- Missionsablauf: Deployment-Phasen, Boarding 3 s, Ergebnisanzeige 12 s, Extraktionsballon (90 s Countdown, Radius 25 m), Belohnungen (`MISSION_REWARDS`).
- Darstellung: Kamera-Kick 0,63, HUD-Schwelle „Kritisch“ bei 35 % HP.

Das Ziel des Katalogs bleibt: Ein Gameplay-Wert steht genau einmal im Repository. Absichtliche Kopien gibt es nur noch in den Regressionstests (`balance.test.ts`, `schabe.test.ts`, `mission.test.ts`). Sie halten den Stand vor der Migration fest. Die Tabelle in `DIFFICULTY_SYSTEM.md` ist Dokumentation.
