# Abschlussbericht · Milestone 7.8B

7.8B verwendet die vorhandenen autoritativen Hitscan-Ergebnisse für materialabhängige Einschläge, räumliche Treffergeräusche und bestätigtes HUD-Feedback. Die Oberflächen wurden im laufenden Browser auf allen vier Planeten getestet. Die Waldlastprobe startete bei 1.000 serverseitig simulierten Schaben. Die native Waldmatrix erreichte auf der Radeon RX 9070 XT bei 1.280 × 720 rund 60 FPS.

## Implementierung

| Bereich | Geänderte Dateien |
| --- | --- |
| Treffer- und Materialdaten | `packages/shared/src/contracts/messages.ts`, `config/posture.ts`, `config/postureGeometry.ts`, `definitions/missions.ts`, `definitions/deployment.ts`, `world/PlanetSurfaces.ts`, `world/SurfaceNoise.ts`, `world/ImpactSurfaces.ts`, `index.ts` |
| Server | `apps/server/src/systems/combat.ts`, `mission/Convicts.ts` |
| Client-Ereignisse und HUD | `apps/client/src/networking/Match.ts`, `ShotHistory.ts`, `EventHistory.ts`, `game/Game.ts`, `game/HitFeedback.ts`, `ui/App.tsx` |
| Renderer | `apps/client/src/rendering/ArenaView.ts`, `VisualEffectsManager.ts`, `terrain.ts`, `characters/PlayerVisualController.ts`, `mission/GeneratedTerrain.ts`, `environment/PlanetSurfaces.ts`, `EnvironmentDetailPlacement.ts`, `EnvironmentConfig.ts`, `noise.ts` |
| Audio | `apps/client/src/audio/AudioEngine.ts`, `ImpactAudio.ts`, `Soundscape.ts`, `MissionAudio.ts` |
| Tests und Browserharness | `apps/client/test/impact-feedback.test.ts`, `weapon-vfx.test.ts`, `apps/server/test/impact-feedback.test.ts`, `tactical-movement.test.ts`, `support/balance-trace.ts`, `scripts/playtest-impact-feedback.mjs`, `playtest-weapon-vfx.mjs` |

Der Quell-Audit fand clientseitige Materialschätzung, Trefferzeichen für geschützte Operatoren, Farbimpulse auf der Schabe und verworfene eindeutige Spätereignisse. Das vorhandene `shot`-Paket hat nun einen optionalen bestätigten Impact. Es verwendet `tick:shooter` für Schuss und Impact und behält die autoritative Ziel-ID und Schussposition. Der Client dedupliziert empfangene Ereignisse vor allen Präsentationskanälen. Eine Bestätigung eines verbündeten Operators erfordert tatsächlich entfernte HP. Ein Schaben-Kill-Marker erfordert den Despawn im Serverresultat. Die lokale Prediction umfasst weiterhin nur den Waffenstoß aus 7.8A.

Oberflächen nutzen dieselben Mischgewichte wie das gerenderte Terrain. Die Normale kommt vom Höhenfeld-Dreieck oder der Collider-Fläche. Schnee, Eis, gefrorener Stein, Sand, Erde, Gras, Fels, Waldstreu, Holz, Beton und Metall verwenden eigene Profile. Ein neutraler Fallback ist vorhanden. Externe Schaben- und Operator-Partikel folgen dem Weltkontakt. Die hinterlegten Schabenprüfsummen stimmen. Die Assets sind unverändert und das Budget beträgt **0 €**.

- [Audit und Prioritäten](COMBAT_IMPACT_ARCHITECTURE.md) · [Serverbestätigungen](SERVER_VALIDATED_HIT_FEEDBACK.md) · [Schussidentität](HIT_EVENT_DEDUPLICATION.md) · [Koop](COMBAT_IMPACT_MULTIPLAYER.md)
- [Klassifikation](SURFACE_CLASSIFICATION.md) · [Planeteneffekte](PLANETARY_SURFACE_IMPACTS.md) · [Schabe](ENEMY_HIT_PRESENTATION.md) · [Eigenbeschuss](OPERATOR_DAMAGE_FEEDBACK.md)
- [Audio und Lizenzen](IMPACT_AUDIO.md) · [Decal-Entscheidung](IMPACT_DECALS.md) · [Pooling und Qualität](IMPACT_VFX_POOLING.md) · [Performance](COMBAT_IMPACT_PERFORMANCE.md)

## Release Gates

| Gate | Status | Nachweis |
| --- | --- | --- |
| A · Server Validation | PASS | Treffer, Deckung, Miss, abgelehnter Schuss und Schutzregeln durch tatsächliche Simulation geprüft. |
| B · Event Deduplication | PASS | Duplikate der Welttreffer und Kill-Echos im Browser verworfen. Empfangsfenster und Reordering regressionsgeprüft. |
| C · Surface Classification | PASS | Vier Planeten, Props, Fallback, Wandnormale, Hang und Zellgrenze getestet. |
| D · Planetary Impacts | PASS | Vier Browserwelten mit 13 Materialproben, aktiven Partikeln, Audio und Cleanup. |
| E · Enemy Hit Feedback | PASS | Browsermarker für Schabentreffer und autoritativen Tod. Drei geprüfte Quell-Hashes. |
| F · Operator & Friendly Fire | PASS | Geschützter und beschädigter Operator im Browser und im Server-Test. |
| G · Audio & Decals | PASS | Räumliche Position, Fallback, Cooldown und Voice Budget geprüft. Geschosse verwenden kurze Partikeleffekte. |
| H · Multiplayer | PASS | Vier reale Verbindungen, lokale Prediction, Remote-Impacts, Reconnect und verspätete Zustellung. Physischer Paketverlust bleibt offen. |
| I · Tactical Movement | PASS | Browser- und Spielsimulationsprüfungen für Stand, Knien und Bodenhaltungen, inklusive Dive und Get-up. |
| J · Performance | PASS | Native Lastmatrix bei 1.280 × 720, Medium, mit 60,0 FPS und 0 verworfenen Server-Steps. 65 s auf High reproduzierten 60,0 FPS bei 1.740 Schüssen. |
| K · Horde Stress | PASS | Funktionale Wald-Lastprobe mit vier Schützen bis 1.000 aktiven Schaben. Die native Stufe mit 1.000 Schaben erreichte 60,0 FPS und 1,11 ms oder weniger Server-P95 in beiden Renderpfaden. |
| L · Regression | PASS | 319 automatisierte Tests, Typecheck, Build, Balance und acht unveränderte Gameplay-Fingerprints. Ein Waldauftrag endete im Browser mit erfolgreicher Ballonextraktion. |
| M · Compliance & Documentation | PASS | Null-Euro-Budget, Quellintegrität, reproduzierbare Befehle und Rohdaten belegt. |

## Offene Punkte

- P0/P1 · In den durchgeführten Prüfungen ist kein entsprechender Fehler offen. Die Software-Bildrate ist für eine Zielhardwarefreigabe ungeeignet.
- P2 · VRAM in Byte, subjektiver Audiovergleich, physischer Paketverlust und längerer manueller Playtest bleiben offene Prüfungen.
- P3 · Die Normale und Position folgen der vereinfachten Kollisionsform. Kanten gerundeter Props können zur sichtbaren Oberfläche abweichen.

7.8B ist umgesetzt. Die Gates A–M bestehen in den dokumentierten Prüfungen. Die offenen erweiterten Prüfungen bleiben Teil der Gesamtabnahme von Milestone 7.8. Für 7.8C stehen die bestehenden Explosions- und Nahkampfereignisse sowie die gemessenen Laufzeitbudgets als Ausgangspunkt bereit.

- [Playtest, Reproduktion und Rohdaten](MILESTONE_7_8B_PLAYTEST.md)
