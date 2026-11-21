# Auftragsvorlagen und Zielmechaniken

| Vorlage | Hauptziele | Optionale Ziele |
| --- | --- | --- |
| Nestjagd · `nest-purge` | Das vorhandene Startnest im Westkrater zerstören. | – |
| Relaisverteidigung · `relay-defense` | Alpha oder Bravo aktivieren und die Zone mit mindestens einem lebenden, verbundenen Operator für die Verbindungszeit halten. | Startnest im Westkrater. |
| Relaisverbund · `relay-chain` | Bei einem Relais die Verbindung halten, anschließend das zweite Relais aktivieren. Beide Reihenfolgen sind möglich. | Startnest im Westkrater. |

`activate-relay` und `defend-relay` nutzen die vorhandene Relaisinteraktion. `purge-nest` nutzt eine vom EncounterDirector gebundene Startnest-Instanz. Angreifbare Nester aus späteren Durchbrüchen bleiben taktische Ziele. Die feste Variante verwendet weiter ihre ursprüngliche Nestquote.

Die Verteidigung nutzt die Registry-Einstellung `swarm.missionGeneration.relayDefenseSeconds` (8 s). Der Modifier `early-extraction-pressure` ist mit Nestjagd und Relaisverbund kompatibel. Er multipliziert den bereits anhand der Schwierigkeit aufgelösten Zeitabstand vor der ersten Extraktionsverstärkung mit 0,65. Er setzt das vorhandene Verstärkungssystem und eine verfügbare Einheit des Verstärkungsbudgets voraus. Der Validator weist doppelte und inkompatible Modifier zurück. Nachschub nutzt die vorhandenen Behälter an der Albatross.
