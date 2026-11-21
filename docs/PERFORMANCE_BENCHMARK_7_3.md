# Performance-Benchmark 7.3E

Stand 19. November 2026, Arbeitsstand auf `4daf04e`, Balance `4c6c58ca54715f11`. Hardware und Runtime waren AMD Ryzen 7 9700X mit 16 logischen CPUs, Fedora Linux 45 x64 (`7.3.3-300.fc45.x86_64`) und Node 24.18.0. Die Browserszenen liefen mit Chromium 153.0.8010.12, Produktionsbuild, Grafikprofil Medium, DPR 1 und WebGL 2 über ANGLE/SwiftShader. Der Frame-Benchmark verwendet 1.280 × 720, der Mission-Playtest 1.280 × 800. Der Spielserver lief dabei auf Loopback im selben Node-Prozess wie der Treiber. Physik verwendet analytische Operatorvolumen und ECS-Agenten ohne separate Rigid Bodies. Gezählt werden tatsächliche Operatoren und aktive ECS-Gegner.

## Server-Matrix · Boreal Relay

Seed 421337, 360 Aufwärmticks und 1.800 Messticks je Zeile, entsprechend 60 Sekunden virtueller Spielzeit bei 30 Hz. `ground` hält die vorgesehenen Operatoren über die Messung in Bodenhaltung am Leben. Jeder nutzt die simulierte Bewegung, Feuer, taktisches Nachladen und Stims. Die Anfangsdivephase liegt vor dem Messfenster. Die Wiederauffüllverzögerung nach Abschüssen erklärt die Schwankung der Gegnerzahl.

| Operatoren lebend | Gegner Min.–Spitze | Tick Ø / P95 / P99 / Max. in ms | Horde-Encode P95 in ms | Nutzdaten je Empfänger in KiB/s |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0–0 | 0,002 / 0,005 / 0,010 / 0,144 | 0,001 | 13,4 |
| 1 | 97–100 | 0,017 / 0,024 / 0,040 / 0,190 | 0,003 | 23,2 |
| 4 | 241–250 | 0,046 / 0,080 / 0,129 / 0,207 | 0,008 | 75,9 |
| 4 | 492–500 | 0,106 / 0,147 / 0,205 / 0,895 | 0,011 | 100,3 |
| 4 | 993–1.000 | 0,225 / 0,285 / 0,338 / 0,403 | 0,021 | 149,1 |

Im 1.000er-Lauf kriechen alle vier in 1.800 Messticks gleichzeitig. Der Server erfasst 200 Ticks mit vier gleichzeitigen Schüssen, 630 mit vier laufenden Reloads und 360 mit vier laufenden Stim-Anwendungen. Ein Horde-Paket erreicht 10.006 B, der größte Spielerzustand 2.985 JSON-Bytes. Die KiB/s enthalten Binärhorde und JSON-Spielerzustände. Die Messung enthält keinen Colyseus-, WebSocket-, TCP- oder Event-Overhead.

Im `tactical`-Lauf ist Schaden aktiv. Bei Zielgröße 1.000 erreichte der Lauf 675–1.000 Gegner und zeitweise null lebende Operatoren. Er bestätigte vier Dive-Starts und 606 Schüsse im Messfenster sowie 14 Explosionen einschließlich Aufwärmen. Tick Ø/P95/P99 lagen bei 0,176/0,214/0,253 ms. Die Eingangsmessung desselben taktischen 4/1.000-Profils lag bei Ø/P95 0,173/0,215 ms. Die Arena-Trajektorie unterscheidet sich durch die Respawn-Korrektur. Daraus lässt sich kein Performancegewinn ableiten.

## Operation Bodenbruch · FREEFALL

Der Server-Sättigungslauf erreichte 1.000 aktive Agenten, 53 Gruppen und 10 Nester bei Tick Ø/P95/Max. 0,311/0,358/1,069 ms. Der separate Ballonlauf mit vier Testoperatoren, beschleunigter Platzierung, Schutz und Nachfüllen durch den Testtreiber erreichte 1.000 Gegner in 2.822 von 2.850 gemessenen Ticks. Tick Ø/P95/Max. waren dort 0,334/0,411/0,963 ms. Vier Operatoren wurden extrahiert, der Durchlauf kehrte zum Carrier zurück.

## Browser · Software-WebGL

Ein gerenderter Browser, zusätzliche SDK-Verbindungen und dieselbe Tastatur-/Maussequenz je Szenario, rund 16 Sekunden pro Messpunkt. Der Beobachter belegt einen Slot. Die vier Operatoren im letzten Profil bewegen sich, ein SDK-Client feuert. Die Werte stammen aus `requestAnimationFrame`, synchroner Callback-Zeit und dem Server-Timer.

| Szene | FPS Ø | Frame Ø / P95 / P99 in ms | JS-Callback Ø / P95 in ms | Server-Tick P95 in ms |
| --- | ---: | ---: | ---: | ---: |
| Skyfall Carrier | 19,88 | 50,31 / 66,80 / 100,00 | 1,94 / 2,90 | 0,074 |
| Dev' Ault ohne Gegner | 14,03 | 71,30 / 100,00 / 133,40 | 3,72 / 3,40 | 0,107 |
| Arena 100, 2 Verbindungen | 12,48 | 80,15 / 116,70 / 150,00 | 1,65 / 3,60 | 0,086 |
| Arena 500, 2 Verbindungen | 11,94 | 83,77 / 133,30 / 166,60 | 1,50 / 3,60 | 0,221 |
| Arena 1.000, 2 Verbindungen | 9,11 | 109,72 / 216,60 / 233,30 | 1,57 / 3,50 | 0,409 |
| Arena 1.000, 4 aktive Verbindungen | 7,75 | 129,03 / 250,00 / 266,70 | 1,55 / 2,80 | 0,481 |

Die letzte HUD-Probe mit vier Operatoren zeigte 1 ms Ping, ungefähr 144,44 kB/s Transfer, 255,2 ms WebGL-Timer und null verworfene Simulationsschritte. Die `players`-Pakete kamen im Mittel alle 50,0 ms an, P95 67,3 ms. Kein Browser- oder Konsolenfehler im Lauf. Der separate Bodenbruch-Playtest mit einem Browser und drei SDK-Slots erreichte im Ballonabschnitt einen FPS-Median von 13. Der Treiber meldete 1.000 aktive Gegner nach dem Auffüllen. Die letzte HUD-Probe zeigte 1.000 aktive Gegner und 1,49 ms Server-Tick P95.

Der unter Last wesentlich längere Frame gegenüber dem synchronen JS-Callback weist zusammen mit der WebGL-Zeit auf den Software-Renderpfad als Hauptgrenze dieses Arbeitsplatzes. 7.1 nutzte Hardware-WebGL. 7.3D dokumentierte bereits einen SwiftShader-Lauf mit 7,3 FPS und 250 ms Frame P95. Der 7.3D-Serverwert im Ground-Szenario lag bei 0,292 ms P95 in 600 Messticks. Die unterschiedlichen Fenster und Renderbedingungen begrenzen Vorher-/Nachher-Aussagen. [Historischer 7.1-Vergleich](PERFORMANCE_BASELINE_7_1.md) · [Historische 7.3-Läufe](TACTICAL_MOVEMENT_PLAYTEST.md)

## CPU, Speicher und Garbage Collection

Im separat instrumentierten Prozess mit 9.000 Messticks je Arena-Profil lagen 2.783 von 4.041 CPU-Profiler-Samples in `steeringSystem`. Weitere Stichproben lagen in Tick-Orchestrierung, Paket-Encoding, Nahkampf, Feuer und Gegnerintegration. Am Ende der 1.000er-Zeile verzeichnete der Prozess 125,9 MiB RSS und −2,1 MiB Heap-Differenz gegenüber dem Beginn des Messfensters. Über den gesamten Prozess einschließlich Start und Aufwärmen protokollierte V8 444 GC-Pausen mit insgesamt 35,1 ms und maximal 0,6 ms. Die Heap-Differenz ist eine Momentaufnahme. Beliebig lange Sitzungen und ein Heap-Diff nach wiederholten Disconnects wurden damit nicht abgenommen.

Drei A/B-Läufe mit je 9.000 Messticks prüften vorberechnete Schleifengrenzen und eine Abkürzung bei leerer Separation im Steering. Der Median der drei 4/1.000-Tick-P95-Werte lag bei 0,276 ms im Referenzcode und 0,278 ms mit der Änderung. P99 lag im Median bei 0,316 bzw. 0,332 ms. In beiden Varianten erreichte jeder Lauf 4.000 Schüsse und 1.368 Abschüsse. Der Versuch wurde nach der Messung zurückgenommen.

Die folgende isolierte Node-Messung verwendet dieselben prozeduralen Modelle, dieselbe taktische Kamera und dieselbe Haltungslogik mit Bodenbruch-Solids. Der Treiber durchläuft Stehen, Hocke, Dive, beide Bodenhaltungen und Aufstehen. Nach 600 Aufwärmframes misst er 2.400 Frames bei virtuellen 120 Hz und 600 Physikschritte bei 30 Hz. Die Kosten enthalten die CPU-Funktionen mit Positions- und Posing-Updates. Die Messung schließt Browser, GPU, hordeabhängige Physik und Netzwerk aus. Ein Browser-JS-Heap-Profil steht aus.

| Komponente | Proben | Ø / P95 / P99 in ms |
| --- | ---: | ---: |
| Physik, vier Operatoren pro Tick | 600 | 0,0037 / 0,0087 / 0,0141 |
| Prozedurales Posing, vier Operatoren pro Frame | 2.400 | 0,0089 / 0,0123 / 0,0184 |
| Taktische Kamera, eine Ansicht pro Frame | 2.400 | 0,0022 / 0,0043 / 0,0060 |

## Vorschläge für die Budgetfreigabe

| Metrik | Vorschlag für 4 Operatoren und 1.000 Gegner |
| --- | --- |
| Client bei 1.280 × 720, Medium, Ziel-GPU | Median ≤ 16,7 ms, P95 ≤ 20 ms, P99 ≤ 33,3 ms pro Frame |
| Server 30 Hz | Simulation P95 ≤ 8 ms, P99 ≤ 16 ms, keine verworfenen Schritte über 10 min |
| Empfangene Netzlast | ≤ 180 KiB/s je Client im 60-s-Mittel bei aktiven Operatoren, am Transport messen |
| Speicherkosten | Node RSS ≤ 256 MiB bei stabiler Last. Browser-JS-Heap ≤ 256 MiB und ≤ 10 % Post-GC-Wachstum nach 10 Reconnects |
| Reconciliation | Im lokalen Stresstest ≤ 2 Korrekturen/s je Client über 5 mm, P95 ≤ 5 cm bei Jitter ohne Platzierung und Tod |
| Animationsupdate | P95 ≤ 1 ms für die vier gerenderten Operatoren auf Zielhardware, den GPU-Renderpass getrennt messen |

## Reproduktion

```bash
npm run benchmark -- 1800 421337 matrix ground
npm run benchmark -- 1800 421337 matrix tactical
npm run benchmark -- mission 1800 421337 4
node --cpu-prof --cpu-prof-dir=/tmp --trace-gc-nvp --conditions=development apps/server/src/benchmark.ts 9000 421337 matrix ground
node --conditions=development scripts/tactical-component-bench.ts
npm run build
ANGLE=swiftshader PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs node --conditions=development scripts/perf-browser.mjs /tmp/freefall-browser-perf.json
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs node --conditions=development scripts/playtest-ms6.mjs tactical stress
```
