# Kamera, HUD und Missionslast 7.8D

Gemessen mit Chromium 153 und ANGLE/SwiftShader bei 800 × 450 px. Der Waldlauf verwendet Plan-Seed 0, World-Seed 76, Morgendämmerung und Bodennebel. Eine Browser-Instanz rendert Bild und Audio. Die drei weiteren Operatoren sind echte Colyseus-Verbindungen über den SDK-Testclient. Pro Laststufe werden 4,5 Sekunden gemessen. Die Startwerte zählen serverseitig simulierte Gegner. Bestätigte Kills verringern die Zahl während des Fensters.

| Wald-Szenario | Grafik | Operatoren | Gegner Start → Ende | FPS | Frame P95 / P99 | Server P95 | Verworfene Steps |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Solo | LOW | 1 | 0 → 0 | 46,1 | 33,4 / 50,0 ms | 0,493 ms | 0 |
| Kleines Gefecht | LOW | 1 | 100 → 96 | 43,9 | 33,4 / 50,0 ms | 0,538 ms | 0 |
| Koop | MEDIUM | 4 | 250 → 236 | 22,4 | 66,6 / 83,3 ms | 1,419 ms | 0 |
| Große Horde | MEDIUM | 4 | 500 → 481 | 20,8 | 66,6 / 83,4 ms | 1,019 ms | 0 |
| Maximallast | MEDIUM | 4 | 1.000 → 983 | 19,7 | 66,7 / 100,0 ms | 1,461 ms | 0 |
| Maximallast mit Nestzerstörung | MEDIUM | 4 | 1.000 → 990 | 20,3 | 83,3 / 150,0 ms | 2,944 ms | 0 |

Der kombinierte Lauf erfasste 146 Schüsse, drei bestätigte Explosionen, einen sichtbaren Schadenspfeil sowie die HUD-Meldungen „Schwarmnest zerstört“ und „Convict ausgefallen“. Die letzte Probe zeigte 336 sichtbare Gegner, 142 Draw Calls, 200.493 Dreiecke, 202 Geometrien, 52 Texturen, laufendes Web Audio und etwa 191,22 kB/s Anwendungstraffic. Das CPU/GPU-Zeitfenster lag bei 3,1/42,3 ms. Die gepoolten Explosions-VFX erreichten gemessene 0,10 ms CPU-Spitze und gleichzeitig bis zu 12 Rauch-, 12 Staub- und 24 Splitterinstanzen sowie ein Licht. [Kombinierte Rohmessung](playtest/7-8d/combined/report.json)

Die F2-Messung erfasst mittlere CPU-Zeiten in kurzen Telemetrieintervallen. Die Endprobe der 1.000er-Last lag für Kamera, Reticle und Schadens-HUD bei 0,040 / 0,080 / 0,020 ms. Der kombinierte Lauf lag bei 0,071 / 0,029 / 0,000 ms. Der letzte Wert kann unter der Auflösung des Browsertimers liegen. Die Zahlen messen den CSS-/DOM-Updatepfad des Reticles und der Schadensanzeige. Eine Messung der gesamten React-Paint-Zeit steht aus. Der gemessene JavaScript-Heap für den kombinierten Lauf betrug 27,50 MB vor und 23,01 MB nach der Probe. Die beiden Heap-Samples eignen sich als Kurzzeitdiagnose. GPU-Speicher, GC-Pausen und Langzeitstabilität sind noch offen. [Lastmatrix](playtest/7-8d/load/report.json) · [Solomessung](playtest/7-8d/solo/report.json)

Der 7.8C-Vergleichslauf verwendete denselben Wald-Seed, dieselbe Auflösung, Grafikstufe, Wetter und Messdauer. Er erreichte bei 250, 500 und 1.000 Gegnern 22,6 / 21,9 / 20,7 FPS. 7.8D erreichte 22,4 / 20,8 / 19,7 FPS. Die künstliche Explosionsverzögerung betrug damals 140 ms und im 7.8D-Lauf 160 ms. Beide Reihen sind kurze Software-Rendering-Proben. Die Differenz lässt sich keiner einzelnen Änderung zuordnen. [7.8C-Referenz](playtest/7-8c/report.json)
