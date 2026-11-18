# Von Boreal Relay zu Missionen

Historischer Entwurf aus Milestone 3. Die realisierte Missionsarchitektur und der Stand von Operation Bodenbruch sind separat dokumentiert. [Missionssystem](MISSION_SYSTEM.md) · [Operation Bodenbruch](MISSIONS/OPERATION_BODENBRUCH.md)

Boreal Relay bleibt als eigenständiger Modus für Gameplay-, Koop- und Lasttests erhalten. Der aktuelle Room startet mit dem ersten Spieler. Der Host passt die Zielgröße der Horde dynamisch an. Das Ende ergibt sich aus dem Room-Lebenszyklus. Gelingensbedingungen, Extraktion und Fortschrittsverbuchung sind spätere Spielschritte.

## Arena-Abhängigkeiten

| Heute | Schnitt für Missionswelten |
| --- | --- |
| `config/arena.ts` definiert eine quadratische Welt mit ±56 m und `movePlayer` verwendet deren Clamp auch in der Client-Prediction. | Server liefert die Welt-ID und versionierte statische Bewegungsdaten beim Deployment. Beide Laufzeiten verwenden denselben Bewegungs- und Kollisionseingang, damit Reconciliation stabil bleibt. |
| `ArenaEncounter` beschreibt Radius und Auffüllung. `Arena.step` ruft Spawn und Despawn direkt auf. | Arena- und Missionsmodus liefern Spawn- und Despawn-Aufträge vor der Simulation. HordeManager, Grid, Steering und Snapshot-Lebenszyklus verarbeiten weiterhin dichte Slots und stabile Spawn-IDs. |
| `Player.ts` setzt feste Slot-Positionen und Respawn-Schutz. Arena löst Respawn nach einem Timer aus. | Welt definiert Einsatz- und Wiedereinstiegsregionen. Die Modusregeln wählen Respawn, Verstärkung durch Team oder Beobachterstatus. HP und Lebensnummer bleiben autoritativ. |
| Terrain und Militärbasis sind Client-Geometrie. Bewegung und Gegner laufen auf XZ mit ebenem Boden, Hitbox-Zentren und Schussschnitt verwenden dieselbe Ebene. | Ein erster Missionsprototyp bleibt auf einer Ebene. Bei späterer Höhe und Hindernissen entstehen replizierbare Kollisionsdaten, Bodensampling, Traversierung und gemeinsame Trefferabfragen. Client-Meshes leiten Grafik aus derselben Version ab. |
| Spieler- und Hordensnapshots, Interpolation, Interest und Rendergrenzen nehmen eine kompakte Arena an. Gegnerkoordinaten nutzen i16 bei 256 Einheiten pro Meter. | Für größere Welten regionenrelative Koordinaten oder versionierte Frameformate und Interest Management ergänzen. IDs und Interpolation sollten erhalten bleiben, während Frames nur relevante Regionen enthalten. |
| Kamera nutzt eine gemeinsame Zielachse über `aimRay` und folgt der lokalen Vorhersage. | Erlaubte Kameraposition und Kollisionsregeln aus Welt und Spielmodus einspeisen. Die Schusslinie aus der Zielabsicht serverseitig ableiten und bei Hindernissen getrennt von der Kameraposition validieren. |
| Colyseus-Room besitzt Host, Takt, Eingaben, Live-Snapshots und Arena-Hordengrößen. | Room bleibt Session-Grenze. Modusregeln bestimmen, welche Nachrichten in Lobby, Einsatz und Auswertung akzeptiert werden. Gegner- und Spielerdaten behalten eigene Echtzeitkanäle. |

In Milestone 3 ist das Profil für die Arena-Spawns in `ArenaEncounter` ausgelagert. Der Step der Arena und der Room behalten ihre Aufgaben.

## Schnittstellenstrategie

| System | Daten und Verantwortung |
| --- | --- |
| Mission | `MissionDefinition` ist die versionierte Vorlage aus Welt-ID, Startparametern, Schwierigkeit und einer Liste von `ObjectiveDefinition`. `MissionInstance` besitzt eine eindeutige Einsatz-ID, Seed, Squad und Weltversion. `MissionState` hält serverseitig Phase, Tick, Zielstände und gewertete Ereignisse. `ObjectiveDefinition` referenziert Zieltyp, Region und Abschlussbedingungen. |
| Welt | `WorldDefinition` enthält Maße, Lade- und Kollisionsdaten, Biome- und Region-IDs. `BiomeDefinition` bündelt Gelände- und Inhaltsprofile. `SpawnRegion` beschreibt zulässige Flächen, Kapazität und Tags. `ExtractionZone` definiert Region, Aktivierungsregeln und Haltezeit. |
| Encounter | `EncounterDirector` reagiert auf Tick, Ziele, Spielerpositionen und Fortschritt. `EnemySpawnGroup` referenziert Archetypen, Mengen und Spawn-Regionen. `ThreatLevel` ermittelt Budget und Häufigkeit aus Missionszustand und Schwierigkeit. `ReinforcementEvent` übergibt geplante Spawn-Aufträge mit Zeitpunkt und Region. Der Director setzt ein Spawn-Budget je Tick durch. Das ECS verwaltet die eigentlichen Gegner. |
| Game Flow | `Lobby` hält Ready-Status, Mission und Loadouts. `Deployment` bestätigt Welt, Konfiguration und Roster. `ActiveMission` simuliert Ziele und Bedrohung. `Extraction` prüft Countdown, räumliche Präsenz und Abholbedingungen autoritativ. `MissionResult` ist ein aus dem finalen Serverzustand erzeugter unveränderlicher Abschluss. |
| Fortschritt | `MissionRewards` entsteht aus einer versionierten Belohnungstabelle und dem `MissionResult`. `PlayerExperience`, `WeaponExperience`, `EquipmentProgression` und `ShipResearch` sind Projektionen aus bestätigten Belohnungen. Ein späterer Dienst verbucht pro Einsatz-ID und Spieler-ID idempotent außerhalb des Echtzeittakts. |

## Implementierungsfolge

1. Arena-Konfiguration als ersten Modus durch einen kleinen verbindlichen Welt- und Spawn-Vertrag einspeisen. Gleichbleibende Seed-, Treffer- und Snapshot-Tests sichern das Verhalten.
2. Eine flache Einsatzkarte mit mehreren Zielen bauen. Server prüft Zustandsübergänge und repliziert kleine Missionsdeltas. Das Squad nutzt dieselbe Bewegung, Animation und Kampf-Simulation wie in Boreal Relay.
3. `EncounterDirector` anschließen und Spawns zeitlich budgetieren. Nach Bedarf Relevanzfilter hinzufügen und 1.000 Gegner unter Missionsbedingungen messen.
4. Deployment und Extraktion in den Room-Lebenszyklus integrieren. Verbindungsabbruch, Wiederbeitritt und einheitliche Ergebnisregeln vor Live-Fortschritt festlegen und testen.
5. Schiff, Loadouts und Missionswahl als Lobby- und Metaspiel-Funktionen aufsetzen. Die bestätigten Ergebnisse anschließend in einem separaten Fortschrittsdienst verarbeiten.

Neue Welten, Mission-Engine und persistente Progression gehören zu diesen Folgeschritten.
