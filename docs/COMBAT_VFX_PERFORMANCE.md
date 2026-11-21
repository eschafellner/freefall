# Combat VFX · Budgets und Messung für 7.8A

| Profil | Blitze | Hülsen | Tracer-Slots | Lauflicht | Mündungsfeuer bis | Remote-Hülsen bis |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Low | 6 | 4 | 20 | 0 | 26 m | – |
| Medium | 10 | 16 | 36 | 0 | 42 m | 13 m |
| High | 16 | 32 | 56 | 1 | 58 m | 22 m |

`WeaponFireEffects` nutzt je einen Instancing-Batch für Mündungsfeuer und Hülsen. Der vorhandene Linienbatch verwaltet Tracer. Ein weiterer Post-Processing-Pass entfällt. In High hält ein einzelnes schattenloses Punktlicht mit Nullintensität im Leerlauf die Lichtanzahl während eines Schusses konstant. Jeder Pool aktualisiert nur den belegten Bereich der GPU-Puffer. Der Grafikwechsel räumt aktive Waffen-VFX. `ArenaView.dispose` gibt zusätzliche Instanzen, Geometrien, Materialien, Licht und den prozeduralen Flash-Maskenpuffer frei.

F2 zeigt aktuelle Blitze, Tracer, Hülsen, Lauflicht und verworfene Schuss-Echos. CPU, GPU, Rendercalls und Serverzeit kommen aus der vorhandenen Telemetrie. Die Messung der RAF-Abstände im Browser-Playtest nutzt die unveränderten Browserzeitstempel. Der CPU-Wert des Skripts umfasst die gemessene synchrone Callback-Zeit pro Frame. Die Server- und GPU-Werte der HUD-Stichprobe haben eigene Zeitfenster.

## Browser-Stichprobe

Chromium 153.0.8010.12 mit ANGLE/SwiftShader, 960 × 540, Medium. Ein gerenderter Browser und drei SDK-Operatoren im selben Raum. 1.000 aktive Schaben vor und nach dem Feuerfenster. 93 replizierte Schüsse, 21 aufgezeichnete Frames, keine Browserfehler.

| Messgröße | Ergebnis |
| --- | ---: |
| Framezeit Median / P95 / P99 | 116,6 / 216,7 / 249,9 ms |
| CPU pro RAF Median / P95 / P99 | 2,7 / 5,4 / 6,0 ms |
| GPU-Timer der letzten HUD-Stichprobe | 200,1 ms |
| Rendercalls / Dreiecke in der letzten HUD-Stichprobe | 66 / 190.876 |
| Server-Tick Ø / P95 in der letzten HUD-Stichprobe | 0,59 / 1,20 ms |
| Sichtbar / aktiv in der letzten HUD-Stichprobe | 386 / 1.000 |
| Sichtbare Waffen-VFX in der letzten HUD-Stichprobe | 4 Tracer, 14 Hülsen |

Die gemessene Bildrate im lastintensiven Softwarelauf war zu niedrig für eine visuelle Abnahme. Die Stichprobe belegt gleichzeitig laufende Simulation, Schussreplikation und VFX-Cleanup. Aus ihr lässt sich der Mehrbedarf gegenüber dem vorherigen Stand nicht ableiten. Ein Vergleich unter identischer Schusslast auf Zielhardware, die vollständige Lastmatrix, ein stabiler Bandbreitenvergleich, Heap-/VRAM-Messungen und ein kombinierter Wald-Soak stehen aus.

- [Rohdaten der Browser-Stichprobe](playtest/7-8a/browser.json)
