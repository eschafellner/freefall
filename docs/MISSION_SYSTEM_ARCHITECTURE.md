# Mission System · Milestone 7.5

Dieser Audit beschreibt den Stand von 7.5. Der Spielpfad ab 7.6 ist in der [Weltintegration](WORLD_MISSION_INTEGRATION.md) dokumentiert.

## Bestandsaufnahme vor 7.5

| Bereich | Vorhandene Implementierung und Grenzen |
| --- | --- |
| Start und Phase | Der Colyseus-Room `bodenbruch` erzeugt eine `MissionInstance` mit `BODENBRUCH`. Der Host wählt Planet, Mission und Schwierigkeit in Reichweite der Missionskonsole und gibt Boarding frei. Alle verbundenen Operatoren melden sich im Albatross bereit. Timer führen über Fallflug und Touchdown zum Bodeneinsatz. |
| Schauplätze | Dev’ Ault ist der einzige Eintrag in `PLANET_REGISTRY`. `WORLD_REGISTRY` enthält die feste Bodenbruch-Oberfläche. Der Skyfall Carrier ist ein eigenes Hub-Kollisionslayout. Boreal Relay ist eine separate Testarena. `MissionEnvironment` rendert die Bodenoberfläche und die beiden bestehenden Relais. |
| Ziele | `BODENBRUCH.objectives` enthält Alpha mit zeitgesteuerter Verteidigung, Bravo mit Alpha als Voraussetzung und eine optionale Nestquote. Der generische `ObjectiveManager` prüft Radius, Status und Abhängigkeit. Die Missionsinstanz prüft lebenden Operator, Phase und Interaktionsrate. |
| Einsatzorte | `WorldDefinition` enthält vier aus der Albatross-Position abgeleitete Spawns, Hindernisse, Servicefläche, Relaisstandorte in der Missionsdefinition, Patrouillenrouten, Durchbruchregionen und ein Startnest. Das flache Kollisionsgelände liegt bei Y=0. `GroundNavigation` verbindet freie Zellen über geometrisch freie Kanten. |
| Kampf und Nachschub | `EncounterDirector`, `HordeDirector` und `SpawnManager` teilen Populations- und Tickbudgets. Nester sind serverseitig per Waffe oder Granate zerstörbar. Convicts verteidigen die Albatross. Zwei Nachschubcontainer sitzen am gelandeten Schiff. |
| Extraktion | Nach beiden Hauptzielen erlaubt `ExtractionSystem` den Start am flugfähigen Schiff oder eine Ballonrettung auf freier Fläche. Sicherung, Haltung, Lebensstatus und Abflug werden serverseitig geprüft. Die Ballonrettung wiederholt verpasste Anflüge. |
| Ergebnis und Fehlschlag | Erfolgreiche Extraktion oder Verlust des Teams finalisiert ein Ergebnis mit Convict-, Schiff-, Kampf- und individuellen EP-Daten. Das bestehende EP-Modell honoriert Hauptziele und extrahierte Teilnehmer. Fortschritt und Resultat leben im Raum. Es gibt keinen persistenten Account-Fortschritt und keinen Save/Load-Einsatz. |
| Mehrspieler | Geteilter Room mit vier Slots, Snapshots für Operatoren, Gegner und Mission sowie Mission Events. Hostwechsel bei Disconnect. 12 Sekunden Reconnect mit bestehender Session. Neue Operatoren können bis Boarding beitreten. |
| Feste Referenzen | `FreefallRoom` startet Bodenbruch, `MissionInstance.select` erlaubte nur die feste Definition, `Game` nutzte deren Oberfläche und die Missionsregistry, `CarrierConsole`, `MissionHud` und `MissionMarkers` bezogen Texte und Ziele aus festen Definitionen. |
| Balance | `BalanceRegistry` validiert alle Datendateien. `resolveMissionBalance` friert Schwierigkeit und Missionsmodifikatoren für die Simulationssysteme ein. |

## Serverpfad seit 7.5

1. Die Missionskonsole sendet eine Auswahl an den Room. Der Room prüft die Host-Rolle, die Missionsinstanz prüft Phase und Konsolenreichweite.
2. Für einen prozeduralen Auftrag liefert der MissionGenerator einen unveränderlichen MissionPlan, die ausführbare MissionDefinition und effektive MissionBalance. Der Validator prüft den Kandidaten vor seiner Freigabe.
3. Der bestätigte Plan liegt vom Briefing bis zur Carrier-Rückkehr in derselben MissionInstance. Die bestehende Zustandsmaschine steuert Deployment, Zielphase, Extraktion und Ergebnis.
4. Der ObjectiveManager verarbeitet Interaktionen, Zielzeit und bestätigte Nestzerstörung. EncounterDirector, HordeDirector und SpawnManager verwenden weiterhin die gemeinsamen Ressourcen und Regeln.
5. MissionResult erfasst Einsatz-ID, Plan-ID, Planet, Seed, Vorlage, Schwierigkeit, Ausgang, Dauer in Ticks, Zielzustände, Convicts, Albatross, extrahierte Operatoren, Kampfstatistik und bestehende EP. Das einmalig erzeugte Ergebnis bleibt bis zur Carrier-Rückkehr verfügbar.

Operation Bodenbruch bleibt als feste Auswahl spielbar. Die generierte Definition übernimmt die vorhandene Szene und das Landing, ersetzt die Zielordnung und schränkt die regionalen Durchbruchkandidaten ein. Der Client rendert die fest gebauten Relais und Kollisionsgeometrie und verwendet die vom Server bestätigten Ziele für Marker, Lampen, Interaktionstexte und HUD. [Generator](PROCEDURAL_MISSION_GENERATION.md) · [Koop](COOP_MISSION_SYNCHRONIZATION.md)
