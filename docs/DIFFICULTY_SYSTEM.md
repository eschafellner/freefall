# Schwierigkeit

Die sieben Stufen stehen in `packages/shared/src/balance/data/difficulty.json` und werden über die [Balance-Registry](BALANCE_ARCHITECTURE.md) validiert und bei Missionsstart einmal aufgelöst. `DIFFICULTIES` ist der Alias darauf. Der Server akzeptiert nur registrierte IDs vom aktuellen Host an der Carrier-Konsole. Beim Übergang ins Boarding wird die Auswahl fixiert. Die Standardstufe ist Normal. Die Arena behält ihre frei einstellbare Hordengröße.

| Stufe | Name | Gegnerlimit | Startgruppen | Schaben je Startgruppe | Max. Nester | Max. entstehende Nester | Verstärkungseffekte | Spawns je Tick |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Leicht | 120 | 5 | 3–5 | 2 | 1 | 5 | 8 |
| 2 | Normal | 200 | 8 | 4–7 | 3 | 1 | 8 | 10 |
| 3 | Herausfordernd | 320 | 12 | 6–9 | 4 | 2 | 12 | 12 |
| 4 | Schwer | 450 | 15 | 8–13 | 5 | 2 | 16 | 14 |
| 5 | Extrem | 600 | 20 | 10–16 | 6 | 3 | 20 | 16 |
| 6 | Albtraum | 800 | 24 | 13–20 | 8 | 3 | 24 | 18 |
| 7 | FREEFALL | 1.000 | 30 | 16–24 | 10 | 4 | 32 | 24 |

Die Schwierigkeit erhöht Sichtweite, Häufigkeit von Rufen, Nestproduktion, Nest-HP und Druck während der Extraktion. Leicht beginnt bei 0,82-facher Basis-Sichtweite, FREEFALL bei 1,38-facher. Das Basis-Produktionsintervall von 5,6 Sekunden erhält einen Stufenfaktor von 1,55 bis 0,32 sowie dynamische Threat- und Rufboni. Ein Ruf bleibt über alle Stufen drei Sekunden lang unterbrechbar. Die Schabe verwendet dieselben Basis-Kampfwerte pro Stufe.

Die Werte sind experimentell. Schwierigkeit 7 erlaubt 1.000 aktive Gegner und beginnt im normalen Einsatz mit gestaffelten Patrouillen. Das Erreichen des Caps hängt von Spielzeit, Nestanzahl, Alarmverlauf und Abschüssen ab. [Encounter Director](ENCOUNTER_DIRECTOR.md)

Die Ausrüstung der vier Convicts nimmt mit derselben Stufenskala ab. [Convict-System](CONVICT_SYSTEM.md)

## Kriegerkasten

Ab Normal mischt der Encounter Director die Kriegerkasten des Schwarms dazu. Die Anteile stehen je Stufe in `difficulty.json`, die Archetypen in `swarm.json › castes`.

| Stufe | Jäger in Patrouillen | Reine Jäger-Patrouille | Durchbruchskäfer je Verstärkungsruf | Durchbruchskäfer-Wachen je Nest |
| ---: | ---: | ---: | ---: | ---: |
| 1 Leicht | 0 % | 0 % | 0 | 0 |
| 2 Normal | 10 % | 0 % | 0,35 | 0,5 |
| 3 Herausfordernd | 20 % | 10 % | 0,5 | 0,75 |
| 4 Schwer | 30 % | 16 % | 0,75 | 1 |
| 5 Extrem | 40 % | 22 % | 1 | 1,5 |
| 6 Albtraum | 50 % | 28 % | 1,25 | 2 |
| 7 FREEFALL | 60 % | 35 % | 1,5 | 2,5 |

Bei den Durchbruchskäfern gilt der ganzzahlige Teil immer und der Rest als Chance. 0,35 bedeutet also: Bei 35 % der Rufe kommt ein Käfer mit. Die Käfer eines Rufs schlüpfen aus dem neuen Durchbruchsnest oder aus dem verstärkten Nest. Nestwachen entstehen aus den ersten Spawns eines Nests und werden nicht nachproduziert. Wellen des Horden-Direktors und die Arena bleiben vorerst reine Schaben. Die Würfe nutzen einen eigenen Zufallsstrom. Deshalb verschieben sie die übrigen Spawnsequenzen nicht: Mit allen Anteilen auf 0 reproduziert jede Stufe ihre bisherigen Golden Traces exakt. [Jäger](enemies/JAEGER.md) · [Durchbruchskäfer](enemies/DURCHBRUCHSKAEFER.md)
