# Horde Director · Milestone 7.4D

## Audit vor der Implementierung

| Bereich | Vor 7.4D |
| --- | --- |
| Spawn-Produzenten | `EncounterDirector` legte Patrouillen bei Touchdown an und erzeugte ab Missionsbeginn deren Mitglieder. `SwarmNestManager` lieferte fällige Nestausgänge. Patrouillenalarme und Extraktion beantragten Durchbrüche oder beschleunigten vorhandene Nester. Boreal Relay lief in einer eigenen Arena mit Ring-Refill. |
| Spawn-Pfad | Bodenbruch hatte bereits eine gemeinsame lokale `spawn`-Methode. Sie prüfte `openGround`, den Schwierigkeits-Cap und die Zahl der Erzeugungen im Tick. Patrol und Nest prüften ihre eigenen Mindestabstände. Sicht, Gegnerüberlappung und Navigationsanbindung fehlten im Spawn-Pfad. |
| Aktive Gegner und Cleanup | `HordeManager` nutzte eine dichte aktive Slotliste, wiederverwendbare Slots und fortlaufende Entity-IDs. Tod entfernte den Slot. MissionResult fror die Horde ein. Die Rückkehr zum Carrier räumte alle Slots. |
| Mission und Ressourcen | `MissionInstance` führte Carrier, Einsatzwahl, Boarding, Deployment, Bodenbruch, Ergebnis und Rückkehr. `ObjectiveManager` führte Alpha, Bravo und das optionale Nestziel. Convict Defense und die beiden Albatross-Container liefen als eigene Systeme. Zwei Extraktionsstrategien teilten den autoritativen Zustandsablauf. |
| 7.4A–C | Lebensgebundene Ziele und Patrouillenwahrnehmung aus 7.4A, Korridore, Grid und Recovery aus 7.4B sowie serverseitige Angriffsphasen, Kollisionsprüfung und Telegraphs aus 7.4C waren im Workspace eingebunden. |
| Netzwerk | Ein 30-Hz-Tick aktualisierte die Welt. Der Raum sendete 10-Hz-Horden-Vollframes und getrennte Spieler-, Missions- und Ereignispakete. Bodenbruch nahm neue Spieler bis Boarding auf. Reconnect mit bestehendem Slot war während des Einsatzes möglich. |
| Ausgangsmessung | Seed 421337, 1.800 Messticks und vier Operatoren. Die natürliche FREEFALL-Sättigung erreichte 1.000 Gegner und zehn Nester bei 0,766 ms Tick-P95. Die Ausgangsmessung trennte die reine Kandidatenprüfung zeitlich nicht auf. |

## Umsetzung

`MissionInstance` liefert den Missionszustand, den lebenden Trupp und aggregierte Angriffsphasen an `EncounterDirector`. Dieser führt die vorhandenen Patrouillen, Nester und Missionsprioritäten und ruft den neuen `HordeDirector` auf. Der Director berechnet den Druck, plant Wellen und reicht Kandidaten an `SpawnManager` weiter. Der Spawn Manager prüft alle Bodenbruch-Produzenten und führt denselben ECS-Erzeugungspfad aus. Wellen teilen Navigation und Gruppenverhalten mit den Patrouillen. [Spawn-Verwaltung](HORDE_SPAWN_MANAGEMENT.md) · [Gegner-KI](ENEMY_AI_ARCHITECTURE.md)

Die Balance liegt unter `director` in `swarm.json` und wird Teil des unveränderlichen `MissionBalance`-Snapshots. Die Registry validiert Ablaufzeiten, Schwellen, Gruppengrößen und Prüfgrenzen. Derselbe Missionsseed und dieselbe Folge von Eingaben pro Servertick liefern denselben Wellenverlauf. Der Director verwendet den vorhandenen Seed-Generator mit einem vom Raumseed abgeleiteten Strom. Bei Folgemissionen im selben Raum läuft dieser Strom weiter. Für Replays den Raumseed, Balance-Hash, Missionsnummer im Raum, Eingaben, Debugaktionen und Ticks festhalten. [Zustandsmaschine](HORDE_DIRECTOR_STATE_MACHINE.md) · [Balancing](HORDE_ENCOUNTER_PACING.md)

Der Missionssnapshot liefert Phase, Eintrittstick und aktive Wellen-ID. Zwei serverseitige Ereignistypen melden Beginn und Abschluss einer Welle. Details zur Diagnose sowie der Wellenknopf stehen im lokalen F2-Debugraum zur Verfügung. [Missionsintegration](HORDE_MISSION_INTEGRATION.md)

## Änderungsübersicht

| Bereich | Dateien |
| --- | --- |
| Erzeugung und Wellen | `HordeDirector.ts`, `SpawnManager.ts`, `EncounterDirector.ts`, `PatrolManager.ts`, `SwarmNestManager.ts`, `UniformGrid.ts` |
| Mission und Netzwerk | `MissionInstance.ts`, `FreefallRoom.ts`, `contracts/mission.ts`, `contracts/messages.ts`, `ui/App.tsx` |
| Balance | `balance/data/swarm.json`, `balance/definitions.ts`, `balance/registry.ts`, `balance/resolver.ts` |
| Verifikation | `horde-director.test.ts`, `multiplayer.test.ts`, `balance.test.ts`, `support/balance-trace.ts`, `benchmark.ts`, `benchmarkEnemyAI.ts`, `benchmarkMission.ts`, `scripts/playtest-horde-director.mjs`, `scripts/playtest-ms6.mjs` |
| Dokumentation | Dieser Bericht, die sechs thematischen Horde-Dokumente und Ergänzungen an Architektur, Performance und Balance-Workflow |

[Messungen](ENEMY_AI_PERFORMANCE.md) · [Abnahme und offene Spieltests](HORDE_DIRECTOR_PLAYTEST.md)

## 7.4E · Abnahme der Integration

Die Regressionen prüfen alle fünf Director-Phasen, reproduzierbare Wellen, Druckaufbau, Wellenabbruch, Reservierungsfreigabe, Nestzerstörung und priorisierte Missionsinteraktionen. Im Vier-Spieler-Test läuft eine bereits gestartete Welle über zwei Wiederverbindungen bei 1.000 aktiven Gegnern weiter. Die Mission verteilt dieselbe Wellen-ID und genau ein Startereignis. [Netzwerkprotokoll und Matrix](MULTIPLAYER_HORDE_STRESS_TEST.md)
