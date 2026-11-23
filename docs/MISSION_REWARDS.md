# Missionsresultat und Belohnungen

`primaryObjectivesCompleted` wird im Serverzustand dauerhaft gesetzt, sobald Alpha und Bravo abgeschlossen sind. Die Nestaufgabe bleibt optional. `MissionResult` hält Missions- und Ergebnis-ID, Schwierigkeit, Resultat der Hauptziele, Extraktionsversuch, gewählte Methode, extrahierte IDs, Convict-Verluste und Zustand des Albatross fest.

| Fall | Basis je Teilnehmer | Bonus |
| --- | --- | --- |
| Teamwipe vor den Hauptzielen | 0 EP | 0 EP |
| Hauptziele erfüllt, Teamwipe | 400 EP | 0 EP |
| Hauptziele erfüllt und Extraktion | 400 EP | 100 EP pro extrahiertem Operator |

Die Werte stehen in `MISSION_REWARDS`. Sektor-Kredits, Einsatzmarken und extrahierte Proben beschreibt [Ressourcen](RESOURCES.md). Zur Abrechnung zählt die beim Start verriegelte Teilnehmerliste. Nach dem Einfangen oder Abheben werden extrahierte Operator bis zur Fertigstellung des Ergebnisses gesichert. Die Ergebnis-ID wird aus der Einsatz-UUID gebildet. Eine einzelne serverseitige Finalisierung erzeugt das Resultat samt individuellen Beträgen und genau ein `MissionCompleted`. Reconnects lesen das vorhandene Ergebnis aus dem Snapshot.

Das Ergebnis und die EP bleiben innerhalb des laufenden Einsatzzyklus im Speicher. Mit Accounts schreibt der Server die EP jedes Teilnehmers einmalig über die Ergebnis-ID gut und führt die Missionshistorie ([Accounts](ACCOUNTS.md)). `MissionResult` trägt dafür zusätzlich Auftragsname, Planet und die Abschüsse je Operator. Konkrete Progressionsbelohnungen und persistente Auszahlungen benötigen später eine idempotente Abrechnung anhand der Ergebnis-ID und der Account-Identität.
