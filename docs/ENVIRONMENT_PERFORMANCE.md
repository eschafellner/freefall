# Umgebungsperformance · 7.7A

Vergleich des 7.6-Arbeitsstands vor den Atmosphärenänderungen mit dem 7.7A-Produktionsbuild. Hardware AMD Ryzen 7 9700X und Radeon RX 9070 XT. Runtime Node.js 24.18.0 und Chromium 153.0.8010.12 mit ANGLE/OpenGL. Vier lokale Browser-Clients, 1280 × 720, Medium. Der Harness startet eine echte Director-Welle und hält dann für die Messung 1.000 simulierte Gegner im aktiven Einsatz. Die Browser-Telemetrie erfasst die gesamte Szene. Server-Ticks gelten für einen Raum.

| Parameter | Wert |
| --- | --- |
| Welt | Wald, Seed 63, Generator v1, `world.generated.acdc7ec0c04dd3da` |
| Auftrag | Relaisverteidigung auf FREEFALL, Missions-Seed 0, `generated.1df7f7561fcb275f` |
| Atmosphäre | Gemeinsamer 7.6-Himmel vor dem Patch. `forest.filtered-day.v1` mit fester Tageslichtstimmung danach. |

## Vorher und nachher

| Kennzahl | 7.6 | 7.7A |
| --- | ---: | ---: |
| Messfenster | 12,04 s | 12,04 s |
| Langsamste Ansicht | 60,0 FPS | 60,0 FPS |
| Framezeit P95 / P99, jeweils höchste über vier Ansichten | 16,8 / 16,8 ms | 16,8 / 16,8 ms |
| Server-Tick P95 / P99 | 1,76 / 1,89 ms | 1,69 / 1,97 ms |
| Verworfene Server-Ticks | 0 | 0 |
| Draw Calls je Ansicht, Stichprobe | 32–76 | 32–76 |
| Dreiecke je Ansicht, Stichprobe | 20.163–100.990 | 20.163–101.610 |
| Texturen je Ansicht, Stichprobe | 44–45 | 47–48 |
| Sichtbare / aktive Gegner | 0–213 / 1.000 | 0–219 / 1.000 |
| CPU / GPU je Ansicht, Stichprobe | 1,3–1,5 / 0,1 ms | 1,4–1,6 / 0,1 ms |
| Node-RSS Anfang → Ende | 708,1 → 713,6 MiB | 700,5 → 705,8 MiB |
| Auftragsergebnis nach der Probe | Ballon, 1 extrahiert, 3.505 Ticks | Ballon, 1 extrahiert, 3.506 Ticks |

Die Framewerte liegen in beiden Läufen am beobachteten 60-Hz-Limit. Die Sichtstichproben bilden leicht unterschiedliche Gegnerpositionen ab. In diesem Lauf kamen je Ansicht drei Texturressourcen hinzu. Node-RSS umfasst den Testprozess mit lokalem Server und Vite. Chromium- und GPU-Speicher sind darin nicht enthalten. Ein kurzes Messfenster erlaubt keine Aussage zum Langzeitverhalten.

## Reproduktion

```sh
npm run build -w @freefall/shared
env PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_EXECUTABLE=/path/to/chromium \
  FREEFALL_GENERATED_SEED=0 FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63 \
  FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_SAMPLE_MS=12000 \
  node --conditions=development scripts/playtest-horde-director.mjs
```

Der Himmel verwendet die vorhandene Background-Pass- und Environment-Verarbeitung. Der Patch behält eine gemeinsame Sky-Textur und höchstens eine Planetentextur. Ein HDR-Quellbild hat 1 MiB RGBA16F-Rohdaten, ein LDR-Bild 0,5 MiB RGBA8. Three.js erzeugt intern weitere Background- und Environment-Ressourcen. Texture Count ist ein Objektzähler. Während des Draw ändern sich Lichtdaten nur bei Profil-, Pfad- oder Szenenwechsel, und der Schattenbereich wird im bestehenden 24-m-Raster nachgeführt.

**NOT TESTED** für GPU-Speicher in Byte, Shader-Erstkompilierung, Langzeit-Memory, Vergleich der übrigen Biome unter Browserlast und Laststufen 0/250/500. Kosten von Partikeln und Soundscapes werden mit 7.7C/D relevant. Der lokale Waldlauf dient als Vergleich auf derselben Hardware. Produktionsbudgets und Zielgeräte gehören zur finalen Abnahme. [7.6-Basis](WORLD_PERFORMANCE.md)

## 7.7B · Wald-Lastmatrix

AMD Ryzen 7 9700X, Radeon RX 9070 XT (radeonsi gfx1201 ACO), Fedora 45, Chromium 153.0.8010.12 mit ANGLE OpenGL ES 3.2, Node 24.18.0 und Vite-Produktionsbuilds. 7.7A ist der eingefrorene Ausgangsstand und 7.7B der überarbeitete Renderer. Die Tests laufen mit Wald-Seed 63, `forest.filtered-day.v1`, Mission Seed 0, derselben Welt-ID und Relaisverteidigung auf FREEFALL. Medium verwendet 1280 × 720 CSS-Pixel, DPR 1 und 1152 × 648 interne Pixel. Pro Laststufe rund 12 s. Der Harness platziert die Operatoren reproduzierbar, löst im Koop-Lauf einen echten Horde-Spawn aus und misst danach feste Populationen mit aktiver KI.

| Operatoren / Gegner | FPS langsamster Client | P95 / P99 Framezeit, höchste Ansicht | Server-Tick P95 / P99, 7.7A → 7.7B | Verworfene Ticks |
| --- | ---: | ---: | ---: | ---: |
| 1 / 0 | 60,0 → 60,0 | 16,7 / 16,8 → 16,8 / 16,8 ms | 0,21 / 0,23 → 0,25 / 0,36 ms | 0 → 0 |
| 4 / 250 | 60,0 → 60,0 | 16,8 / 16,8 → 16,8 / 16,8 ms | 0,76 / 0,88 → 0,82 / 0,86 ms | 0 → 0 |
| 4 / 500 | 60,0 → 60,0 | 16,8 / 16,8 → 16,8 / 16,8 ms | 0,90 / 1,03 → 0,94 / 1,11 ms | 0 → 0 |
| 4 / 1.000 | 60,0 → 60,0 | 16,8 / 16,8 → 16,8 / 16,8 ms | 1,19 / 1,33 → 1,21 / 1,32 ms | 0 → 0 |

| Operatoren / Gegner | Draw Calls, 7.7A → 7.7B | Dreiecke, 7.7A → 7.7B | Geometrien, 7.7A → 7.7B | Texturen, 7.7A → 7.7B | Instanzen 7.7B |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / 0 | 85 → 43 | 40.284 → 63.170 | 104 → 111 | 48 → 53 | 1.063 |
| 4 / 250 | 34–74 → 40–91 | 17.357–67.234 → 50.196–141.368 | 107–125 → 111–130 | 47–48 → 51–53 | 731–1.983 |
| 4 / 500 | 35–77 → 43–94 | 37.331–101.580 → 70.390–176.018 | 107–126 → 111–134 | 47–48 → 51–53 | 829–2.081 |
| 4 / 1.000 | 35–76 → 43–93 | 58.269–138.516 → 91.628–212.652 | 107–126 → 111–134 | 47–48 → 51–53 | 892–2.164 |

Die zweite Tabelle enthält F2-Stichproben der gesamten Szene über die Ansichten. Positionen simulierter Gegner, Schattenaktualisierung und erwärmte Renderressourcen können zwischen den Stichproben variieren. Bei 1.000 Gegnern lag der Navigationsabschnitt beider Läufe bei 1,06 ms P95. Die Render-CPU-Stichproben der vier Ansichten lagen bei 1,1–1,3 ms in beiden Läufen und die berichtete GPU-Zeit bei 0,1 ms. Die frühe Solo-Stichprobe meldete 7,0 → 16,5 ms CPU. Die Framezeiten über das gesamte Solo-Messfenster blieben beim 60-Hz-Takt. Eine isolierte Lade- oder Erstkompilierungszeit geht daraus nicht hervor.

Terrain- und Kronen-LOD, größere Distanzdämpfung für Kleinstinstanzen und räumliche Gruppen für physische Felsen begrenzen die neuen Geometrie- und Schattenkosten. Auf dieser GPU erhöhen die Bodendetails die Renderarbeit, während der beobachtete Frametakt und das 33,33-ms-Server-Tickbudget gehalten werden. Die laufenden Terrain- und Pflanzen-Assets haben ungefähr 1,50–1,67 MiB zusätzliche Texturrohdaten auf der GPU inklusive Mipmaps. Das ist ein rechnerisches Budget für diese Texturen. Three.js-Zähler erfassen Objekte. Das Node-RSS im Rohbericht schließt Chromium und VRAM aus. [Messprotokoll](playtest/7-7b/performance.json)

### High-Stresstest

Vier Chromium-Clients mit je 1.280 × 720 Renderpixeln, High, 2048²-Schattenkarte und FXAA. Testwelt, Mission und Lastfixture entsprechen dem Medium-Vergleich. Bei 1.000 aktiven Gegnern hielten beide Stände 60,0 FPS mit P95/P99 von 16,8/16,8 ms. Der Tickserver lag bei 1,44/1,48 → 1,49/1,64 ms P95/P99 und verwarf keinen Schritt. Die Gesamtgeometrie je Ansicht lag bei 21.315–123.392 → 70.234–223.774 Dreiecken, Draw Calls bei 34–78 → 43–95 und Texturen bei 49–50 → 53–55. Die Instanzzahl pro Ansicht lag bei 992–2.492 → 1.041–2.779. GPU-Stichproben meldeten in beiden Läufen 0,2–0,3 ms. Die High-Läufe starteten direkt bei 1.000 Gegnern, wodurch die sichtbare Gegnerverteilung von der gestaffelten Medium-Matrix abweicht.

**NOT TESTED** · Isolierte Shadow-Pass- und Overdraw-Zeit, reale GPU-Geometrie- und Texturspeicherbytes, Shader-Erstkompilierung, Langzeitverhalten, mehrere Räume, Zielgerätematrix und Browserlastmatrix außerhalb des Waldes.

### Reproduktion 7.7B

```sh
npm run build -w @freefall/shared
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/path/to/chromium
export FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_SAMPLE_MS=12000
export FREEFALL_GENERATED_SEED=0 FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63
FREEFALL_OPERATORS=1 FREEFALL_BROWSER_PEERS=1 FREEFALL_BROWSER_ENEMIES=0 \
  node --conditions=development scripts/playtest-horde-director.mjs
FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ENEMIES=250,500,1000 FREEFALL_BROWSER_COOP_ACCEPTANCE=1 \
  node --conditions=development scripts/playtest-horde-director.mjs
FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ENEMIES=1000 FREEFALL_BROWSER_QUALITY=high FREEFALL_BROWSER_LOAD_ONLY=1 \
  node --conditions=development scripts/playtest-horde-director.mjs
```

## Native Messungen 7.7E

Chromium 153.0.8010.12, Radeon RX 9070 XT, Ryzen 7 9700X, Viewport 1.280 × 720, `medium`, Audio eingeschaltet. Alle Solo-Szenen nutzten Mission Seed 0, rund 6 s Messzeit und null serverseitige Gegner. Bei `medium` cappt die Renderauflösung die interne Auflösung gemäß Grafikprofil.

| Planet / Welt-Seed / Wetter | FPS Ø | Frame P95 / P99 | Tick P95 | Punktpartikel | CPU / GPU in F2 | Draw Calls / Dreiecke in F2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Grüne Ebene 17 · `windy` | 60,0 | 16,7 / 16,8 ms | 0,186 ms | 0 | 4,6 / 0,1 ms | 43 / 47.925 |
| Wüste 31 · `light-dust-gusts` | 60,0 | 16,7 / 16,8 ms | 0,233 ms | 176 | 3,6 / 0,1 ms | 213 / 74.527 |
| Eiswelt 48 · `windy-snow` | 60,0 | 16,8 / 16,8 ms | 0,212 ms | 176 | 3,0 / 0,1 ms | 216 / 62.909 |
| Wald 63 · `ground-mist` | 60,0 | 16,7 / 16,8 ms | 0,186 ms | 0 | 2,1 / 0,1 ms | 38 / 50.019 |

Die Vierer-Matrix verwendete Wald 63, Mission Seed 0, `dawn`, `ground-mist`. Pro Laststufe rund 12 s mit vier vollständigen Rendering- und Audioclients. Die FPS-Zahl ist die langsamste Ansicht. Frames P95/P99 und F2-Maxima verwenden jeweils den höchsten Wert über die vier einzelnen Ansichten.

| Operatoren / Gegner | FPS Ø | Frame P95 / P99 | Server-Tick Ø / P95 / P99 | Hordendaten je Client | Verworfene Schritte |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 / 250 | 59,0 | 16,8 / 33,3 ms | 0,629 / 0,798 / 1,128 ms | 25.972 B/s | 0 |
| 4 / 500 | 56,6 | 33,3 / 33,4 ms | 0,893 / 1,722 / 2,385 ms | 51.735 B/s | 0 |
| 4 / 1.000 | 57,5 | 16,8 / 33,4 ms | 1,568 / 2,731 / 5,400 ms | 101.186 B/s | 0 |

Bei 1.000 Gegnern zeigten die F2-Stichproben je Perspektive 45–106 Draw Calls, 95.247–218.743 Dreiecke, 157–177 Geometrien und 52–53 Texturen. Die kurze F2-Ausgangsprobe meldete 2,6–4,2 ms CPU und 0,1 ms GPU. GPU-Zeit stammt vom Szenenzähler und ist insbesondere am VSync-Limit kein isoliertes Overdraw-Maß. Director-P95 lag bei 0,0102 ms, Atmosphärenserver-P95 bei 0,0014 ms und beobachteter Tick-Takt bei rund 30 Hz. Der Node-Testprozess mit Server, Harness und Vite lag bei 712,16 → 712,54 MiB RSS in diesem Fenster. Die Zahlen für das Server-Tickbudget stammen aus dem letzten 4-s-Fenster. Netzwerkzahlen sind reine Horden-Nutzbytes vor Transport-Overhead. [Ausgangswerte je Frame-Stichprobe](playtest/7-7e/performance.json)

### Ressourcen und Server-Soak

| Planet | Geometrien / Texturen am Resultat | Nach Raumaustritt und erstem valideren Render-Sample |
| --- | ---: | ---: |
| Grüne Ebene | 212 / 55 | 107 / 46 |
| Wüste | 201 / 53 | 107 / 46 |
| Eiswelt | 240 / 58 | 118 / 49 |
| Wald | 244 / 58 | 118 / 49 |

Die absichtlich weiterlebende Arena und die gemeinsam genutzten Assets der laufenden Seite bilden den Sockel der Zähler. Zwei getrennte Server-Soaks umfassten je 36.000 Messticks, entsprechend 20 virtuellen Minuten auf Bodenbruch. Die natürliche Sättigung hielt 1.000 Schaben in 36.000/36.000 Ticks, Peak 52 Gruppen und zehn Nester. Tick Ø/P95/P99/Max 1,624/1,963/4,346/15,055 ms, RSS am Ende 186,85 MiB und Heap-Differenz +23,58 MiB in einer Probe ohne erzwungenen GC. Die feste Director-Kohorte hielt ebenfalls 1.000, Tick Ø/P95/P99/Max 0,513/0,554/2,766/25,635 ms, AI-P95 0,545 ms und Heap-Differenz −7,21 MiB. Beide Profile lagen bei den gemessenen Spitzen unter dem vorhandenen 33,33-ms-Schrittbudget. Die Soaks haben unterschiedliche Angriffsprofile und sind getrennte Stichproben. [Server-Soak](playtest/7-7e/server-soak.txt) · [Horden-Soak](playtest/7-7e/horde-soak.txt)

Die historischen nativen 7.7B/C/D-Werte liegen in den Kapitelberichten. Ein exakter Lauf auf 7.7D mit identischer Kamera, naher Kampfkohorte, Auflösung und Audioinstrumentierung fehlt. Detailaufteilung von VRAM und Garbage-Collection-Verlauf, isolierte Kosten für Vegetation, Fog, Schatten und Shader sowie abweichende Zielgeräte bleiben offen. 33,33 ms je Server-Schritt, 320 Wetterpunkte und 28 Stimmen sind vorhandene technische Grenzen. FPS- und Plattformgrenzen aus 7.3E/7.4E bleiben Budgetvorschläge. [7.7E-Gates](MILESTONE_7_7_FINAL_ACCEPTANCE.md)

### Renderpfade und Einstellungen

Vier native Clients auf **Eis High** mit 1.000 Gegnern, 320 Schneepunkten pro Ansicht und Audio liefen bei 60,0 FPS Ø, Frame-P95/P99 16,7/16,8 ms und Server-P95/P99 1,083/1,152 ms. Null Server-Steps gingen verloren. Der Host stellte den absichtlich verlorenen WebGL-Kontext wieder her und fuhr mit demselben Schneezustand und 320 Punkten fort. In der Solo-Prüfung mit reduzierter Bewegung fielen die Schneepunkte bei weiter aktivem Wetter auf null. Grafikqualität, reduzierte Bewegung, Stumm, Audio aktiv und alle sechs Lautstärkeregler wurden nach einem Browser-Reload mit den gewählten Werten wiederhergestellt. [Rohdaten und Einstellungen](playtest/7-7e/additional-measurements.json)

Für den Fog-Paarlauf schaltete dieselbe native Waldansicht bei 1.000 aktiven Gegnern, 1.280 × 720 Medium und identischer Kamera `ground-mist` an, aus und wieder an. Die 18 F2-Stichproben meldeten jeweils 42 Draw Calls und GPU-Werte von 0,1–0,2 ms in allen drei Blöcken. Die sichtbaren Gegnerpositionen änderten sich weiter. Ein separater Fog-Pass fällt hier aus, weil Bodennebel im bestehenden Shaderpfad berechnet wird. Die Messauflösung reicht nicht für eine genaue Kostenaufteilung. `FREEFALL_BROWSER_WEATHER_PAIR=1` mit einem Chromium- und drei SDK-Peers wiederholt diesen Ablauf. Ein erster Versuch mit vier softwaregerenderten SwiftShader-Clients bei 800 × 500 erreichte das Browser-Initialisierungslimit des Harness. Die native Vierermatrix und die softwaregerenderten Solo-Referenzen liefen durch. [Zusatzmessungen](playtest/7-7e/additional-measurements.json)

### Kombinierte Schlussprobe und Browser-Soak

Der finale Build wiederholte Wald 63, `ground-mist`, vier Chromium-Clients, 1.000 Schaben und aktives Audio. In 8,03 s bewegten sich 954 Schaben mindestens 10 cm und 233 autoritative Operator-Angriffe starteten. Alle vier Clients erreichten 60,0 FPS Ø. Server-Tick P95 war 1,937 ms und es gingen null Schritte verloren. Auf Grüner Ebene und Wüste liefen getrennte 1.000er-Vergleichsfenster mit je 60,0 FPS Ø über alle vier Clients und aktiver Soundscape. In diesen beiden Vergleichsfenstern starteten keine Angriffe gegen Operatoren. Die kombinierte Angriffslast ist durch Wald und Eis belegt. [Rohdaten](playtest/7-7e/additional-measurements.json)

Der Echtzeit-Soak lief 1.200,67 s mit einem nativen Chromium-Client in derselben Waldwelt, 0 Gegnern und regulären autoritativen Wetterwechseln. Er begann vor der Browser-Kompatibilitätskorrektur. Der finale Build behält dieselbe Weltidentität und den getesteten Chromium-Renderpfad. Alle 20 Minutenstichproben hatten zwei planetare Loop-Stimmen und 73,06 MiB im PCM-Cache. Gemessen wurden 3–4 Gesamtstimmen, null Audiofehler, 60,0 FPS Ø, Frame-P95 16,7 ms, Server-P95 0,164 ms und null verworfene Schritte. Die Stichproben beobachteten `ground-mist`, `forest-calm`, `overcast-forest` und `windy-forest`. [Browser-Soak](playtest/7-7e/browser-soak.json)

In den CDP-Stichproben lagen die genutzten JS-Heapwerte zwischen 18,79 und 40,46 MiB und endeten bei 36,62 MiB. Backing Storage lag bei 16,52–16,84 MiB und endete bei 16,73 MiB. Node-RSS einschließlich Harness und Vite ging von 704,52 auf 652,12 MiB. Die ab der zweiten Hälfte gelesenen `amdgpu`-DRM-Client-Zähler des isolierten Chromium-Prozesses lagen zusammen bei ungefähr 222,6–223,8 MiB residentem VRAM und beinhalten Browserressourcen. Damit ist VRAM auf Prozessebene stichprobenartig erfasst. Texturbytes je Asset, Audiothread-CPU, isolierte GC-Pausen und ein mehrstündiger Vierer-Soak bleiben offen. Die Zähler belegen die Beobachtung im geprüften Lauf, keine vollständige Leak-Freiheit über alle Browser und Hardwareprofile. [Treiberstichproben](playtest/7-7e/additional-measurements.json)
