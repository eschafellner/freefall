# Missionssystem

Der Colyseus-Room `bodenbruch` führt eine `MissionInstance` aus. Der Room `freefall` bleibt der Arena-Einstieg mit eigener Hordensteuerung und Respawns. Beide nutzen den gemeinsamen `Battlefield`-Tick, Eingabevalidierung, Waffen, Spieler-Snapshots und Schaben-ECS. Die Simulation rechnet mit 30 Hz in XZ-Koordinaten und importiert kein Three.js.

## Definitionen und Zuständigkeiten

- `MISSION_REGISTRY` verbindet die Missions-ID mit Welt und Zielen. Die Welt enthält den Landepunkt. `WORLD_REGISTRY` hält die statische Karte einschließlich Bewegungshindernissen, Patrouillenrouten und Durchbruchregionen.
- `MissionInstance` hält den Phasenstatus und prüft Interaktionen anhand lebender, verbundener Spieler und autoritativer Positionen. `ObjectiveManager` verwaltet Aktivierungen, Abhängigkeiten, Zeitziele und den Nestzähler.
- `EncounterDirector` koordiniert Wahrnehmung, Rufe, Regionenauswahl, Nestproduktion und Gegnerbudget. `ArenaView` integriert Missionswelt und Effekte in den gemeinsamen Renderer.
- Aktivierungsziele deklarieren ihre Reichweite, optionale Abhängigkeit und Verteidigungszeit. Weitere Zielarten erhalten einen eigenen Handler im Objective Manager und einen Präsentationszweig im HUD. Eine neue Karte registriert ihre Definition, einen Room-Einstieg und die passende Missionsumgebung.

## Phasen und Interaktionen

Der bestehende Missions-Room beginnt auf dem Skyfall Carrier. Der Host konfiguriert den Einsatz am physischen Missionstisch. Bereitschaft und Boarding leiten die synchrone Flugsequenz ein. Der ObjectiveManager hält den Ablauf von Alpha, dessen Verteidigungszeit und die Freischaltung von Bravo. Nach beiden Relais bleibt das Primärziel abgeschlossen. Ein MissionResult entsteht bei erfolgreicher Extraktion oder beim vollständigen Teamwipe. [Game Flow](GAME_FLOW.md) · [Extraktion](EXTRACTION_SYSTEM.md)

## Netzwerk

| Kanal | Rate und Inhalt |
| --- | --- |
| `input` | Validierte Eingaben mit Sequenznummer. |
| `players` | 20 Hz mit Tick, Host, Spielerstatus und Eingabebestätigung. |
| `horde-wide` | 10 Hz mit dem bestehenden 10-Byte-Gegnerlayout und XZ-Skalierung 128 Einheiten pro Meter. Der Arena-Kanal `horde` verwendet weiter 256. |
| `mission-state` | 5 Hz mit Phase, Schwierigkeit, Zielzuständen, Timern, Alarmgebern, Threat und vollständiger Liste von Nestern und Resten. |
| `mission-events` | Geordnete Ereignisliste bei Änderungen im Server-Tick. |
| `shot` | Autoritativer Trefferstrahl. Missionstreffer auf Nester tragen optional die Nest-ID. |
| `metrics` | 2 Hz mit Tickdauer, Ausführungsrate und aktiven Gegnern. |

Start- und Endticks treiben die Darstellung. Mission- und Extraktionszustände sind aus den Snapshots rekonstruierbar. Erstbeitritt ist bis zum verriegelten Abflug möglich. Eine abgebrochene Verbindung wird über dieselbe Session-ID bis zu zwölf Sekunden wiederaufgenommen.

## Debug und Messung

`FREEFALL_MISSION_DEBUG=1 npm run dev` aktiviert die lokalen Missionsbefehle auf einem direkt an Loopback gebundenen Server. Der Server prüft den aktuellen Host bei jeder Aktion. **F3** blendet im Debug-Room die statischen Routen und Durchbruchregionen ein. **F2** zeigt Live-Telemetrie. Die Benchmarks und Testgrenzen stehen im Performance-Protokoll. [Performance](PERFORMANCE.md)
