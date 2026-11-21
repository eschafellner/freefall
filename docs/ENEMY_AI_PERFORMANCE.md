# Gegner-KI · Performance und Diagnostik

## Reproduktion

Gemessen am 19. November 2026 auf AMD Ryzen 7 9700X (8 Kerne, 16 Threads), Linux x64 7.3.3-300.fc45, Node 24.18.0. Basis war der lokale 7.4A-Stand auf Git `4daf04e` mit den dort bereits vorliegenden Workspace-Änderungen. Der 7.4B-Stand nutzt denselben Git-Ausgangspunkt mit den Änderungen dieses Meilensteins und Balance-Hash `017bf8cbe438c303`. Der Server rechnet mit 30 Hz und 33,33 ms Zeitbudget pro Tick. Die CPU-Matrix verwendet virtuelle Ticks samt separat gemessenem Horde-Encoding.

```sh
for scenario in distributed open concentrated corridor mobile; do
  npm run benchmark -- enemy-ai 1800 421337 matrix "$scenario"
done
npm run benchmark -- mission 1800 421337 4
node --trace-gc --conditions=development apps/server/src/benchmark.ts enemy-ai 1800 421337 matrix distributed
ANGLE=swiftshader CHROMIUM_EXECUTABLE=/path/to/chromium PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  node --conditions=development scripts/perf-browser.mjs /tmp/freefall-browser-perf.json
```

Der Harness ersetzt natürliche Spawns durch eine konstante Kohorte. Je Messpunkt liefen dieselben 100 / 250 / 500 / 1.000 IDs für 360 Ticks Warm-up (12 s) und 1.800 Messticks (60 s). Die feste Matrix verwendet einen Operator bei 100 und vier ab 250. Die Operator-HP werden vor jedem Schritt hochgesetzt, damit reguläre Treffer zur Laufzeit weiter messbar bleiben. Die Benchmarks überprüfen Gegnerzahl, Stichproben der Positionen und Entity-IDs, gültige Zielslots, Dekodierung von Snapshots sowie Routen- und Feldbudgets. `corridor` hält den initialen Kontakt der Patrouillen während des Tests gültig. `mobile` bewegt Operatoren mit regulären Eingaben in wiederholten Bögen.

## Vergleich mit 7.4A auf echter Bodenbruch-Geometrie

Stationäre Operatoren an bis zu vier verteilten Positionen. Die 7.4A-Referenz wurde vor den Änderungen mit demselben Seed, derselben Dauer und Operatorzahl aufgezeichnet.

| Operatoren / Schaben | Tick P95 7.4A | Tick Ø 7.4B | Tick P95 7.4B | Tick P99 7.4B | Max. 7.4B |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / 100 | 0,057 ms | 0,060 ms | 0,073 ms | 0,097 ms | 0,132 ms |
| 4 / 250 | 0,080 ms | 0,077 ms | 0,090 ms | 0,101 ms | 0,603 ms |
| 4 / 500 | 0,203 ms | 0,127 ms | 0,150 ms | 0,161 ms | 0,252 ms |
| 4 / 1.000 | 0,397 ms | 0,250 ms | 0,280 ms | 0,306 ms | 0,709 ms |

Bei 1.000 Schaben waren in der 7.4B-Messung alle vier verteilten Operatoren gültige Ziele. Die stationäre 7.4B-Kohorte hatte im Messfenster maximal sechs aktuell bewegte Schaben in einer Sekundensichtprobe. Größere Teile der Horde warteten auf Platz hinter besetzten Angriffsräumen. Die P95-Verbesserung beschreibt dieses Lastprofil. Die Zahl der Nahkampf-HP im festen Vergleich fiel von 83.840 auf 22.552. Die alte Stuck-Messung registrierte 263 Episoden abgeschnittener Bewegung. 7.4B registrierte eine neue Episode nach dem Warm-up und 229 Übergänge in die Wartephase einschließlich bereits im Warm-up begonnener Episoden. Die beiden Stuck-Messungen verwenden unterschiedliche Definitionen.

## Vergleich der Umgebungen

| Gegner | Freies Gelände, P95 | Vier nah beieinander, P95 | 1,2-m-Durchlass, P95 | Laufende Operatoren, P95 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 0,059 ms | 0,034 ms | 0,032 ms | 0,067 ms |
| 250 | 0,079 ms | 0,081 ms | 0,070 ms | 0,223 ms |
| 500 | 0,146 ms | 0,163 ms | 0,144 ms | 0,544 ms |
| 1.000 | 0,271 ms | 0,266 ms | 0,308 ms | 1,428 ms |

| 1.000 Gegner | Verteilt | Frei | Konzentriert | Durchlass | In Bewegung |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tick Ø / P99 / Max. (ms) | 0,250 / 0,306 / 0,709 | 0,237 / 0,277 / 0,536 | 0,226 / 0,271 / 0,347 | 0,229 / 0,441 / 0,716 | 1,379 / 1,447 / 1,581 |
| KI Ø / P95 / P99 (ms) | 0,248 / 0,277 / 0,302 | 0,235 / 0,269 / 0,274 | 0,224 / 0,263 / 0,268 | 0,227 / 0,307 / 0,436 | 1,376 / 1,425 / 1,442 |
| Navigation P95 (ms) | 0,246 | 0,240 | 0,234 | 0,277 | 1,389 |
| Steering / Nachbarabfrage, je P95 (ms) | 0,186 / 0,061 | 0,183 / 0,063 | 0,184 / 0,066 | 0,179 / 0,066 | 0,553 / 0,262 |
| Bewegung und Kollision P95 (ms) | 0,063 | 0,059 | 0,052 | 0,109 | 0,845 |
| Pfadprüfungen/s | 28 | 25 | 8 | 27 | 4.060 |
| Maximale Pfadprüfungen/Tick inkl. Warm-up | 144 | 144 | 144 | 144 | 144 |
| Neue Distanzfelder im Warm-up | 178 | 0 | 2 | 28 | 0 |
| Neue Stuck-Episoden im Messfenster | 1 | 15 | 0 | 142 | 17.539 |
| Rückkehr zu normaler Bewegung nach Recovery | 0 | 15 | 0 | 101 | 3.925 |
| Momentan bewegte Gegner, maximale Sekundensichtprobe | 6 | 3 | 0 | 56 | 488 |
| Zieloperatoren im Messfenster | 4 | 4 | 2 | 3 | 4 |
| Heap-Delta / RSS am Messende (MiB) | +1,11 / 140,06 | +2,04 / 132,02 | −1,06 / 142,52 | +2,80 / 136,93 | +4,89 / 152,19 |

KI-Zeit summiert Zielauswahl, Navigation, Nahkampf und Encounter pro Tick. Nachbarabfragen sind Teil der Steering-Zeit. Abfragen direkter Korridore zählen zu Pfadprüfungen. Bei bewegten Zielen wurden 8.654 Abfragen aufgeschoben. Die 17.539 Episoden und 13.547 Warteübergänge in diesem Szenario zählen wiederkehrende Ereignisse, weil Zielbewegung und freier Kontakt erneute Anläufe auslösen. Hier verursachen Bewegung und Kontakt den größten CPU-Anteil. Die 1.000er-Stufe auf echter Geometrie benötigte am Peak 0,288 ms für neue Felder in einem Warm-up-Tick. Der kalte 100er-Lauf derselben Matrix hatte einen einzelnen Peak von 4,311 ms. Der zusätzliche GC-Lauf der gesamten statischen Matrix registrierte 120 Scavenge-Ereignisse (7,13 ms summiert) und ein Mark-Compact (0,63 ms) inklusive Warm-up und Benchmark-Allokationen.

Der Extremtest lenkt alle Schaben auf einen einzigen 1,2 m breiten Durchlass durch eine lange Wand. Bei 100 / 250 / 500 / 1.000 Schaben waren am Ende 1 / 12 / 1 / 37 Schaben hinter der Wand. Die Horde beschädigte Operatoren in allen vier Größen. **Der Durchsatz am einzelnen schmalen Engpass ist weiterhin eingeschränkt.** Die übrigen Schaben können an der Zuführung über längere Zeit warten. Geringere Recovery-Kontaktabstände sowie längere Fortschrittsfenster wurden als Varianten gemessen, ergaben bei 1.000 Schaben in diesem Szenario weniger Durchgänge und höhere P95-Zeiten.

## Mission, Extraktion und Bandbreite

- Natürlicher Nestdruck auf FREEFALL erreichte 1.000 Schaben, 52 Gruppen und 10 Nester. Tick-P95 lag bei 0,756 ms, der Maximalwert bei 1,037 ms, je 1.800 Messticks nach 5.000 Ticks Warm-up.
- Der separate Ballon-Test hielt 1.000 Schaben in 2.825 von 2.850 Ticks. Tick-P95 lag bei 0,957 ms und das Maximum bei 1,539 ms. Vier Operatoren wurden extrahiert. Die Mission kehrte zum Carrier zurück.
- Das 1.000er-Hordenpaket belegt 10.006 B. Bei 10 Hz sind das 100.060 B/s je Client und 400.240 B/s für vier Clients als reine Horden-Nutzdaten. Mit Spieler-, Missions- und Ereignispaketen schätzte der natürliche FREEFALL-Lauf 155.029 B/s je Client vor Transport-Overhead.

## Browser und Replikation

Chromium 153.0.8010.12 mit SwiftShader, 1.280 × 720, je rund 16 s Messdauer und eine gerenderte Ansicht. In Boreal Relay kam mindestens ein SDK-Beobachter hinzu. Bei vier Operatoren liefen insgesamt drei weitere SDK-Verbindungen. Der Test registrierte null Browserfehler.

| Szenario | FPS | Frame P95 | Server-Tick P95 |
| --- | ---: | ---: | ---: |
| Skyfall Carrier, ohne Gegner | 21,8 | 83,3 ms | 0,053 ms |
| Dev’ Ault, ohne Gegner | 15,2 | 100,0 ms | 0,092 ms |
| Boreal Relay, 100 Schaben | 13,2 | 149,9 ms | 0,286 ms |
| Boreal Relay, 500 Schaben | 13,4 | 116,8 ms | 0,649 ms |
| Boreal Relay, 1.000 Schaben | 11,9 | 166,6 ms | 1,080 ms |
| Boreal Relay, 1.000 Schaben und vier Operatoren | 11,3 | 183,3 ms | 1,741 ms |

Im letzten Szenario traf alle 100,1 ms ein Hordenpaket ein. Die FPS erfassen den gesamten Softwarerenderer. Hardware-GPU, vier gleichzeitig gerenderte Ansichten und zusätzliche WAN-Latenz bleiben offen.

## Diagnose

F2 im lokalen Missions-Debugroom nutzt das bestehende Metrics-Paket mit 2 Hz. Es zeigt die letzten Subsystem-Zeiten, Pfadbudgets, Cache, Stuck und Recovery sowie bis zu vier Gegnerproben mit Ziel, Zustand, Wegpunkt, Abstands- und Lenkvektor und tatsächlichem Tempo. Proben und Zeitmessung sind im normalen Raum aus.

## 7.4C · Lastmatrix mit aktivem Nahkampf

Erfasst am 19. November 2026 auf AMD Ryzen 7 9700X, Linux x64 7.3.3-300.fc45, Node 24.18.0. Ausgangspunkt `4daf04e` mit dem bereits eingespielten 7.4B-Workspace. Kampfstand 7.4C mit Balance-Hash `20e1fe152b9b95a5`. Die 7.4B-Referenz für `distributed` und `mobile` lief vor der Implementierung auf demselben Rechner. Die CPU-Matrix verwendet je 360 Warm-up-Ticks und 1.800 Messticks bei 30 Hz, also 12 und 60 s virtuelle Spielzeit. Jeder Messpunkt hielt seine 100, 250, 500 oder 1.000 aktiven Gegner-IDs. Operator-HP wurden vor jedem Tick aufgefüllt. Navigationsbudgets und Stichproben der dekodierten Hordenframes wurden geprüft.

```sh
for scenario in distributed open concentrated corridor mobile; do
  npm run benchmark -- enemy-ai 1800 421337 matrix "$scenario"
done
npm run benchmark -- mission 1800 421337 4
PERF_COMBAT=1 ANGLE=swiftshader CHROMIUM_EXECUTABLE=/path/to/chromium PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
  node --conditions=development scripts/perf-browser.mjs /tmp/freefall-browser-perf.json
```

### Verteilt auf Bodenbruch-Geometrie

| Gegner / Operatoren | Tick P95 7.4B | Tick Ø / P95 / P99 / Max 7.4C | Kampf Ø / P95 / P99 | Kontaktprüfung P95 | Treffer/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 / 1 | 0,074 ms | 0,063 / 0,079 / 0,107 / 0,270 ms | 0,005 / 0,007 / 0,010 ms | 0,002 ms | 11,37 |
| 250 / 4 | 0,091 ms | 0,078 / 0,094 / 0,123 / 0,311 ms | 0,010 / 0,013 / 0,015 ms | 0,004 ms | 46,85 |
| 500 / 4 | 0,154 ms | 0,147 / 0,177 / 0,191 / 0,338 ms | 0,016 / 0,020 / 0,022 ms | 0,006 ms | 50,30 |
| 1.000 / 4 | 0,279 ms | 0,279 / 0,310 / 0,331 / 0,418 ms | 0,027 / 0,032 / 0,034 ms | 0,005 ms | 48,35 |

Die gesamte KI benötigte bei 1.000 verteilten Gegnern 0,276 / 0,306 / 0,329 ms (Ø / P95 / P99). Der Nahkampfwert enthält Entscheidungen, Phasenübergänge und Schadensbuchung. Die Kontaktzeit misst die körperliche Prüfung nach der groben Reichweitengrenze. Entscheidungen/s zählen jeden bereiten, gestaffelt betrachteten Gegner. Die meisten fallen vor dem Kontakt aus der Prüfung.

### Umgebungen und Druck

| Gegner | Frei, Tick P95 | Konzentriert, Tick P95 | 1,2-m-Durchlass, Tick P95 | Bewegte Operatoren, Tick P95 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 0,067 ms | 0,041 ms | 0,033 ms | 0,079 ms |
| 250 | 0,085 ms | 0,108 ms | 0,078 ms | 0,249 ms |
| 500 | 0,168 ms | 0,164 ms | 0,149 ms | 0,593 ms |
| 1.000 | 0,308 ms | 0,294 ms | 0,366 ms | 1,504 ms |

| Bei 1.000 Gegnern | Verteilt | Frei | Konzentriert | Durchlass | In Bewegung |
| --- | ---: | ---: | ---: | ---: | ---: |
| Startentscheidungen/s | 14.109 | 14.068 | 14.829 | 14.615 | 13.781 |
| Kontaktprüfungen/s | 117 | 139 | 18 | 50 | 603 |
| Begonnene Angriffe/s | 48,32 | 50,67 | 9,22 | 21,03 | 67,68 |
| Schadensereignisse/s | 48,35 | 50,63 | 9,22 | 20,95 | 29,47 |
| Spitze Active / Windup und Active zusammen | 10 / 28 | 11 / 29 | 4 / 7 | 6 / 14 | 16 / 36 |
| Horde-Nutzdaten pro Client (B/s) | 101.531 | 101.601 | 100.391 | 100.728 | 102.108 |
| Combat-Ereignisgröße als JSON-Schätzung (B/s) | 4.711 | 4.932 | 905 | 2.048 | 2.880 |
| RSS am Messende (MiB) | 157,04 | 125,25 | 123,12 | 139,16 | 133,55 |

Bei vier bewegten Operatoren und 1.000 Schaben lagen der Tick bei 1,459 / 1,504 / 1,532 ms (Ø / P95 / P99) und das Maximum bei 1,788 ms. Die gesamte KI lag bei 1,455 / 1,501 / 1,528 ms, der Nahkampf bei 0,032 / 0,035 / 0,037 ms und die Trefferprüfung bei 0,005 ms P95. Das Snapshot-Encoding lag bei 0,036 ms P95. Das Serverbudget beträgt 33,33 ms pro Tick. Die angegebene Bandbreite umfasst Horden- und separat geschätzte Ereignis-Nutzdaten vor Transport-Overhead. Das statische Hordenpaket lag in 7.4B bei 100.060 B/s pro Client. Für vier Clients sind im bewegten 7.4C-Lauf 408.432 B/s reine Hordendaten erforderlich. Spieler- und Missionsnachrichten kommen hinzu.

Die verteilte 1.000er-Kohorte buchte in 60 s **23.208 HP** (386,8 HP/s) gegenüber **22.552 HP** (375,9 HP/s) in 7.4B. Bei bewegten Spielern sank der Druck von **42.784 HP** (713,1 HP/s) auf **14.144 HP** (235,7 HP/s). Das ist rund ein Drittel der bisherigen Trefferlast in dieser Bewegungsroute. Ein früherer Soforttreffer kann nun durch Bewegung im Windup ausfallen. Die Referenz füllt die HP künstlich auf. Mittlere Überlebensdauer, Schwierigkeit unter Gegenfeuer und subjektive Lesbarkeit benötigen daher die Spielabnahme. Für 7.4C gelten weiterhin die registrierten Basiswerte für Schaden, Reichweite und Cooldown.

Am einzelnen 1,2-m-Durchlass standen nach der 1.000er-Messung 37 Gegner auf der Zielseite. Am konzentrierten Vierer-Startpunkt waren in den Stichproben zwei Operatoren tatsächlich Ziele. Im natürlichen FREEFALL-Sättigungstest erreichten 52 Gruppen und 10 Nester 1.000 Gegner (Tick-P95 0,776 ms, Max. 1,056 ms). Der separate Ballontest hielt 1.000 Gegner in 2.825 von 2.850 Ticks, extrahierte vier Operatoren und kehrte zum Carrier zurück (Tick-P95 0,957 ms, Max. 1,571 ms).

### Gerenderter Client

Produktionsbuild in Chromium 153.0.8010.12 mit SwiftShader, 1.280 × 720 und rund 16 s gemessener Spielzeit je Zeile. Eine Ansicht wurde gerendert. Die übrigen Verbindungen liefen als Colyseus-SDK-Clients. Im kleineren Arena-Lastprofil blieb ein SDK-Operator stationär und der Browser durchlief geskriptete Tastatur- und Mauseingaben. In der Vierer-Zeile bewegten sich die drei SDK-Operatoren zusätzlich. Der Harness füllte bei Bedarf HP auf, damit der Schwarm weiter angreifen konnte. Die Anzahl enthält tatsächlich serverseitig begonnene Angriffe und bestätigte Treffer für den ganzen Raum.

| Boreal Relay | Gegner | Angriffe / Treffer | FPS | Frame P95 | Server-Tick P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Browser + stationärer SDK-Operator | 100 | 142 / 98 | 13,1 | 133,3 ms | 0,310 ms |
| Browser + stationärer SDK-Operator | 250 | 248 / 201 | 14,7 | 116,7 ms | 0,361 ms |
| Browser + stationärer SDK-Operator | 500 | 246 / 203 | 13,3 | 133,4 ms | 0,614 ms |
| Browser + stationärer SDK-Operator | 1.000 | 346 / 229 | 9,4 | 199,9 ms | 1,233 ms |
| Browser + drei SDK-Operatoren | 1.000 | 718 / 32 | 11,2 | 166,6 ms | 1,799 ms |

Im größten Lauf kamen Hordenframes im Mittel alle 99,9 ms an. Der Browser-Lauf meldete null Browserfehler. Die angegebene Framezeit enthält die komplette SwiftShader-Darstellung. Hardware-GPU und vier gerenderte Perspektiven bleiben offen. F2 im lokalen Missions-Debugroom zeigt die letzten Zeitmessungen, Phasensummen, Raten und bis zu vier Angriffsstichproben. [Verifikation und verbleibende Spielabnahme](ENEMY_AI_PLAYTEST.md)

## 7.4D · Horde Director und Spawn-Last

Messung am 19. November 2026 unter Node 24.18.0, Linux x64 7.3.3-300.fc45 auf AMD Ryzen 7 9700X mit 16 logischen CPUs. Der Arbeitsstand verwendet Balance-Hash `1cb4016b3c807b53`. Gemessen wurde Bodenbruch im aktiven Einsatz bei 30 Hz. Eine Missionssekunde entspricht 30 Simulationsticks. Ein Tick hat 33,33 ms Zeitbudget.

```sh
npm run benchmark -- mission 1800 421337 4
npm run benchmark -- mission 1800 421337 4 director
npm run benchmark -- enemy-ai 1800 421337 matrix director
node --trace-gc --conditions=development apps/server/src/benchmark.ts enemy-ai 1800 421337 matrix director
```

### Konstante Population mit aktivem Director

Der Harness lädt echte Bodenbruch-Geometrie, aktive Kampf-KI und die vorhandenen Durchbruchsregionen. Pro Stufe hält er die angegebene Zahl über 360 Warm-up- und 1.800 Messticks. Das Test-Cap entspricht jeweils der geladenen Population. Für 100, 250 und 500 Gegner ist deshalb das FREEFALL-Cap im lokalen Fixture abgesenkt. Der 1.000er-Lauf verwendet den veröffentlichten Balance-Hash und das reguläre FREEFALL-Cap. Der Test überprüft konstante IDs und stichprobenweise dekodierte Horde-Frames. Er füllt die HP der Testoperatoren auf, damit Nahkampf durchgehend messbar bleibt.

| Aktive Gegner / Operatoren | Tick Ø / P95 / P99 / Max (ms) | Director Ø / P95 / P99 (ms) | Horde-Nutzdaten je Client | RSS bei Messende |
| --- | ---: | ---: | ---: | ---: |
| 100 / 1 | 0,060 / 0,076 / 0,099 / 0,183 | 0,0002 / 0,0007 / 0,0041 | 10.452 B/s | 110,25 MiB |
| 250 / 4 | 0,073 / 0,090 / 0,114 / 0,362 | 0,0004 / 0,0010 / 0,0045 | 26.514 B/s | 123,21 MiB |
| 500 / 4 | 0,136 / 0,167 / 0,187 / 0,357 | 0,0002 / 0,0015 / 0,0016 | 51.583 B/s | 145,46 MiB |
| 1.000 / 4 | 0,263 / 0,292 / 0,318 / 0,522 | 0,0003 / 0,0028 / 0,0029 | 101.441 B/s | 155,52 MiB |

Am vollen Cap wurden in allen vier Läufen **null** neue Kandidaten geprüft und keine Plätze reserviert. Die Bewegung samt Navigation war bei 1.000 Gegnern der größte CPU-Anteil (0,245 ms P95). Der Director sammelte Pressure weiter. Die erneute GC-Messung über alle vier Größen inklusive Warm-up und Harness erfasste 129 Scavenge-Ereignisse mit zusammen 14,77 ms sowie zwei Mark-Compact-Ereignisse mit zusammen 0,98 ms.

### Natürliche Spawns und Burst

- Die bestehende FREEFALL-Sättigung erreichte 1.000 Schaben, zehn Nester und 53 Gruppen. Der ungeprofilte Missionsbenchmark lag vor der Änderung bei 0,766 ms Tick-P95 und im abschließenden Lauf bei 0,745 ms. Maximalwerte in diesen Läufen waren 1,056 und 1,024 ms. Im neuen Lauf lag die Transport-Nutzdatenschätzung bei 154.177 B/s je Client inklusive Spielzustand und Missionsereignissen vor WebSocket-Overhead.
- In der profilierten dynamischen L2-Szene mit vier Operatoren, einem Nest und vorhandenen Bodenbruch-Regionen startete und endete eine Welle mit neun Schaben aus `breach/ridge-pass` und `breach/alpha-flank`. Einschließlich Nest prüfte der Manager in 60 s 35 Standorte, verwarf 16 und erzeugte 19 Schaben. Das entspricht 0,58 Prüfungen pro Sekunde. Die Spitze lag bei vier Prüfungen, einer Erzeugung und vier offenen Reservierungen. Der Director benötigte Ø/P95/P99/Max 0,0003/0,0002/0,0010/0,0767 ms je Tick. Prüfungstakte benötigten Ø/P95/P99/Max 0,0072/0,0156/0,0346/0,0346 ms. Initialisierung in Erzeugungsticks lag bei Ø 0,0002 ms und P95 0,0005 ms. Gesamt-Tick-P95 war 0,017 ms bei einem Maximum von 0,151 ms.
- In der profilierten L4-Szene mit fünf Nestern wurden 253 Standortprüfungen und 149 Erzeugungen gemessen. Die Kennzeichnung `checking ticks` bzw. `initializing ticks` im Benchmark bezieht sich auf Ticks mit tatsächlicher Prüfung bzw. Initialisierung. Bei gleichzeitiger Arbeit werden alle Zeiten des Subsystems in diesem Tick summiert. Die Prüfzeit ist bei Wellenspawns zugleich in der Director-Updatezeit enthalten.
- Der Ballon-Stresstest hielt 1.000 aktive Schaben in 2.834 von 2.850 Ticks. Vier Operatoren wurden extrahiert, anschließend kehrte die Mission zum Carrier zurück. Der separate ungeprofilte Lauf ergab 0,988 ms Tick-P95 und 1,571 ms Maximum. Der Harness platzierte Testoperatoren und füllte die Horde für diese feste Last nach. Der reine 1.000er-Horde-Frame belegte in diesem Lauf 10.006 B.

### Gerenderter Bodenbruch-Lauf

Chromium 153.0.8010.12 mit SwiftShader, 1.280 × 720, mittlere Grafikqualität, eine gerenderte Ansicht und drei Colyseus-SDK-Verbindungen. Der Browser zeigte den vorhandenen F2-Bereich mit dem neuen Director-Status, während der Server die erste Welle startete. Nach dem Auffüllen des Last-Fixtures lief der Raum rund 12,2 s mit vier Operatoren und 1.000 aktiven Gegnern. Die gemessene Bildrate lag bei **14,3 FPS**, Frame-P95 bei 133,3 ms und Server-Tick-P95 im letzten 4-s-Fenster bei 2,91 ms. Die gemessene Horde-Nutzlast lag bei etwa 100.224 B/s an einen SDK-Client bei 10,02 Paketen/s. Chromium meldete null Browserfehler. Hardware-GPU, vier gerenderte Perspektiven und WAN-Last mit 1.000 Gegnern bleiben **NOT TESTED**. [Reproduktion und Abnahme](HORDE_DIRECTOR_PLAYTEST.md)
## 7.4E · Messstand vom 20. November 2026

AMD Ryzen 7 9700X, 16 logische CPUs, Fedora Linux 45, Kernel 7.3.3-300.fc45.x86_64, Node 24.18.0, Arbeitsstand auf `4daf04e`, Balance `db47ff7931b5847c`. Der Server rechnet mit 30 Hz und 33,33 ms pro Tick. Alle CPU-Szenarien verwenden Seed 421337, 360 Warm-up-Ticks und 1.800 gemessene Ticks, entsprechend 12 und 60 virtuellen Sekunden.

```sh
for profile in distributed open concentrated corridor mobile director; do
  npm run benchmark -- enemy-ai 1800 421337 matrix "$profile"
done
npm run benchmark -- mission 1800 421337 4 director
node --trace-gc-nvp --conditions=development apps/server/src/benchmark.ts mission 18000 421337 4 director
node --cpu-prof --cpu-prof-dir=/tmp --conditions=development apps/server/src/benchmark.ts enemy-ai 5400 421337 matrix mobile
```

Die feste Kohorte hält dieselben Entity-IDs durchgehend aktiv. Der Harness füllt HP auf und überprüft Bewegungsfortschritt, gegnerischen Nahkampf, gültige Positionen, Slots, Routenbudgets und dekodierte Frames. Das Profil `director` montiert bei kleineren Kohorten einen lokal abgesenkten Cap und verwendet bei 1.000 die reguläre FREEFALL-Konfiguration. Die separate Missionsmessung prüft natürliche Spawns inklusive Nester und hält die realen Balance-Limits ein.

### Server-Tick-P95 in Millisekunden

| Bodenbruch-Profil | 0 / 1 OP | 100 / 1 OP | 250 / 4 OP | 500 / 4 OP | 1.000 / 4 OP |
| --- | ---: | ---: | ---: | ---: | ---: |
| Verteilte Operatoren, Originalgeometrie | 0,003 | 0,081 | 0,093 | 0,184 | 0,314 |
| Freies Gelände | 0,003 | 0,066 | 0,082 | 0,168 | 0,309 |
| Konzentration um den Trupp | 0,003 | 0,041 | 0,083 | 0,163 | 0,296 |
| 1,2-m-Durchlass | 0,003 | 0,034 | 0,078 | 0,150 | 0,361 |
| Vier bewegte Operatoren | 0,004 | 0,078 | 0,241 | 0,586 | 1,472 |
| Originalgeometrie mit Director | 0,003 | 0,077 | 0,091 | 0,173 | 0,300 |

Bei vier bewegten Operatoren und 1.000 Schaben betrugen Tick-Ø/P99/Max 1,431/1,501/2,829 ms. Die KI lag bei 1,469 ms P95, Navigation bei 1,414 ms und darin Nachbarn bei 0,253 ms sowie Bewegungskollision bei 0,821 ms. Der Nahkampf lag bei 0,037 ms P95, die Trefferprüfung bei rund 0,005 ms P95. Die fünf statischen 1.000er-Profile lagen bei 0,319–0,481 ms Tick-P99. Das reine Hordenpaket transportierte rund 100.391–102.108 B/s je Client vor WebSocket-Overhead. Im verteilten Profil erreichte die KI alle vier Zielslots. Am Durchlass standen nach Warm-up und Messung 37 Gegner auf der Zielseite. Der Durchsatz bei Gegenwehr ist offen.

### Gemessene Optimierung

Das CPU-Profil mit 5.400 Messticks meldete 5.248 V8-Self-Samples in `UniformGrid.contactFraction` und 2.049 in `nearby`. Die quadratische Kontaktprüfung erhielt einen Achsentest auf Bewegungsstrecke plus Kontaktradius. Die Grenze gilt für den aktuellen Kandidatenmittelpunkt. Nachbarschaftsauswahl und bestehende Kontaktauflösung bleiben erhalten.

| 1.000 Schaben und vier bewegte Operatoren | Vorher P95 in ms | Nachher P95 in ms |
| --- | --- | --- |
| Tick, drei Wiederholungen | 1,517 / 1,523 / 1,541 | 1,474 / 1,487 / 1,471 |
| Kollision, drei Wiederholungen | 0,857 / 0,850 / 0,881 | 0,814 / 0,823 / 0,811 |

Der Median des Tick-P95 sank um 3,2 %, der Median des Kollisions-P95 um 5,0 %. Das sequenzielle A/B-Profil variierte nur den Achsentest. Alle sechs Läufe buchten 1.768 Operator-Treffer und 14.144 HP. Die Navigationsregressionen prüfen geknickte Engstellen, Separation an Deckung und Terrainrändern sowie Recovery. Historische 7.4A–D-Messungen stehen oben. 7.1 und 7.3E enthalten Arena- und Movement-Profile mit anderen Waffen-, KI- oder Renderingpfaden. Der A/B-Lauf liefert den belastbaren Direktvergleich für diese Änderung.

### Natürliche Last, Erzeugung und Speicher

- FREEFALL erreichte mit 53 Gruppen und zehn Nestern 1.000 Schaben in allen 1.800 Messticks. Tick-Ø/P95/P99/Max betrugen 0,734/0,773/0,957/1,186 ms. Die Schätzung lag bei 154.177 B/s je Client inklusive Spiel- und Missionsnachrichten vor Transport-Overhead. Die entsprechende Ausgangsmessung auf dem eingespielten 7.4D-Stand lag bei 0,812 ms Tick-P95. Aus dem Einzelvergleich folgt keine zusätzliche Leistungszusage.
- Die dynamische L2-Welle lieferte neun Schaben aus zwei Regionen. Mit Nest prüfte der Manager 35 Kandidaten und erzeugte 19 Schaben. Spitzenwerte waren vier Standortprüfungen, eine Erzeugung und vier reservierte Plätze je Tick. Director-P95 lag bei 0,0002 ms, Standortprüfung in Prüfticks bei 0,0166 ms und Initialisierung in Erzeugungsticks bei 0,0003 ms. Die L4-Probe mit fünf Nestern prüfte 253 Kandidaten und erzeugte 149 Gegner, bis zu vier pro Tick.
- Die beschleunigte Ballonextraktion hielt in 2.834 von 2.850 Ticks 1.000 Schaben, extrahierte vier Operatoren und räumte beim Carrier-Reset alle Slots. Tick-P95 lag bei 0,979 ms und das Maximum bei 1,543 ms.
- Der Soak mit 18.000 Messticks hielt die natürlichen 1.000 Schaben über zehn virtuelle Minuten. Tick-P95/P99/Max betrugen 0,793/0,843/1,129 ms. Der Heap änderte sich zwischen Warm-up-Ende und Messende um +0,59 MiB. Der Prozess endete bei 166,46 MiB RSS im Sättigungsprofil. Die gesamte Benchmarkserie zeichnete 937 Scavenge-Pausen mit zusammen 32,1 ms und zwei Mark-Compact-Pausen mit zusammen 1,3 ms auf. Ein mehrstündiger Multi-Room-Soak mit Reconnects und Post-GC-Proben steht aus.

### Kampfdaten bei 1.000 aktiven Gegnern

| Profil | Angriffsstarts/s | Operator-Treffer/min | Trefferquote vollständiger Angriffsfenster | HP-Schaden/min | Max. Windup + Active |
| --- | ---: | ---: | ---: | ---: | ---: |
| Originalgeometrie, verteilt und stationär | 48,32 | 2.901 | 100 % | 23.208 | 28 |
| Konzentration | 9,22 | 553 | 100 % | 4.424 | 7 |
| Bewegte Operatoren | 67,68 | 1.768 | 43,4 % | 14.144 | 36 |

Die Trefferquote verwendet nur während der Messung begonnene Angriffe auf Operatoren, deren Active-Fenster bis Messende vollständig verstrich. Der Harness gleicht die Schadenssumme mit der autoritativen HP-Differenz ab. In der bewegten Probe entgingen Operatoren einem Teil der während des Windups gebundenen Schläge. Die HP des Trupps werden für die Vergleichbarkeit aufgefüllt. Todesrate, durchschnittliche Gefechtsdauer und Stim-Bedarf unter regulärer Gegenwehr bleiben Gegenstand der Spielabnahme.

### Gerenderte Bodenbruch-Last

Chromium 153.0.8010.12, SwiftShader, 1.280 × 720 pro Ansicht, Medium, 12,2 beziehungsweise 12,4 s Wandzeit. Beide Läufe gingen von einer regulär validierten Welle im lokalen Debugraum aus. Der Harness füllte die Lastkohorte mit Seed 421337 auf 1.000 auf. Für das konstante Messfenster erhielten die Operatoren Schutz und die Convicts hielten ihr Feuer zurück. Jeder Browser zeigte 1.000 aktive Gegner an. Alle im Messfenster beobachteten Horde-Frames enthielten 1.000 Gegner. Die Servertick-Perzentile beziehen sich auf die letzten vier Sekunden. Jede Konfiguration meldete null Browserfehler und null verworfene Serverschritte.

| Vier Verbindungen | FPS je gerenderter Ansicht | Frame-P95 / P99 | Server-Tick-P95 / P99 | Horde-Nutzdaten pro Client |
| --- | ---: | ---: | ---: | ---: |
| Ein Browser und drei SDK-Peers | 14,73 | 133,3 / 133,4 ms | 2,383 / 4,891 ms | 100.388 B/s empfangen |
| Vier Browser auf demselben Host | 3,77–3,78 | 283,3–283,4 / 283,4 ms | 3,153 / 5,426 ms | 100.021 B/s vom Server veröffentlicht |

Der erste Anlauf mit vier Browsern fiel durch Convict-Gegenfeuer auf 992 Schaben. Die Tabelle verwendet den anschließend bestandenen Festlastlauf. Die gemeinsam genutzte Softwaredarstellung belastete denselben Host wie der Server.

Dasselbe Szenario lief mit je rund 60 s Messzeit auf einer AMD Radeon RX 9070 XT. Chromium meldete ANGLE mit radeonsi gfx1201 ACO und OpenGL ES 3.2. Beide Profile liefen mit 1.000 Gegnern, null verworfenen Steps und null Browserfehlern.

| Radeon RX 9070 XT, 1.280 × 720 Medium | FPS je gerenderter Ansicht | Frame-P95 / P99 | Server-Tick-P95 / P99 | Horde-Nutzdaten pro Client |
| --- | ---: | ---: | ---: | ---: |
| Ein Browser und drei SDK-Peers | 60,00 | 16,7 / 16,8 ms | 1,277 / 1,324 ms | 100.010 B/s empfangen |
| Vier Browser auf demselben Host | 60,00 | 16,7–16,8 / 16,8 ms | 1,270 / 1,353 ms | 99.997 B/s vom Server veröffentlicht |

Vier getrennte Zielgeräte, weitere Grafikprofile und der Empfang am WAN-Transport stehen aus. [Browser-Harness und Netzwerkprofile](MULTIPLAYER_HORDE_STRESS_TEST.md)

### Budgetvorschläge und Abnahme

Die Vorschläge aus 7.3E bleiben Referenz bis zur Freigabe. Server-Tick P95 ≤ 8 ms und P99 ≤ 16 ms, Frame-P95 ≤ 20 ms und P99 ≤ 33,3 ms auf Ziel-GPU in 1.280 × 720 Medium, Node-RSS ≤ 256 MiB und ≤ 180 KiB/s Empfang je Client. Für die KI schlagen wir innerhalb des Serverbudgets P95 ≤ 4 ms bei bewegter Horde vor. Für Spawnarbeit schlagen wir zusammen ≤ 1 ms P95 der tatsächlich prüfenden und initialisierenden Ticks vor. CPU und GPU, Netzwerk am Transport und Heap über wiederholte Missionswechsel separat messen. Gate G erfordert Zielhardware und Budgetfreigabe. [Vorliegende 7.3E-Vorschläge](PERFORMANCE_BENCHMARK_7_3.md) · [Release-Gates](MILESTONE_7_4_FINAL_ACCEPTANCE.md)
