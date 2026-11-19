# Performance-Baseline und Nachmessung · Milestone 7.1

Gemessen am 19. November 2026. „Vorher“ ist Commit `96832be`, „Nachher“ der Stand dieses Meilensteins. Beide Stände liefen mit **denselben Messskripten** auf derselben Maschine. Der Vorher-Stand lief dazu aus einem separaten Git-Worktree. Alle Zahlen sind gemessen, keine ist geschätzt. Analyse und Änderungen: [MOVEMENT_SMOOTHNESS.md](MOVEMENT_SMOOTHNESS.md).

## Umgebung

| | |
| --- | --- |
| CPU | AMD Ryzen 7 9700X, 16 logische CPUs, Governor `performance` |
| GPU | AMD Radeon RX 9070 XT (radeonsi gfx1201 ACO) |
| OS | Linux 7.3.3-300.fc45.x86_64 |
| Node.js | 24.18.0 |
| Browser | Chromium 153.0.8010.12, Headless (neuer Modus), WebGL 2 über ANGLE OpenGL ES 3.2, Hardware-GPU |
| Client | Produktionsbuild (`vite preview`), Profil Medium, 1.280 × 720 CSS-Pixel, DPR 1 |
| Server | In-Process auf Loopback, `FREEFALL_MISSION_DEBUG=1` (nur für den direkten Sprung auf die Oberfläche) |

## Drei Messverfahren

### 1. Bewegungsglätte (Headless, deterministisch)

```bash
node --conditions=development scripts/motion-bench.ts 60,144 lan,wan,jitter --json out.json
```

Das Skript lässt die echte Server-Simulation (`Arena`, `FixedLoop`, Snapshot-Erzeugung) und die echten Client-Klassen laufen: `Prediction`, `Timeline`, Remote-Interpolation, `ThirdPersonCamera`, `PlayerVisualController` und `CharacterAnimation`. Alle Uhren sind simuliert und geseedet:

- **Display:** 60 oder 144 Hz, vsync-ausgerichtet, ±0,3 ms Callback-Jitter, 0,4 % ausgelassene Frames.
- **Server-Timer:** 33,3 ms + 0–3 ms Verspätung, 1 % Ausreißer mit +20 ms.
- **Netz:** geordnet wie ein WebSocket. `lan` 1 + 0–1 ms, `wan` 35 + 0–15 ms mit 0,5 % Spikes (+60 ms), `jitter` 60 + 0–40 ms mit 2 % Spikes (+120 ms).
- **Vier Clients:** Beobachtet wird Client 0, Client 1 ist der beobachtete Remote-Operator und fährt dasselbe Skript.
- **Szenarien:** je 6,5 s, die erste Sekunde wird verworfen. Geradeaus, Sprint, Seitwärts, Rückwärts, Kreis, Richtungswechsel (A/D alle 400 ms), Anlaufen/Stoppen (W alle 500 ms), Laufen + Zielen, Laufen + Kamera drehen.

Kennzahlen:

- **v-CV:** Variationskoeffizient der sichtbaren Geschwindigkeit von Frame zu Frame. 0 % bedeutet konstante Strecke pro Frame.
- **Standbild-Frames:** Anteil der Frames ohne Positionsänderung trotz Bewegung.
- **Korrekturen:** Verschiebung der Vorhersage durch Server-Reconciliation über 5 mm.
- **Foot Sliding:** |Animationstempo − sichtbares Tempo| pro Frame.
- **Latenzen:** Median von Tastenflanke bis zur ersten sichtbaren Reaktion.

Zwei Läufe desselben Stands liefern bitgleiche Ausgaben (geprüft per Hash).

### 2. Frametimes im Browser

```bash
npm run build
PLAYWRIGHT_MODULE=…/playwright/index.mjs node --conditions=development scripts/perf-browser.mjs out.json
VSYNC=60 PLAYWRIGHT_MODULE=… node --conditions=development scripts/perf-browser.mjs out.json
```

Ein Init-Skript umhüllt `requestAnimationFrame`. Es zeichnet jeden Frame-Zeitstempel und die synchrone Dauer des Spiel-Callbacks auf (CPU). Der Spielcode bleibt dafür unverändert, der Vorher-Stand ließ sich deshalb identisch messen. Jedes Szenario fährt dieselbe 20-s-Folge mit echten Tastatur- und Mausereignissen: W, Shift+W, D, S, Kreis mit Maus, 5× A/D, Zielen + W, W mit Kamerapendel. GPU-Zeit, Draw Calls und Ping kommen aus dem F2-HUD (WebGL-Timer-Query). Server-Tickdauern stammen aus dem Room. Snapshot-Abstände misst ein zusätzlicher SDK-Client auf demselben Server.

**Grenze:** Headless-Chromium hat kein Vsync. Ohne `VSYNC` laufen die Frames ungedrosselt. Das misst die Kosten pro Frame (Budget-Reserve). Mit `VSYNC=60` gibt das Init-Skript Frames an emulierten 16,67-ms-Grenzen frei. Das misst die Taktung. Die emulierten „verpassten“ Frames (>20 ms) sind ein Artefakt der Emulation: Sie treten in beiden Ständen gleich auf, und die Spielarbeit pro Frame lag dabei unter 1 ms.

Der SDK-Beobachter belegt einen Operator-Slot. In den Szenarien „1 Operator“ steht er untätig im Raum. Im Vier-Operator-Szenario bewegt er sich wie zwei weitere Bots (30-Hz-Eingaben, Kreise, Sprint, Feuer).

### 3. Server-Tick (Headless)

```bash
npm run benchmark -- 1800 421337 4
npm run benchmark -- mission 1800 421337 4
```

## Ergebnisse: Bewegungsglätte

Mittel über die gleichförmigen Szenarien (Geradeaus, Sprint, Seitwärts, Rückwärts, Kreis, Zielen, Kamera drehen), jeweils vorher → nachher:

| Anzeige / Netz | Lokal v-CV | Lokal Standbild-Frames | Kamera v-CV¹ | Remote v-CV Ø / max | Korrekturen/s | Korrektur max (cm) | Anim-Tempo-CV | Foot Sliding lokal (m/s) | Locomotion-Wechsel² |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 Hz / LAN | 82,6 % → 0,0 % | 0,0 % → 0,0 % | 75,2 % → 0,1 % | 1,1 % / 2,0 % → 0,6 % / 0,9 % | 9,4 → 0,0 | 38,7 → 0,0 | 16,5 % → 0,0 % | 4,89 → 0,00 | 28 → 0 |
| 144 Hz / LAN | 187,1 % → 0,0 % | 45,1 % → 0,0 % | 171,2 % → 0,1 % | 1,8 % / 2,6 % → 0,3 % / 0,5 % | 2,4 → 0,0 | 38,7 → 0,0 | 13,8 % → 0,0 % | 9,20 → 0,00 | 18 → 0 |
| 60 Hz / WAN | 97,2 % → 0,0 % | 33,0 % → 0,0 % | 87,3 % → 0,1 % | 3,3 % / 4,8 % → 0,9 % / 2,3 % | 1,5 → 0,0 | 38,7 → 0,0 | 14,2 % → 0,0 % | 5,40 → 0,00 | 8 → 0 |
| 144 Hz / WAN | 192,4 % → 0,0 % | 66,6 % → 0,0 % | 174,5 % → 0,1 % | 5,1 % / 7,4 % → 1,7 % / 9,4 % | 0,6 → 0,0 | 61,3 → 0,0 | 13,5 % → 0,0 % | 9,33 → 0,00 | 4 → 0 |
| 60 Hz / Jitter | 84,6 % → 0,0 % | 2,9 % → 0,0 % | 77,0 % → 0,1 % | 12,9 % / 23,4 % → 3,6 % / 10,4 % | 8,6 → 0,0 | 122,7 → 0,0 | 21,6 % → 0,0 % | 4,95 → 0,00 | 90 → 0 |
| 144 Hz / Jitter | 168,0 % → 0,0 % | 6,6 % → 0,0 % | 153,5 % → 0,1 % | 15,9 % / 23,5 % → 4,8 % / 17,9 % | 7,1 → 0,0 | 92,0 → 0,0 | 18,3 % → 0,0 % | 8,62 → 0,00 | 74 → 0 |

¹ ohne „Laufen + Kamera drehen“: Dort ändert sich die Bahngeschwindigkeit der Kamera zwangsläufig, nachher 23,9 % gegenüber vorher 44–88 %.
² Zustandswechsel der Locomotion bei konstanter Eingabe, Summe über die Szenarien.

Die verbleibenden Remote-Maxima nachher (9–18 %) stammen aus dem ersten Szenario jedes Laufs. Dort lernt der adaptive Server-Puffer den Jitter erst kennen.

Die Korrekturen vorher waren exakt Vielfache eines Bewegungsschritts: 19,3 cm beim Gehen (5,8 m/s ÷ 30 Hz), 30,7 cm im Sprint, dazu Vielfache davon. Das belegt die Ursache „letzte Eingabe pro Tick“.

### Reaktionszeit (Median)

| Anzeige / Netz | Taste → erste Bewegung (ms) | Loslassen → Stillstand (ms) | Richtungsumkehr sichtbar (ms) |
| --- | ---: | ---: | ---: |
| 60 Hz / LAN | 32,4 → 32,4 | 415,9 → 49,2 | 15,9 → 49,0 |
| 144 Hz / LAN | 33,8 → 33,8 | 6,0 → 13,0 | 3,2 → 7,2 |
| 60 Hz / WAN | 32,4 → 32,4 | 15,9 → 49,2 | 32,4 → 49,0 |
| 144 Hz / WAN | 33,8 → 33,8 | 5,9 → 13,0 | 3,2 → 7,2 |
| 60 Hz / Jitter | 32,4 → 32,4 | 432,5 → 49,2 | 32,2 → 49,0 |
| 144 Hz / Jitter | 33,8 → 33,8 | 110,1 → 13,0 | 3,2 → 7,2 |

Die Mausdrehung wirkt in beiden Ständen im selben Frame.

### Einzelszenarien, 60 Hz / WAN

| Szenario | Lokal v-CV | Kamera v-CV | Remote v-CV | Korrekturen/s | Korrektur Ø / max (cm) | Foot Sliding lokal / remote (m/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Geradeaus laufen | 96,9 % → 0,0 % | 96,9 % → 0,0 % | 3,8 % → 0,6 % | 1,5 → 0,0 | 1,4 / 19,3 → 0 / 0 | 4,96 / 0,10 → 0,00 / 0,01 |
| Sprinten | 98,7 % → 0,0 % | 98,7 % → 0,0 % | 3,7 % → 0,7 % | 0,7 → 0,0 | 1,1 / 30,7 → 0 / 0 | 8,03 / 0,16 → 0,00 / 0,01 |
| Seitwärts | 97,5 % → 0,0 % | 97,5 % → 0,0 % | 2,5 % → 0,6 % | 1,1 → 0,0 | 1,1 / 19,3 → 0 / 0 | 5,00 / 0,08 → 0,00 / 0,01 |
| Rückwärts | 95,6 % → 0,0 % | 95,6 % → 0,0 % | 3,0 % → 0,9 % | 2,4 → 0,0 | 2,8 / 38,7 → 0 / 0 | 4,89 / 0,09 → 0,00 / 0,02 |
| Kreis | 97,0 % → 0,0 % | 37,5 % → 0,7 % | 4,8 % → 0,8 % | 1,3 → 0,0 | 1,1 / 19,4 → 0 / 0 | 4,96 / 0,09 → 0,00 / 0,01 |
| Richtungswechsel | – | – | – | 1,5 → 0,0 | 1,4 / 19,3 → 0 / 0 | 5,17 / 1,57 → 1,42 / 1,53 |
| Anlaufen / Stoppen | – | – | – | 0,5 → 0,0 | 0,5 / 19,3 → 0 / 0 | 3,03 / 0,75 → 0,72 / 0,74 |
| Laufen + Zielen | 97,3 % → 0,0 % | 97,3 % → 0,0 % | 2,9 % → 0,6 % | 2,4 → 0,0 | 2,3 / 19,3 → 0 / 0 | 4,97 / 0,08 → 0,00 / 0,01 |
| Laufen + Kamera drehen | 97,8 % → 0,0 % | 45,2 % → 23,9 % | 2,7 % → 2,3 % | 1,8 → 0,0 | 1,8 / 19,4 → 0 / 0 | 5,01 / 0,08 → 0,00 / 0,03 |

Bei Richtungswechseln bleibt Foot Sliding von etwa 1,4 m/s. Die Eingabe kehrt die Geschwindigkeit sofort um, ein Standfuß kann das physikalisch nicht abbilden. Ohne eigene Bremsanimation ist das nicht vermeidbar.

## Ergebnisse: Frametimes im Browser

### Ungedrosselt (Kosten pro Frame)

| Szenario | FPS | Frame Median | P95 | P99 | Max (ms) | CPU Ø / P95 (ms) | GPU (ms, HUD) | Draw Calls | Server-Tick Ø / P95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Skyfall Carrier, ohne Gegner | 3.153 → 3.059 | 0,30 → 0,30 | 0,50 → 0,50 | 0,60 → 0,60 | 4,40 → 4,20 | 0,29 / 0,40 → 0,30 / 0,40 | 0,0 → 0,0 | 72 → 74 | 0,025 / 0,041 → 0,027 / 0,045 |
| Dev’ Ault, ohne Gegner | 2.605 → 2.291 | 0,40 → 0,40 | 0,50 → 0,60 | 0,70 → 0,80 | 4,70 → 4,90 | 0,34 / 0,50 → 0,36 / 0,50 | 0,1 → 0,1 | 49 → 60 | 0,056 / 0,088 → 0,057 / 0,087 |
| Boreal Relay, 100 Gegner | 4.739 → 4.634 | 0,20 → 0,20 | 0,30 → 0,30 | 0,40 → 0,40 | 4,00 → 3,90 | 0,19 / 0,30 → 0,19 / 0,30 | 0,1 → 0,1 | 49 → 50 | 0,040 / 0,060 → 0,042 / 0,055 |
| Boreal Relay, 500 Gegner | 4.825 → 4.608 | 0,20 → 0,20 | 0,30 → 0,30 | 0,40 → 0,40 | 1,70 → 2,70 | 0,18 / 0,30 → 0,19 / 0,30 | 0,1 → 0,1 | 41 → 43 | 0,118 / 0,169 → 0,119 / 0,163 |
| Boreal Relay, 1.000 Gegner | 4.015 → 3.906 | 0,20 → 0,20 | 0,40 → 0,40 | 0,50 → 0,50 | 1,70 → 2,40 | 0,23 / 0,40 → 0,23 / 0,40 | 0,1 → 0,1 | 42 → 45 | 0,219 / 0,282 → 0,227 / 0,302 |
| Boreal Relay, 1.000 Gegner, 4 Operator | 3.904 → 3.779 | 0,20 → 0,30 | 0,40 → 0,40 | 0,50 → 0,50 | 1,90 → 2,80 | 0,23 / 0,40 → 0,24 / 0,40 | 0,1 → 0,1 | 49 → 51 | 0,255 / 0,315 → 0,247 / 0,308 |

Die Unterschiede liegen im Rauschen dieser Läufe. Die Draw Calls hängen von der Blickrichtung ab, die bei realen Eingaben nicht exakt reproduzierbar ist. Sichtbare Gegner am Ende des Fensters: 102–149 von 1.000.

### Emuliertes 60-Hz-Display (Taktung)

| Szenario | FPS | Frame Median / P95 / P99 (ms) | Frames > 20 ms | CPU Ø / P95 (ms) | Draw Calls | Server-Tick Ø / P95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Skyfall Carrier, ohne Gegner | 58,9 → 58,5 | 16,67 / 16,67 / 33,33 → 16,67 / 16,67 / 33,33 | 17 von 944 → 24 von 937 | 0,63 / 0,90 → 0,66 / 1,00 | 75 → 76 | 0,014 / 0,027 → 0,018 / 0,032 |
| Dev’ Ault, ohne Gegner | 58,4 → 58,8 | 16,67 / 16,67 / 33,33 → 16,67 / 16,67 / 33,33 | 26 von 934 → 19 von 942 | 0,63 / 0,80 → 0,67 / 1,00 | 31 → 33 | 0,034 / 0,056 → 0,038 / 0,060 |
| Boreal Relay, 100 Gegner | 58,1 → 58,4 | 16,67 / 16,67 / 33,33 → 16,67 / 16,67 / 33,33 | 30 von 932 → 26 von 935 | 0,46 / 0,60 → 0,51 / 0,80 | 49 → 51 | 0,027 / 0,038 → 0,036 / 0,058 |
| Boreal Relay, 500 Gegner | 58,2 → 57,9 | 16,67 / 16,67 / 33,33 → 16,67 / 16,67 / 33,33 | 28 von 932 → 33 von 928 | 0,42 / 0,60 → 0,47 / 0,80 | 40 → 42 | 0,115 / 0,161 → 0,126 / 0,170 |
| Boreal Relay, 1.000 Gegner | 58,3 → 58,8 | 16,67 / 16,67 / 33,33 → 16,67 / 16,67 / 33,33 | 28 von 933 → 20 von 941 | 0,51 / 0,70 → 0,52 / 0,90 | 41 → 43 | 0,243 / 0,307 → 0,253 / 0,318 |
| Boreal Relay, 1.000 Gegner, 4 Operator | 58,5 → 58,4 | 16,67 / 16,67 / 33,33 → 16,67 / 16,67 / 33,33 | 24 von 936 → 25 von 936 | 0,52 / 0,80 → 0,52 / 0,80 | 49 → 52 | 0,289 / 0,348 → 0,281 / 0,338 |

Alle Szenarien erreichen den 60-Hz-Takt. CPU-Arbeit pro Frame bleibt unter 1 ms. Die Zahl der Frames über 20 ms streut zwischen den Läufen und ist ein Artefakt der Vsync-Emulation in Headless-Chromium, keine Spielarbeit.

### Netzwerk im Browserlauf (nachher)

Gemessen im 60-Hz-Lauf.

| Szenario | `players`-Abstand Ø / P95 / max (ms) | `horde`-Abstand Ø / P95 (ms) | Ping | Interp.-Verzögerung | Ankunftsjitter P95 | Prediction Error / Korrekturen | Tempo Lauf / Animation (m/s, Median) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Skyfall Carrier, ohne Gegner | 49,9 / 67,5 / 68,7 | 99,9 / 101,3 | 0 ms | 94 ms | 7 ms | 0,0 cm / 0,0 pro s | 5,10 / 5,00 |
| Dev’ Ault, ohne Gegner | 50,0 / 67,3 / 99,2 | 100,0 / 101,1 | 0 ms | 102 ms | 15 ms | 0,0 cm / 0,0 pro s | 5,80 / 5,80 |
| Boreal Relay, 100 Gegner | 49,9 / 67,3 / 99,0 | 99,9 / 100,9 | 0 ms | 103 ms | 17 ms | 0,0 cm / 0,0 pro s | 5,80 / 5,80 |
| Boreal Relay, 500 Gegner | 50,0 / 66,9 / 99,1 | 100,0 / 101,3 | 0 ms | 117 ms | 31 ms | 0,0 cm / 0,0 pro s | 5,80 / 5,80 |
| Boreal Relay, 1.000 Gegner | 50,0 / 66,9 / 98,5 | 100,0 / 100,9 | 0 ms | 118 ms | 31 ms | 0,0 cm / 0,0 pro s | 5,80 / 5,80 |
| Boreal Relay, 1.000 Gegner, 4 Operator | 50,0 / 66,9 / 98,6 | 100,1 / 100,9 | 0 ms | 118 ms | 31 ms | 0,0 cm / 0,0 pro s | 5,80 / 5,80 |

Der `players`-Abstand wechselt bauartbedingt zwischen 33 und 67 ms (20 Hz auf 30-Hz-Ticks). Ein Ankunftsjitter von bis zu 31 ms auf Loopback kommt vom Server-Timer: 33 statt 33,33 ms, alle ~3,3 s ein leerer Callback. Der Abstand mit maximal 99 ms entspricht einem ausgelassenen Snapshot. Im ungedrosselten Lauf waren es bis 185 ms, weil der gemeinsame Node-Prozess (Server, Playwright, Beobachter) dort neben einem Browser mit über 3.000 FPS lief. Die adaptive Timeline fängt beides ohne Halten ab (0 % gehaltene Frames). Ping und RTT liegen auf Loopback bei 0–1 ms. Reale RTT- und Jitterwerte deckt der Headless-Benchmark mit `wan` und `jitter` ab.

In allen Browserszenarien gab es **0 Reconciliation-Korrekturen** bei 0,0 cm Prediction Error. Für den Vorher-Stand gibt es keine Browser-Telemetrie dazu, weil er diese Anzeige noch nicht hatte. Die Headless-Messung zeigt für ihn 0,6–9,4 Korrekturen pro Sekunde.

## Ergebnisse: Server-Tick

| Ziel | Tick Ø vorher → nachher (ms) | Tick P95 vorher → nachher (ms) | Max (ms) | Schüsse / Abschüsse |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0,001 → 0,001 | 0,002 → 0,002 | 0,026 → 0,076 | 1.424 / 0 (gleich) |
| 100 | 0,013 → 0,013 | 0,020 → 0,020 | 0,145 → 0,078 | 1.222 / 84 (gleich) |
| 250 | 0,035 → 0,036 | 0,041 → 0,042 | 0,099 → 0,085 | 1.130 / 45 (gleich) |
| 500 | 0,084 → 0,087 | 0,098 → 0,101 | 0,254 → 0,344 | 1.069 / 51 (gleich) |
| 1.000 | 0,211 → 0,210 | 0,240 → 0,234 | 1,280 → 1,148 | 1.018 / 36 (gleich) |

Mission mit vier Operatoren: Die Sättigung L7 (1.000 Gegner) liegt bei 0,362 / 0,373 → 0,351 / 0,362 ms. Der Extraktionslauf über 2.850 Ticks liegt bei 0,377 / 0,408 → 0,382 / 0,404 ms, mit 2.822 Ticks an der Obergrenze von 1.000 Gegnern und 4 extrahierten Operatoren in beiden Ständen. Identische Schuss- und Abschusszahlen zeigen, dass die geänderte Eingabeverarbeitung das Kampfergebnis dieser deterministischen Läufe nicht verändert.

## 60 FPS und Engpässe

Auf der Testmaschine erreichen alle Szenarien den 60-Hz-Takt mit großer Reserve. Die Spielarbeit liegt bei 0,2–0,9 ms CPU und etwa 0,1–0,2 ms GPU pro Frame. Ein Engpass ist hier nicht messbar. Gemessen wurde nur auf einer leistungsstarken Desktop-GPU. Frühere Software-Rendering-Läufe (SwiftShader, siehe [PERFORMANCE.md](PERFORMANCE.md)) lagen bei 12–16 FPS. Auf schwacher Hardware ist damit die GPU-Füllrate der wahrscheinliche Engpass. Diese Messung steht für 7.1 aus.
