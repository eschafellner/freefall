# Trefferpräsentation · 7.8B-Performance

## Waldlast mit Bodennebel

Chromium 153.0.8010.12, ANGLE/SwiftShader, 860 × 500, Medium, Wald-Seed 76, Missions-Seed 0, `relay-defense`, `dawn`, `ground-mist`. Pro Stufe lief ein rund 5,5 s langes RAF-Messfenster mit einem gerenderten Browser und drei SDK-Clients. Die Spalte „Schützen“ zählt nur die feuernden Operatoren. Der Harness setzte die Startpopulation und ließ die reguläre Gegnersimulation und Trefferverarbeitung laufen.

| Gegner Start → Ende | Schützen | Schüsse | Welt-/Schabentreffer | FPS Ø | Frame P95 / P99 | Server P95 / P99 | Impact-CPU Spitze der HUD-Stichproben |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 → 0 | 1 | 45 | 45 / 0 | 21,4 | 83,3 / 83,4 ms | 0,38 / 0,40 ms | 0,10 ms |
| 100 → 100 | 1 | 45 | 45 / 0 | 20,1 | 83,3 / 100,0 ms | 0,48 / 0,49 ms | 0,10 ms |
| 250 → 250 | 4 | 180 | 141 / 1 | 17,5 | 100,0 / 116,6 ms | 0,66 / 0,74 ms | 0,10 ms |
| 500 → 499 | 4 | 180 | 140 / 2 | 15,9 | 116,6 / 133,3 ms | 0,79 / 2,14 ms | 0,20 ms |
| 1.000 → 998 | 4 | 180 | 142 / 3 | 14,1 | 133,3 / 150,0 ms | 1,11 / 3,19 ms | 1,30 ms |

Keine Stufe verwarf Server-Steps. Das verfügbare Serverbudget beträgt 33,33 ms pro Tick. Die 1.000er-Stufe erreichte in den HUD-Stichproben 15 gleichzeitige Impacts und 120 Partikel bei Medium-Kapazitäten von 36 beziehungsweise 288. Der Client spielte in diesem Fenster 44 Impact-Sounds ab. Die erfasste Stimmen-Spitze des Gesamtmixes lag bei 15 von 28.

Die letzte HUD-Stichprobe der größten Stufe zeigte 142 Draw Calls, 300.913 Dreiecke, 195 Geometrien und 53 Texturen. Die Szenen-GPU-Zeit lag bei 67,9 ms und die geschätzte Netzlast bei 172,79 kB/s. Diese Bandbreite umfasst den gesamten Spielverkehr und schwankt zwischen kurzen Messfenstern. Die zusätzlichen Shot-Felder enthalten Material, Normale oder Ziel-Leben. Einzelne Partikel erzeugen keinen Netzwerkverkehr.

Der Chrome-Heap lag in der 1.000er-Stufe bei 24,1 MB vor und 31,6 MB nach der Stichprobe. In der 500er-Stufe fiel er von 42,2 auf 19,6 MB. Geometrien und Texturen blieben in der Waldmatrix konstant. Die Fenster sind zu kurz für eine Leakaussage. Native GPU-Zeit, VRAM in Byte und Langzeitspeicher bleiben offen.

## Native GPU

AMD Radeon RX 9070 XT mit ANGLE/OpenGL ES 3.2 und AMD Ryzen 7 9700X, 1.280 × 720, Medium. Der native Lauf verwendete dieselbe Waldszene, dieselben Seeds und 12 s pro Laststufe. Pro Stufe wurden 721 Frames gemessen.

| Gegner Start → Ende | FPS Ø | Frame P95 / P99 | Server P95 / P99 | Welt-/Schabentreffer | Impact-Audio |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 → 0 | 60,0 | 16,8 / 16,8 ms | 0,27 / 0,35 ms | 90 / 0 | 90 |
| 100 → 100 | 60,0 | 16,8 / 16,8 ms | 0,32 / 0,50 ms | 90 / 0 | 90 |
| 250 → 249 | 60,0 | 16,7 / 16,8 ms | 0,49 / 0,55 ms | 280 / 3 | 114 |
| 500 → 497 | 60,0 | 16,8 / 16,8 ms | 0,65 / 0,70 ms | 282 / 5 | 117 |
| 1.000 → 997 | 60,0 | 16,7 / 16,8 ms | 0,90 / 0,93 ms | 238 / 6 | 112 |

Die 1.000er-Stufe erfasste bis zu 11 gleichzeitige Impacts, 88 Partikel und 0,10 ms Impact-CPU-Zeit in den HUD-Stichproben. Alle fünf Stufen hielten den 30-Hz-Server-Takt ohne verworfene Steps. Der 60-Hz-Lauf belegt die Bildrate dieser Zielkonfiguration. Die Wirkung auf andere GPUs, isolierte VRAM-Bytes und ein nativer A/B-Lauf gegen 7.8A sind davon separat zu messen.

## 65 Sekunden auf High

Der längere native Waldlauf mit Bodennebel startete bei 1.000 aktiven Schaben und endete nach drei Abschüssen bei 997. Vier Operatoren gaben 1.740 Schüsse ab. Darunter waren 1.380 Weltkontakte und 6 bestätigte Schabentreffer. Die Browseransicht spielte 513 Impact-Stimmen ab. Der Lauf enthielt 3.901 Frames bei 60,0 FPS, Frame P95/P99 von 16,7/16,8 ms und Server P95/P99 von 0,94/1,01 ms. Kein Server-Step wurde verworfen.

Die HUD-Stichproben erreichten 12 Impacts, 132 Partikel und 0,20 ms Impact-CPU. Der Mix erreichte 20 von 28 Stimmen. Die letzte GPU-Stichprobe der gesamten Szene betrug 0,3 ms bei 145 Draw Calls. Der Browser-Heap in Benutzung schwankte zwischen 20,7 und 44,4 MB. Nach 60 s betrug er 23,1 MB. Der reservierte Heap stieg über die Stichproben von 60,7 auf 83,7 MB. Die Stichprobe zeigt regelmäßige Speicherbereinigung und erlaubt keine Aussage über stundenlangen Betrieb.

- [High-Dauerfeuer-Rohdaten](playtest/7-8b/soak-high.json) · [High-Aufnahme](playtest/7-8b/forest-1000-high.jpg)

## Arena-Vergleich zu 7.8A

Der vor der Implementierung wiederholte 7.8A-Waffenlauf nutzte denselben Renderer, 960 × 540, Medium und vier verbundene Operatoren bei einer Spitzenpopulation von 1.000. Die Baseline erfasste 92 replizierte Schüsse und 19 Frames sowie 116,7 / 250,1 / 250,1 ms Framezeit Median / P95 / P99. Im 7.8B-Waffenlauf erfasste derselbe Harness 73 Schüsse und 18 Frames sowie 133,3 / 150,0 / 150,0 ms Framezeit Median / P95 / P99 bei 1.000 aktiven Schaben. Die kurze, ungesäte Arena und variierenden Schusszahlen erlauben keinen belastbaren A/B-Wert für die Mehrkosten des neuen Batches.

Gate J besteht in der gemessenen nativen Konfiguration. Das bestehende 30-Hz-Serverbudget wurde in beiden Renderpfaden eingehalten. Die funktionale Hordenprobe belegt Replikation, VFX, Audio und ablaufende Pools unter der gemessenen Last.

- [Native Wald-Rohdaten](playtest/7-8b/native/results.json) · [SwiftShader-Rohdaten für Wald und Planeten](playtest/7-8b/results.json) · [Arena vor 7.8B](playtest/7-8b/arena-baseline.json) · [Arena nach 7.8B](playtest/7-8b/arena.json)
