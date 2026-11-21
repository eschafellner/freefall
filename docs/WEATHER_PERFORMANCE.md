# Wetterperformance · 7.7C

Der lokale Ausgangslauf vor dem Patch verwendete Wald 63, Mission Seed 0, `relay-defense`, Medium, 1 Operator und 0 Gegner, 1280 × 720. Chromium 153.0.8010.12 nutzte SwiftShader auf einem Ryzen 7 9700X. In 5,10 s wurden 14,51 FPS, 100,0 ms P95, 616,6 ms P99, 0,33/0,53 ms Server-Tick P95/P99 und 0 verworfene Steps gemessen. Die Stichprobe lag bei 129 Draw Calls, 45 Texturen sowie 2,8/70,9 ms CPU/GPU-Telemetrie. Diese Startmessung verwendet eine andere Auflösung als die 7.7C-Paarmessung.

Die Simulation besitzt ein bestehendes 33,33-ms-Serverbudget. Die GPU-Telemetrie erfasst die gesamte Szene. Native GPU, Textur- und Speicherbytes, isolierte Shader-, Shadow- und Overdraw-Kosten sowie Langzeitspeicher sind eigene Messungen. Der Partikelbatch reserviert rechnerisch 5 KiB Vertexdaten und 324 Bytes für Terrain-Höhenuniforms. Wetter erzeugt keine Partikeltexturen, zusätzlichen Schattenkarten oder Postprocessing-Pässe.

## Native Lastmatrix

Radeon RX 9070 XT, Ryzen 7 9700X, Chromium 153.0.8010.12, ANGLE OpenGL ES 3.2, Node 24.18.0, 1.280 × 720, Medium. Wald 63, Mission Seed 0, `relay-defense`, Tagespreset `day`. Die Werte vergleichen deaktivierte Clientdarstellung mit `ground-mist`. Die Serverautorität bleibt in beiden Läufen aktiv. Pro Laststufe wurden rund 12 s gemessen. Die Koop-Messungen verwenden vier Browseransichten. Beide nativen Koop-Läufe lösten eine echte Director-Welle aus und hielten die Zielpopulationen anschließend mit der Lastfixture.

| Operatoren / aktive Gegner | FPS langsamster Client aus → an | Frame P95 / P99, maximale Ansicht | Server P95 / P99 aus → an | Verworfene Steps |
| --- | ---: | ---: | ---: | ---: |
| 1 / 0 | 60,0 → 60,0 | 16,8 / 16,8 ms → 16,8 / 16,8 ms | 0,227 / 0,258 ms → 0,218 / 0,256 ms | 0 / 0 |
| 4 / 250 | 60,0 → 60,0 | 16,8 / 16,8 ms → 16,8 / 16,8 ms | 0,745 / 0,845 ms → 0,613 / 0,734 ms | 0 / 0 |
| 4 / 500 | 60,0 → 60,0 | 16,7 / 16,8 ms → 16,8 / 16,8 ms | 0,886 / 0,931 ms → 0,806 / 0,837 ms | 0 / 0 |
| 4 / 1.000 | 60,0 → 60,0 | 16,8 / 16,8 ms → 16,8 / 16,8 ms | 1,257 / 1,424 ms → 1,216 / 1,263 ms | 0 / 0 |

Die anfänglichen F2-Stichproben der getrennten 1.000er-Läufe zeigten 43–106 gegenüber 217–288 Draw Calls. Die Szenen befanden sich bei unterschiedlichen Gegnerpositionen. Ein Folgelauf schaltete Wetter bei derselben Kamera und 1.000 aktiven Gegnern an, aus und wieder an. Die Bereiche über je sechs Stichproben waren 274–276, 274–275 und 274 Draw Calls. Die Szenen-CPU lag bei 1,4–1,6 ms und die GPU-Telemetrie bei 0,2–0,3 ms. Die sichtbare Population wuchs von 695 auf 714 Gegner. Die Zahl der Texturressourcen lag bei 53–54. Die Messung erreicht das 60-Hz-Limit und liefert keine unlimitierte GPU-Kapazitätsaussage.

Bei aktivem Waldwetter betrug das P95 der isolierten Server-Wettersteuerung in der Matrix höchstens 0,0025 ms. Der 1.000er-Lauf verwendete 716,4 → 716,6 MiB Node-RSS. Das umfasst Testprozess, Vite und Server. Chromium und VRAM sind separat. Bis zum letzten Lastfenster kamen pro beobachteter Verbindung drei Wetterpakete mit insgesamt 900 Byte an. Zwischen den Zustandswechseln waren es 0 Byte/s. Die F2-Wetter- und Partikelzeiten lagen in mehreren Stichproben unter der Browser-Timerauflösung.

### Eis auf High mit 1.000 Gegnern

Vier Browseroperatoren, Eis 48, Missions-Seed 0, `dusk`, `windy-snow`, 1.280 × 720, High. 320 Partikel pro Client. In 12,03 s erzielten alle Ansichten im Schnitt 60,0 FPS, P95/P99 von 16,8/16,8 ms und 0 verworfene Server-Steps. Server-Tick P95/P99 lagen bei 0,880/1,025 ms. Szenenstichproben lieferten 1,8–2,0 ms CPU, rund 0,2 ms GPU, 173–204 Draw Calls und 54–55 Texturressourcen. [Aufnahme](playtest/7-7c/ice-1000.jpg)

### SwiftShader-Kontrollmessung

Die 800 × 500-Softwareläufe behielten 1.000 aktive Gegner und 0 verworfene Server-Steps in beiden Varianten. Die langsamste Ansicht erreichte 3,74 FPS ohne und 3,21 FPS mit Waldwetter. Die Werte sind durch vier Software-Renderpfade auf derselben Maschine limitiert. Die Softwareläufe verwendeten die Lastfixture, nachdem die echte Welle innerhalb der Wartefrist nicht anlief. Alle nativen Koop-Stufen verwendeten zuvor die erfolgreich ausgelöste Welle.

### Solo-Stichproben je Biom

Bei 800 × 500 auf nativer GPU erreichten alle drei zusätzlichen Biome rund 60 FPS. Die Last betrug hier 0 Gegner.

| Biom und Wetter | Qualität | Punkte | CPU / GPU | Draw Calls |
| --- | --- | ---: | ---: | ---: |
| Eis · `windy-snow` | Low | 64 | 1,3 / 0,1 ms | 178 |
| Eis · `windy-snow` | High | 320 | 1,3 / 0,2 ms | 184 |
| Eis · `windy-snow` + reduzierte Bewegung | Medium | 0 | 1,0 / 0,1 ms | 180 |
| Wüste · `light-dust-gusts` | Medium | 176 | 1,1 / 0,1 ms | 181 |
| Grüne Ebene · `windy` | Medium | 0 | 1,0 / 0,1 ms | 159 |

In allen fünf Stichproben lagen die ausgewiesenen CPU-Zeiten für einzelne Atmosphären- und Partikelupdates unter der Timerauflösung. Die Werte für Draw Calls und CPU/GPU umfassen die ganze Szene. Isolierte Kosten für den Vertex-Shader, Schatten- und Transparenzpass sind **NOT TESTED**.

[Messrohdaten](playtest/7-7c/performance.json)

## Reproduktion

```sh
export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/pfad/zu/chromium
export FREEFALL_BROWSER_ANGLE=gl
export FREEFALL_GENERATED_SEED=0 FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63
export FREEFALL_BROWSER_WIDTH=1280 FREEFALL_BROWSER_HEIGHT=720 FREEFALL_BROWSER_SAMPLE_MS=12000
export FREEFALL_BROWSER_LOAD_ONLY=1
for weather in off ground-mist; do
  FREEFALL_WEATHER=$weather FREEFALL_OPERATORS=1 FREEFALL_BROWSER_PEERS=1 FREEFALL_BROWSER_ENEMIES=0 \
    node --conditions=development scripts/playtest-horde-director.mjs
  FREEFALL_WEATHER=$weather FREEFALL_OPERATORS=4 FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ENEMIES=250,500,1000 \
    node --conditions=development scripts/playtest-horde-director.mjs
done
```

`FREEFALL_WEATHER=off` schaltet im Loopback-Debugraum nur die lokalen Wettereinträge ab. So bleiben Welt, Mission, Tagespreset, Autorität, Kamera- und Hordenfixture gleich. Der Harness versucht eine reale Director-Welle und hält danach die Laststufe bei weiterhin aktiver KI fest. Falls das Pacing den Debug-Aufruf blockiert, protokolliert der reine Lastlauf diesen Zustand und führt die Kapazitätsfixture aus. `FREEFALL_BROWSER_COOP_ACCEPTANCE=1` erweitert den Lauf um Reconnect im laufenden Wetterübergang und Qualitätswechsel.

## Messgrenzen und Budgetvorschläge

Für die Wettersteuerung sind höchstens 0,05 ms Server-CPU je Tick im P95 ein Vorschlag. Für native Zielhardware lässt sich als erste Vergleichsgrenze eine zusätzliche P95-Framezeit von höchstens 1 ms auf denselben Seeds und Kameras ansetzen. Die vertikale Synchronisation sollte für die isolierte Kostenmessung deaktiviert werden. Als überprüfbare Arbeitsgrenzen gelten ein Partikeldraw und maximal 320 Punkte je Client. Der Sky-Blend übernimmt den vorhandenen Himmelsdraw. Die Version der Wetterkonfiguration und die Zustandsrevision halten den Netzwerkpfad ereignisbasiert.

Ein erfolgreicher 1.000er-Lauf belegt die aktive Simulation und die Darstellung unter der geprüften Last. Produktions-FPS, die Kosten auf repräsentativen GPUs und Langzeitstabilität brauchen entsprechende Hardware und längere Messfenster.
