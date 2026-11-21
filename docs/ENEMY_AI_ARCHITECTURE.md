# Gegner-KI in FREEFALL · 7.4A

## Audit des Ausgangsstands

| Bereich | Vorhandene Implementierung | Schwachstelle im Ausgangsstand |
| --- | --- | --- |
| Arena | `Arena` füllt den Schabenring nach. `HordeManager` speichert Position, Lebenspunkte, Zielslot und Cooldown in Typed Arrays und recycelt Slots mit neuer Gegner-ID. | Der nächste lebende Operator gewinnt alle sechs Ticks ohne Wechselmarge. Ein Zielslot allein identifiziert weder die Verbindung noch das Leben. |
| Bodenbruch | `MissionInstance` steuert Missionsphasen. `EncounterDirector` seedet Patrouillen, begrenzt Spawns und verarbeitet Nestdruck, Durchbrüche und Extraktionsgeräusche. | Gruppen ersetzen ihr Ziel bei jeder Sichtprobe. Ein für Reconnect reservierter Operator bleibt in der Spielerliste. |
| Nester | `SwarmNestManager` verwaltet Emergenz, Austritte, Spawnrate, Schaden und Zerstörung. Garrison-Schaben werden an lokale Patrouillen gebunden. | Nester erzeugen Gegner unter Missions- und Hardcap. Sie koordinieren keine Angriffsrollen. |
| Wahrnehmung | Patrouillen nutzen Radius, Blickkegel für ruhige Gruppen, Deckung, Aufsetzschutz, begrenzte Geräuschhistorie und Kontaktgedächtnis. Die Arena nutzt Distanz. | Dieselbe Sichtlinie auf Y=1 gilt für jede Haltung. Fehlende Sicht lässt einen Slot sofort wechseln. |
| Navigation | Bodenbruch nutzt direkte Korridore und gecachte 5-m-Distanzfelder. `UniformGrid` begrenzt Nachbarabfragen beim Steering. Weltkollision integriert X und Z getrennt. | Ohne Route bleibt der gesperrte Rohpunkt im Zielvektor. Sicht in 0,5 m Höhe und Bewegungskollision über die gesamte Grundfläche können widersprechen. Es fehlen Stuck-Messung und Rückführung. |
| Kontakt und Schaden | `Battlefield` löst Nahkampf nach Operatorwaffen und Granaten aus. Schaben treffen sofort, mit Cooldown und zentraler Fraktionsauflösung. Operator-Nahkampf kann Schaben taumeln lassen. | Stehende Operatoren werden über Mittelpunkt und Sicht geprüft. Bewegte Operatoren nutzen einen Footprint, aber der Deckungstest endet am Körpermittelpunkt. Bodenhaltungen haben schon getrennte Trefferzonen. |
| Convict Defense | `Convicts` läuft vom Schiff zu Posten, prüft Sicht und Reichweite, feuert und lädt nach. Schaben können nahe am Schiff Convicts und Schiffsteile angreifen. | Convict-Schüsse scannen die aktive Liste bei Feuerbereitschaft. Sekundärziele werden separat aus Navigation und Nahkampf gesucht. |
| Netzwerk und Darstellung | Server simuliert mit 30 Hz. `FreefallRoom` überträgt Horden als binäre Positions-/Yaw-Snapshots unabhängig von Operator- und Missionssnapshots. Der Client interpoliert und animiert die sichtbaren Schaben prozedural in Instanzbatches. | Snapshotgröße wächst linear. Es gibt weder replizierte Gegner-KI-Zustände noch einen angreifenden Animationszustand, der einen Treffer auslöst. |

## Autoritative Zustände

Patrouillengruppen verwenden `PATROLLING`, `SUSPICIOUS`, `INVESTIGATING`, `ALERTED`, `CALLING_REINFORCEMENTS`, `ENGAGING`, `SEARCHING`, `RETURNING` und `ELIMINATED`. Sicht oder Geräusch führt aus der Route. Ein bestätigter Kontakt kann einen Verstärkungsruf auslösen. Nach Kontaktverlust läuft die Gruppe zum letzten bekannten Ort, sucht mit Ablaufzeit und kehrt zur Route zurück. Tod des Rufers beendet den Ruf. Das Missionsende unterbricht laufende Rufe.

Pro Schabe ergeben sich Verfolgung, Nahkampfbereitschaft und Erholung aus Ziel, `attackAt` und Stagger. Ein Kill entfernt den Slot aus der aktiven Liste. Es gibt keinen zeitversetzten Angriffstransfer zwischen Clientanimation und Server.

Die Balance Registry steuert Schabenwerte und Wahrnehmungsradius (`enemies.json`), Steering und Missionsdruck (`swarm.json`), Nestverhalten (`structures.json`), Convicts (`convicts.json`), Kontaktvolumen (`movement.json`) und Fraktionsschaden (`combat.json`). Die Einsatzschwierigkeit wird einmal pro Lauf aufgelöst.

## Ablauf nach 7.4A

1. `Battlefield.step` verarbeitet die Operatorbewegung samt Haltung. Arena und Bodenbruch übernehmen daraufhin gültige Ziele für den laufenden Tick.
2. Das Uniform Grid liefert begrenzte Nachbarn. Die versetzten Steering-Ticks bestimmen Wegpunkt und Geschwindigkeit. Die Bewegung prüft Weltkollision und erfasst blockierte Bewegung.
3. Ausrüstung, Waffen und Granaten laufen vor dem Schaben-Nahkampf. Der Nahkampf validiert Gegner, Ziel, Cooldown und Kontakt auf dem aktuellen Server-Tick.
4. Bodenbruch verarbeitet Convicts, Missionsziele und Extraktion. Der Encounter Director aktualisiert die Gruppen und Nester. Der nächste Kampftick übernimmt die neuen Gruppenziele.

`enemyTargeting.ts` enthält die gemeinsame Zielregel. `PatrolManager` bleibt Eigentümer der Gruppenzustände. `EnemyNavigation` verwaltet Bewegungsdiagnosen getrennt vom geschützten Schaben-ECS. Die neuen Debugdaten fahren im bestehenden Metrics-Paket des lokalen Missions-Debugrooms mit. [Zielauswahl](ENEMY_TARGET_SELECTION.md) · [Navigation](ENEMY_NAVIGATION.md) · [Nahkampf](ENEMY_COMBAT_VALIDATION.md)

## Änderungsübersicht

| Bereich | Dateien im Milestone |
| --- | --- |
| Simulation und Zielauswahl | `apps/server/src/simulation/Battlefield.ts`, `apps/server/src/systems/enemyTargeting.ts`, `apps/server/src/mission/MissionInstance.ts`, `apps/server/src/mission/EncounterDirector.ts`, `apps/server/src/mission/PatrolManager.ts` |
| Navigation | `apps/server/src/ecs/EnemyNavigation.ts`, `apps/server/src/mission/GroundNavigation.ts`, `apps/server/src/systems/horde.ts` |
| Nahkampf | `apps/server/src/systems/combat.ts`, `packages/shared/src/config/postureGeometry.ts` |
| Debug und Messung | `apps/server/src/rooms/FreefallRoom.ts`, `packages/shared/src/contracts/messages.ts`, `apps/client/src/ui/App.tsx`, `apps/server/src/benchmark.ts`, `apps/server/src/mission/benchmarkEnemyAI.ts` |
| Tests und Traces | `apps/server/test/enemy-ai.test.ts`, `apps/server/test/simulation.test.ts`, `apps/server/test/multiplayer.test.ts`, `apps/server/test/balance.test.ts` |
| Dokumentation | `docs/ENEMY_AI_ARCHITECTURE.md`, `docs/ENEMY_TARGET_SELECTION.md`, `docs/ENEMY_NAVIGATION.md`, `docs/ENEMY_COMBAT_VALIDATION.md`, `docs/ENEMY_AI_PERFORMANCE.md`, `docs/ENEMY_AI_PLAYTEST.md`, `docs/BALANCE_WORKFLOW.md` |

## 7.4B · Audit und Umsetzung

Im Stand 7.4A steuerten Verfolger auf die Operator-Mitte zu. Das bestehende Grid konnte bei hoher Zellbelegung immer dieselben Listenersten wählen. Abstands- und Zielkräfte konnten sich gegenseitig aufheben. Das 5-m-Raster fand gerade freie Engstellen, konnte aber freie Kurven übersehen, und die damalige Stuck-Erkennung sah vor allem abgeschnittene Weltbewegung.

Der Implementierungsplan beginnt mit begrenzten und rotierenden Grid-Abfragen, Separation und Körperkontakt. Darauf folgen freie Ringsektoren, ein geometrisch verfeinertes und budgetiertes Raster sowie Fortschrittsmessung und Recovery. Zum Abschluss werden Replikation und Last geprüft. [Schwarmverhalten](ENEMY_SWARM_BEHAVIOR.md) · [Navigation](ENEMY_NAVIGATION.md) · [Räumliche Partitionierung](ENEMY_SPATIAL_PARTITIONING.md) · [Recovery](ENEMY_STUCK_RECOVERY.md)

Der Server behält Zielbindung und Zustandswechsel der Patrouille, Nestspawns, Convict Defense, Schaden und Nahkampfvalidierung. Das Gegner-ECS und die Schaben-Assets verwenden die geschützte Prüfsummen-Baseline. Colyseus veröffentlicht weiterhin dieselben 10-Hz-Hordensnapshots mit ID, Position, Yaw und Typ. Der Client interpoliert die empfangenen Frames. Beim Reconnect setzt der Server den laufenden Raum fort und wieder gelieferte Vollsnapshots reichen für die Darstellung der Horde. Steuerung, Zielwahl, Pfad, Nahkampf-Cooldown und Recovery benötigen keine Client-Simulation. Der lokale Debugroom ergänzt das vorhandene Metrics-Paket um vier Statusproben und Profilwerte.

## 7.4C · Gegnerkampf

Der Audit des eingespielten 7.4B-Stands bestätigte die lebensgebundene Zielwahl aus 7.4A, die Ringsektoren, budgetierten Korridore und das lokale Grid aus 7.4B. Der bisherige Nahkampf prüfte nach Waffen und Granaten den aktuellen Zielslot, Schutz, Cooldown und Körperkontakt. Er verursachte beim ersten gültigen Kontakt sofort Schaden und startete dann den 39-Tick-Cooldown. Stagger sperrte den Schlag und löste vorhandenen Knockback aus. Tote Gegner wurden aus der aktiven Liste entfernt. Convicts und Albatross benutzten dieselbe Schadensauflösung mit eigener Boden-Sichtprüfung. Die 10-Hz-Hordenframes kannten Position und Yaw. Die Schabe hatte prozeduralen Gang und Trefferreaktion. Es gab keinen Angriffsclip oder Schaben-Windup-Sound.

`Battlefield.step` ruft nach Operatorbewegung, Zielwahl, Steering, Weltkollision, Ausrüstung, Waffen und Granaten `EnemyCombat.update` auf. Die Komponente ergänzt das vorhandene Horde-ECS um zeitlich begrenzte Nahkampfzustände, gebundene Ziele und den Ausgang jedes Angriffs. `PatrolManager` führt weiter Missionsgruppen und Wahrnehmung. `EnemyNavigation` und `EnemyApproach` führen Anmarsch, Rotation und Neuplatzierung. Die Entscheidung ist damit in Arena und Bodenbruch dieselbe. Entfernung, Blickrichtung und noch gültige Körpergeometrie werden serverseitig erneut geprüft. [Kampfablauf](ENEMY_COMBAT_BEHAVIOR.md) · [Trefferprüfung](ENEMY_ATTACK_VALIDATION.md)

Die Serverphase bestimmt die Körperpose im Hordenframe. Der vorhandene Client-Zeitpuffer positioniert und animiert die Instanzen mit demselben Server-Tick. Die Schabe verwendet das bestehende Mesh und dessen Nickachse. [Telegraph und Replikation](ENEMY_ATTACK_TELEGRAPHS.md)

Das Kostenprofil trennte im Audit Korridorprüfungen, Nachbarsuche, Bewegungskollision und Nahkampf. Bei weit entfernten Gegnern dominiert der Hordenlauf über die dichte Liste. Im Nahkampf entscheiden erst Cooldown, Zielgültigkeit und eine quadrierte Entfernungsgrenze über teurere Volumen- und Deckungsprüfungen. F2 zeigt diese Prüfzeit und begrenzte Angriffsproben. [Messwerte](ENEMY_AI_PERFORMANCE.md)

## 7.4D · Begegnungssteuerung

Der Missions-Tick ruft nach Kampf, Convict Defense, Ziel- und Extraktionsfortschritt den `EncounterDirector` auf. Der neue `HordeDirector` liefert budgetierte Gruppenaufträge an `SpawnManager`. Die neuen Gruppen laufen über `PatrolManager`, das vorhandene Ground-Raster und die Ziel- und Kampfkomponenten aus 7.4A–C. Die Welle gibt einen erreichbaren ersten Anlaufpunkt vor. Laufende Zielwahl und Treffer bleiben in der Gegner-KI. Der Schaben-Asset- und Animationspfad verwendet weiterhin die vorhandenen Dateien. [Audit und Schnittstellen](HORDE_DIRECTOR.md)

## 7.4E · Integration

Die dichte ECS-Liste besitzt die Lebensdauer der Schaben. `PatrolManager` bereinigt alte Mitgliedschaften im Wahrnehmungstakt und prüft dabei auch, ob der Slot bereits einer neuen Gruppe gehört. `EnemyCombat` bindet einen Angriff an Gegner-ID, Operatorinstanz und Lebens-ID. Ein Verbindungsabbruch unterbricht einen ausstehenden Schlag sofort. Die Rückkehr zum Carrier entfernt die aktiven Gegner und ersetzt den Missionsdirector samt Routen-Cache, Spawn-Aufträgen und Nestzustand. [Integrationsaudit und Release-Gates](MILESTONE_7_4_FINAL_ACCEPTANCE.md)
