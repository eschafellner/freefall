# Explosions-Performance · 7.8C

Der Browserharness misst dieselbe Waldwelt bei Weltseed 76, Missionsseed 0, Morgendämmerung, Ground Mist, Medium und 800 × 450. Viererproben nutzen einen Chromium-Client und drei weitere WebSocket-Operatoren. Die Solo-Proben laufen in einem Raum mit genau einem Browser-Operator. Das Messfenster pro Zeile beträgt ungefähr 4,5 s. Die 1.000 Gegner werden vom Server simuliert. Kills reduzieren den Bestand im Lauf. Der lokale Rechner benutzt Chromium 153 mit ANGLE und SwiftShader.

| Schaben zu Beginn | Operatoren | FPS Ø vor → nach | Frame P95 / P99 nach | Server P95 / P99 nach | Bestätigte Explosionen nach |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1 | 24,1 → 21,1 | 66,7 / 133,3 ms | 0,53 / 1,52 ms | 1 |
| 100 | 1 | 23,2 → 20,4 | 83,4 / 116,7 ms | 0,39 / 0,45 ms | 1 |
| 250 | 4 | 18,6 → 22,6 | 66,7 / 100,0 ms | 2,50 / 3,32 ms | 3 |
| 500 | 4 | 17,8 → 21,9 | 83,4 / 100,1 ms | 1,08 / 2,70 ms | 3 |
| 1.000 | 4 | 17,0 → 20,7 | 83,4 / 100,0 ms | 1,29 / 1,83 ms | 3 |

Die getrennten kurzen Läufe liefern einen Richtwert. Unterschiede bei Aufwärmzeit und Rendering-Last des Software-Treibers begrenzen den Vergleich. Die Solo-Bildrate ging in dieser Stichprobe zurück. Daraus ergibt sich keine Zielhardware-Freigabe. Der Server verwarf in keiner Zeile einen Step. Die 1.000er-Probe endete mit 985 aktiven Schaben nach 129 Schüssen, drei Detonationen und einem Kolbenstoß. Die Telemetrie erfasste Gegner-Windups und aktive Angriffsphasen bei gleichzeitigem Waffenfeuer, Wetter und Audio. Der Lasttest schützt die Operatoren über die lokale Testaufstellung, damit ein früher Truppausfall die Stichprobe nicht beendet.

In der 1.000er-Nachprobe beobachtete der Browser maximal 3 aktive Explosionen, 12 Rauch- und 12 Staubinstanzen, 24 Splitter und ein Explosionslicht. Der höchste abgelesene VFX-Updatewert betrug 0,10 ms. Die letzte HUD-Stichprobe zeigte 143 Draw Calls, 45,1 ms GPU-Zeit auf SwiftShader und geschätzte 175,86 kB/s. Die Mixer-Spitze betrug 22 von 28 Stimmen mit 161 kumulierten Verwerfungen über den bisherigen Raumlauf. Der Browser-Heap stieg in diesem Kurzfenster von 23,7 auf 26,7 MB. Diese Stichproben ersetzen weder ein GC-/VRAM-Profil noch einen lang laufenden Leak-Test. Der frühere Build hatte keine vergleichbaren Zähler für Explosionspartikel.

Die zusätzliche LOW-Probe erreichte mit 1.000 aktiven Schaben zu Beginn 39,6 FPS, Frame P95/P99 von 33,4/50,1 ms und Server P95/P99 von 2,93/4,11 ms. Drei gleichzeitige Explosionen belegten maximal sechs Rauch-, sechs Staub- und zwölf Splitterinstanzen bei null Explosionslichtern. Auch in diesem Lauf wurden null Server-Steps verworfen. [LOW-Rohdaten](playtest/7-8c/low/report.json)

Die Optimierungen verwenden drei feste Instanzbatches, kleine Alphamasken, Teil-Uploads und eine distanzabhängige Dichte. Rauch und Staub laufen kurz aus. Ein einzelnes, schattenloses Licht deckt Nahereignisse ab. Audio beschränkt die Explosion auf drei Syntheselayer plus einen separaten Materialkontakt. Der 7.8B-Zielhardwarevergleich lief auf einer Radeon RX 9070 XT. Für 7.8C war diese Messung in der Umgebung nicht verfügbar.

[Koop nachher](playtest/7-8c/report.json) · [Koop vorher](playtest/7-8c/before/report.json) · [Solo nachher](playtest/7-8c/solo/report.json) · [Solo vorher](playtest/7-8c/before-solo/report.json) · [Native Referenz für 7.8B](COMBAT_IMPACT_PERFORMANCE.md)
