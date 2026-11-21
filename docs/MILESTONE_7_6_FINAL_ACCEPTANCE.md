# Milestone 7.6 · Funktionsnachweis und Release-Gates

**Vier Planeten spielbar. Formale Release-Abnahme offen.** Der Host wählt in der Missionskonsole Grüne Ebene, Wüste, Eiswelt oder Wald und kann einen Welt-Seed angeben. Autoritatives Terrain, Navigation, WorldPlan und Missionsplan sind integriert. Die vier Oberflächen verwenden eine gemeinsame Engine mit eigenen Relief-, Material-, Licht- und Umgebungsprofilen.

| Phase | Stand |
| --- | --- |
| 7.6A · Grundlage | Heightfield, Welt-Seed, Terrain-Kollision, Navigation und grüne Referenzwelt mit vollständigem Einsatz. |
| 7.6B · Vier Planeten | Vier wählbare Profile mit unterschiedlichen Reliefs, Farben, Landmarken, Licht und Nebel. |
| 7.6C · Umgebung | Lokale Felsen, Stämme, Kronen, Eis, Bodenvegetation, Bogen, Instancing und LOD. Higgsfield-Piloten durch lokale prozedurale Modelle ersetzt. Budget 0 €. Detailgrad und Naturtreue bleiben Teil der visuellen Spielabnahme. |
| 7.6D · Spiel und Koop | MissionGenerator, Host-Auswahl, Reconnect, Runtime-Spawn-Validierung, Zielerreichbarkeit, beide Extraktionspfade und Result. |
| 7.6E · Validierung | Automatisierte Funktionsnachweise und lokaler Browserlasttest vorhanden. Reale menschliche Einsatzdauer, Zielgeräte und Release-Freigabe stehen aus. |

## Ausgeführte vollständige Einsätze

Reguläre Bewegungs-, Interaktions- und Kampfeingaben an die Serversimulation. Keine Teleports in diesen Läufen. Die Zeit bezeichnet autoritative Spielzeit von Einsatzbeginn bis MissionResult bei 30 Hz. Der Weg misst die X/Z-Route des führenden Operators ab Landung.

| Planet | Welt-Seed | Missions-Seed | Auftrag | Trupp | Extraktion | Weg | Einsatzzeit |
| --- | ---: | ---: | --- | ---: | --- | ---: | ---: |
| Grüne Ebene | 17 | 4 | Nestjagd, Normal | 1 | Albatross | 356 m | 0:58 |
| Grüne Ebene | 76 | 20 | Relaisverbund, Leicht | 4 | Ballon | 846 m | 3:24 |
| Wüste | 31 | 0 | Relaisverteidigung, Normal | 1 | Albatross | 394 m | 1:05 |
| Eiswelt | 48 | 0 | Relaisverteidigung, Normal | 1 | Albatross | 394 m | 1:05 |
| Wald | 63 | 0 | Relaisverteidigung, Normal | 1 | Albatross | 922 m | 2:03 |

Die grüne Nestjagd prüfte auch Waffenbeschuss, Nachladen, den Albatross-Nachschub und die Rückkehr auf den Carrier. Der Vierertrupp am Ballon feuerte mit regulären Eingaben im Countdown. Der getrennte Vier-Peer-WebSocket-Test prüfte Welt-Hash, Operatorhöhen und Positionen, gleichzeitige Interaktionen, Reconnect und das gemeinsame Resultat. Der Browser-Lastlauf verwendet eine gesonderte Fixture mit 1.000 Gegnern und gestellten Operatorpositionen. [Reproduktion und Messwerte](WORLD_PERFORMANCE.md)

## Release-Gates

| Gate | Stand | Nachweis oder offene Arbeit |
| --- | --- | --- |
| Determinismus und Standorte | PASS | 400 von 400 gültige Welten und Aufträge. Pro Biom Welt-Seeds 0–99. Versionsabgleich, Hash, Terrainhöhen, Steigung, Chunk-Grenzen, Spawn- und Extraktionsstandorte geprüft. |
| Spielbarkeit | PASS, automatisiert | Vollständiger Lauf pro Planet, beide Extraktionsarten und Nachschub nachgewiesen. Haltungen und Dive auf allen vier Oberflächen geprüft, Stammkollision und Umweg im Wald geprüft. |
| Koop | PASS, lokal | Vier WebSocket-Peers teilen Welt, Plan und Ergebnis. Reconnect erhält Welt und Fortschritt. |
| Last und Regression | PASS, lokal | Reproduzierbarer Wald-Lasttest. Der Browserbericht nennt Auslastung und Hardware. 280 von 280 Tests bestanden. Build, TypeScript, Balance und Schabe-Prüfsummen erfolgreich. Vite meldet weiterhin die Warnung zum Hauptbundle über 500 kB. |
| Assetbudget | PASS | Lokale Three.js-Geometrie und vorhandene Materials. 0 € Kosten, keine Higgsfield-Assets in der Laufzeit. |
| Missionsdauer | OFFEN | Die eingesetzten Kurzvorlagen erreichten mit den automatisierten Eingaben 0:58 bis 3:24. Die Zielspanne von 20–30 Minuten ist unbestätigt. |
| Visuelle und manuelle Abnahme | OFFEN | Visuelle Browser-Stichproben in allen vier Biomen und vollständige automatisierte Einsätze vorhanden. Menschlicher Vierertrupp, visuelle Freigabe und eine Detailrunde für natürliche Props stehen aus. |
| Produktionsperformance | OFFEN | Weitere Zielhardware, GPU-Speicher, Langzeit-Memory und Mehrraum-/WAN-Soak stehen aus. Aus dem lokalen Lauf folgt keine Aussage über sämtliche P0/P1-Fehler. |

## Geänderte Dateien

- **Shared.** `world/{PlanetProfiles,Terrain,WorldGenerator}.ts`, `config/{movement,posture,postureGeometry,worldGeometry}.ts`, `definitions/{deployment,missions,proceduralMissions}.ts`, `contracts/{mission,missionPlan}.ts`, `index.ts`.
- **Server.** `mission/{MissionGenerator,MissionLocations,MissionInstance,ObjectiveManager,GroundNavigation,SpawnManager,PatrolManager,EncounterDirector,ExtractionSystem,Convicts,SwarmNestManager}.ts`, `ecs/EnemyCombat.ts`, `simulation/Battlefield.ts`, `systems/{combat,grenades,horde}.ts` und `networking/snapshots.ts`.
- **Client.** `game/{Game,Prediction,RemoteInterpolation}.ts`, `ui/CarrierConsole.tsx`, `rendering/{ArenaView,Agents,ContactShadows,EnemyVisualLOD,ThirdPersonCamera,VisualEffectsManager}.ts`, `rendering/mission/{GeneratedTerrain,Conifer,MissionEnvironment,MissionMarkers,SwarmBreachController,ConvictView,RecoveryView}.ts` und `rendering/weapons/GrenadeView.ts`.
- **Nachweise.** `apps/server/test/{procedural-world,procedural-mission,multiplayer}.test.ts`, `scripts/playtest-horde-director.mjs` und `docs/enemies/schabe/baseline.sha256`. Die Schabe verwendet dieselbe Geometrie, dieselben Farben und dieselben Animationen mit dem Höhenversatz der neuen Welt.
- **Dokumentation.** Einstieg in `README.md`, Verweis im Audit von 7.5 und folgende Detailberichte. [Architektur](PROCEDURAL_WORLD_ARCHITECTURE.md), [Generator](WORLD_GENERATION.md), [Seeds](WORLD_SEEDING.md), [Planeten](PLANET_PROFILES.md), [Biome](BIOME_PROFILES.md), [Terrain](TERRAIN_COLLISION.md), [Navigation](WORLD_NAVIGATION.md), [Assets](ENVIRONMENT_ASSET_PIPELINE.md), [Higgsfield](HIGGSFIELD_ENVIRONMENT_ASSETS.md), [LOD](WORLD_LOD_AND_STREAMING.md), [Integration](WORLD_MISSION_INTEGRATION.md), [Multiplayer](WORLD_MULTIPLAYER.md) und [Performance](WORLD_PERFORMANCE.md).

Für die nächste Abnahmerunde sind mehrstufige Einsatzvorlagen mit gestaffeltem Gegnerdruck und Versorgungsphasen sinnvoll. Die beobachteten Wege von rund 350–920 m lassen sich bereits in einer 480-m-Karte unterbringen. Die kurzen Missionszeiten werden vor allem durch die Zahl und Dauer der vorhandenen Ziele sowie die Nutzung von Sprint und schnellem Abflug bestimmt.
