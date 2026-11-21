# Prozedurale Weltarchitektur

## Audit vor 7.6A

- **7.1–7.3.** ArenaView verwaltet Szene, Beleuchtung, Materialien, AssetRegistry und Darstellung. Spielerbewegung, Haltung, Dive und Trefferkörper liegen gemeinsam in Shared und werden serverseitig simuliert. Die Vorhersage verwendet denselben Code. Die vorhandenen GLB-Ladepfade sind für registrierte Modelle ausgelegt.
- **7.4.** GroundNavigation nutzt ein X/Z-Gitter und budgetierte Distanzfelder. EnemyNavigation, Horde Director und SpawnManager prüfen Hindernisse, Freiraum, Gegnerdichte und Sicht. Die Gegnerpositionen werden kompakt als X/Z übertragen. Ihre Höhe kann aus der Oberfläche abgeleitet werden.
- **7.5.** MissionGenerator erstellt seedbasierte Pläne, validiert Zielgraph, Deployment, Extraktion und Spawn-Regionen und bindet Balance und Ziele an den Einsatz. MissionInstance und FreefallRoom verwalten Ablauf, vier Operatoren und Reconnect. Match lädt Pläne per ID. Dev’ Ault ist das einzige vorhandene Missionsprofil. MissionEnvironment, Bewegung, Treffer und Darstellung verwenden an mehreren Stellen eine Ebene bei Y=0. Die Release-Freigabe von 7.5 steht laut Abnahmebericht aus.
- **Messung.** Server und Browser haben vorhandene Instrumentierung für Hordenlast und Frames. Die Testberichte von 7.5 beziehen sich auf die feste Welt.

## Implementierungsplan für 7.6A

1. Ein versioniertes Heightfield in Shared erzeugt Höhen in Zentimetern, deterministische Standorte und feste Chunk-Grenzen. Ein Abgleich der Welt-ID prüft den rekonstruierten Weltinhalt. Das Render-Mesh und die Kollisionsabfragen verwenden dieselben Dreiecke.
2. Die existierende WorldDefinition trägt die Oberfläche. Bodenbewegung, Dive, Navigation, Trefferabfragen und Spawn-Kontrolle verwenden dieselbe Abtastung. Die Landefläche lässt Raum für Albatross, Trupp und Nachschub.
3. Die Carrier-Auswahl führt World Seed und Mission Seed getrennt. Der Missionsgenerator bekommt ein Profil mit den Standorten dieser Welt. Der Raum überträgt die Weltidentität mit dem Missionsplan und behält den Plan beim Reconnect.
4. Die grüne Referenzwelt erhält eine eigene chunkbasierte Terrain-Darstellung. Beide Extraktionspfade und Bodenbruch bleiben über die regulären Einstiegspunkte erreichbar.
5. Seed-Matrix, Kollision, vollständige Einsatzläufe und Browser-Smoke-Test prüfen die Referenz vor der Erweiterung um die übrigen Biome.

Bei 5,8 m/s Geh- und 9,2 m/s Sprintgeschwindigkeit ergeben 600–1.000 m Einsatzroute bei angenommenen 4 m/s effektivem Tempo rund 2½–4¼ Minuten Reisezeit. Eine 480 × 480 m große Karte erlaubt solche Routen mit mehreren Zielen und Rückwegen. Kampf, Interaktionen und Extraktion müssten den übrigen Teil des 20–30-Minuten-Ziels tragen. Diese Größenordnung ist eine Ausgangshypothese. Die kurzen vorhandenen Relais- und Extraktionstimer machen einen eigenen Playtest zur Einsatzdauer erforderlich.
