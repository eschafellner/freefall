# Bodenbruch, Resupply und Extraktion

| Missionssituation | Verhalten |
| --- | --- |
| Boarding, Deployment und Touchdown | Die Mission setzt Crew, Ship, Convicts, Patrouillen und Startnester nach ihren bestehenden Regeln auf. Erst der erste Bodenkampftick aktiviert die Wellensteuerung. |
| Aktiver Einsatz | CALM kann in eine dynamische Welle wechseln. Angerufene Verstärkung, sich öffnende Durchbrüche und geboostete Nester haben Vorrang. Reguläre Nestproduktion und die Welle teilen ihre Budgets. |
| Alpha, Bravo und optionales Nestziel | Die Relay-Interaktion startet die vorhandene Verteidigungszeit. Während dieser Phase pausieren neue dynamische Wellen und laufende Aufträge enden. Die vorhandenen Nest- und Patrouillenregeln tragen den Druck. Die Abschlusslogik bleibt beim `ObjectiveManager`. |
| Nestzerstörung | Das Nest und sein fälliger Spawn fallen sofort aus dem aktiven Bestand. Eine laufende dynamische Welle gibt ihre offene Gruppe frei. Die übrige Garnison bleibt bestehen. Der Director erstellt keine Ersatznester. |
| Albatross-Nachschub | Bodenbruch hat zwei Container an der gelandeten Albatross. Die vorhandene Interaktion prüft Entfernung, Haltung, Ressourcen und Ladungen. Während eines Nachschubvorgangs pausiert der Director. Anflug und Abflug sind Teil von Deployment und Albatross-Evakuierung. Der Einsatz hat keinen getrennten Resupply-Anflug auf Abruf. |
| Extraktion verfügbar und läuft | Die dynamische Wellenproduktion steht zurück. Bei Albatross und Ballon gelten die vorhandenen Start-, Sicherungs- und Flugregeln. Die Missionsskripte behalten ihr zeitlich und über das vorhandene Verstärkungsbudget begrenztes Signal für Nestdruck und Patrouillen. |
| Abbruch der Extraktion | Die vorhandene Zustandsmaschine kann zur Extraktionswahl zurückkehren. In dieser Phase beginnt weiterhin keine neue Welle. |
| MissionResult und Carrier | Welle, Reservierung, offene Patrouillenplätze, Nestaufträge und Verstärkungsrufe werden geschlossen. Der Missionssnapshot enthält keinen laufenden Director mehr. Das bestehende Ergebnis und die Carrier-Rückkehr regeln Belohnungen und Gegner-Cleanup. |

## Synchronisierung

In `mission-state` stehen Zustand, Eintrittstick und gegebenenfalls Wellen-ID des laufenden Einsatzes. `HordeWaveStarted` und `HordeWaveEnded` fahren im bestehenden `mission-events`-Kanal. Der Gegnerbestand kommt in den vorhandenen binären 10-Hz-Vollframes mit unveränderten Entity-IDs und Telegraphs. Reconnect übernimmt den aktuellen Stand des laufenden Raums und dieselben IDs. Neue Spieler können bis Boarding einsteigen. Laufende Einsätze nehmen nur bestehende Reconnect-Slots an.

Die Pressure-Berechnung, internen Teilbudgets und Kandidaten bleiben auf dem Server. Der lokale Entwicklungsraum sendet Diagnosewerte über den vorhandenen Metrics-Kanal mit 2 Hz. [Architektur, Logs und Tests](HORDE_DIRECTOR.md)
