# Performance

## Headless-Messung vom 17. November 2026

```bash
npm run benchmark -- 1800 421337
```

Gemessen mit **Node.js 24.18.0** auf **AMD Ryzen 7 9700X** mit 8 Kernen und 16 verfügbaren logischen CPUs unter Linux **7.3.3-300.fc45.x86_64**. Der CPU-Governor meldete `performance`.

Pro Szenario laufen zunächst 360 Aufwärmticks und danach 1.800 Messticks. Vier deterministisch gesteuerte Spieler bewegen sich und feuern mit gleicher Eingabefolge pro Szenario. Gemessen werden die Echtzeitdauer von `Arena.step()` und separat die Binärkodierung bei jedem dritten Tick. Die Simulation rechnet so schnell wie möglich mit einer festen virtuellen Schrittweite von 1/30 Sekunde. Eingaben werden vor Beginn der Tickzeitmessung eingesetzt. Colyseus, Sockets, Browser und GPU sind außerhalb dieser Messung.

| Ziel | Aktiv im Peak | Tick Ø (ms) | Tick P95 (ms) | Tick max (ms) | Snapshot-Encoding P95 (ms) | Max. Nutzdaten pro Frame (B) | Abschüsse |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0,001 | 0,001 | 0,132 | 0,001 | 6 | 0 |
| 100 | 100 | 0,011 | 0,016 | 0,101 | 0,003 | 1.006 | 135 |
| 250 | 250 | 0,032 | 0,036 | 0,120 | 0,005 | 2.506 | 111 |
| 500 | 500 | 0,082 | 0,094 | 0,566 | 0,010 | 5.006 | 43 |
| 1.000 | 1.000 | 0,206 | 0,233 | 0,280 | 0,019 | 10.006 | 33 |

Das Zeitbudget bei 30 Hz beträgt 33,33 ms pro Schritt. Der Headless-Lauf misst die Kosten einer Arena bei diesem Szenario. Für die Kapazität eines Hosts sind eigene Messungen mit echten Verbindungen, Netzwerk und mehreren parallelen Rooms erforderlich.

## Bandbreite und Live-HUD

10.006 Bytes pro Hordenframe ergeben bei 10 Hz und voller Horde **100.060 B/s pro Client** bzw. **400.240 B/s für vier Clients** allein für die Horden-Nutzdaten. Dazu kommen Spieler, Eingaben, Events und Transport-Overhead. Die Live-Anzeige zählt die Horden-Nutzdaten und schätzt die Größe sonstiger Anwendungsnachrichten. Ping misst die Colyseus-Roundtrip-Zeit.

Server-Tickdauer im HUD misst nur `Arena.step()`. Mittelwert und P95 verwenden die letzten vier Simulationssekunden. Tickrate misst ausgeführte Schritte pro Wandzeit. Die Framezeit im HUD ist der Zeitraum pro gerendertem Frame im letzten Messfenster. Die Renderwerte hängen von der Hardware, Blickrichtung, Browserlast und Pixeldichte ab.

## Grenzen für weitere Messungen

- Vollständige Snapshots auf einem zuverlässigen WebSocket sind der größte feste Netzwerkposten. Verlust oder ein langsamer Empfänger kann spätere Nachrichten verzögern. Bei größeren Karten oder vielen Rooms sollten Warteschlangen und räumliche Relevanz zuerst profiliert werden.
- Das Grid begrenzt die Arbeit in dichten Zellen. Das kann bei extremen Ballungen zu sichtbaren Überlappungen führen. Die Arena verwendet weiche Separation.
- Jeder Trefferstrahl prüft die aktiven Gegner. Für zusätzliche Schnellfeuerwaffen oder mehr Spieler lohnt ein Vergleich mit einer Grid-Strahlabfrage.
- Auf dem Client verursacht Instancing pro Frame Puffer-Updates für sichtbare Gegner. Zielhardware und Browser müssen für DPR, Antialiasing und LOD separat gemessen werden.
- Der Client-Build liefert rund 970 kB JavaScript bzw. 268 kB gzip. Vite meldet den JavaScript-Chunk oberhalb seines 500-kB-Schwellenwerts.

## Milestone 3

Der Vorher-Stand wurde vor der ersten Quelländerung separat kopiert. Beide Versionen wurden auf derselben Maschine ausgewertet. Die Testarena verwendet weiterhin 30 Hz Simulation, 20 Hz Spielersnapshots und 10 Hz Hordenframes.

### Server

```bash
npm run benchmark -- 5400 421337 1 burst
npm run benchmark -- 5400 421337 4 burst
```

Node.js 24.18.0, AMD Ryzen 7 9700X, Linux 7.3.3-300.fc45.x86_64. Drei Läufe je Stand und Spielerzahl, abwechselnd Vorher und Nachher. Je Lauf und Hordengröße 360 Aufwärmticks und 5.400 Messticks. Beide Stände nutzen denselben Benchmark-Treiber. Er feuert eine Sekunde und lässt drei Sekunden Pause, inklusive einem Reload-Input an den neuen Server. Dadurch bleiben Schuss- und Abschusszahlen in den verglichenen Szenarien identisch. Die Zahlen sind Mediane der drei Läufe. Die Messung enthält Arena-Step und Horden-Encoding separat.

| Spieler | Gegner im Peak | Tick Ø vorher → nachher | Tick P95 vorher → nachher | Encoding P95 vorher → nachher | Hordenframe | Schüsse / Abschüsse |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | <0,001 → <0,001 ms | 0,001 → 0,001 ms | <0,001 → <0,001 ms | 6 B | 450 / 0 |
| 1 | 1.000 | 0,196 → 0,197 ms | 0,235 → 0,234 ms | 0,019 → 0,019 ms | 10.006 B | 189 / 7 |
| 4 | 1.000 | 0,206 → 0,206 ms | 0,231 → 0,229 ms | 0,020 → 0,018 ms | 10.006 B | 848 / 18 |

Die serverseitigen Unterschiede liegen im Bereich der Streuung dieser Läufe. Die Binärgröße der Horde bleibt gleich. Die Spielerpakete tragen zusätzlich Pitch, Statusbits, Munition und Reload-Endtick. Das HUD schätzt diese Anwendungsdaten bei voller Belegung mit rund 2,8 kB/s zusätzlichem Snapshot-Verkehr pro Client. Die Animationsauswertung sendet keine zusätzlichen Nachrichten.

### Client-Rendering

Chromium 153.0.8010.12, WebGL 2 über ANGLE OpenGL ES, AMD Radeon RX 9070 XT. Medium bei 1.280 × 720 CSS-Pixeln, DPR 1, Renderpuffer 1.152 × 648. Gleiche Kameraführung, Gegnerpositionen und Spieler-Renderpositionen in einer Szene, Seed 421337. Pro Zeile zwei Durchläufe je Stand (Vorher, Nachher, Nachher, Vorher) mit 34 Aufwärm- und 75 Messframes. Die CPU-Spalte erfasst die synchrone Dauer von `ArenaView.draw()`, die GPU-Spalte den Mittelwert periodischer WebGL-Timer-Abfragen während des Messfensters. Die Tabelle zeigt die Mediane der Durchläufe. Die FPS lagen am 60-Hz-Takt des Testbrowsers.

| Spieler | Gegner aktiv | Sichtbar | FPS vorher → nachher | Frame P95 (ms) | CPU Ø (ms) | GPU Ø (ms) | Draw Calls | Dreiecke |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 0 | 60,0 → 60,0 | 16,7 → 16,8 | 0,395 → 0,535 | 0,125 → 0,128 | 41 → 53 | 75.646 → 75.238 |
| 1 | 1.000 | 407 | 60,0 → 60,0 | 16,8 → 16,8 | 0,488 → 0,711 | 0,146 → 0,152 | 44 → 56 | 147.314 → 146.906 |
| 4 | 1.000 | 408 | 60,0 → 60,0 | 16,8 → 16,8 | 0,520 → 0,685 | 0,157 → 0,161 | 53 → 59 | 166.000 → 164.368 |

Die animierten Rigs erhöhen den CPU-Aufwand. Instancing fasst Geometrien mit gleichem Material über die vier Rigs zusammen. Bei vier sichtbaren Spielern sank die Zahl gegenüber dem Zwischenstand vor dieser Optimierung von 125 auf 59 Draw Calls. Die Horden-Instanzen behalten ihren eigenen Renderpfad. In Chromium mit SwiftShader bei 864 × 486 sanken die gemessenen FPS bei vier Spielern und 1.000 Gegnern von 12,35 auf 12,12. Diese Softwaremessung zeigt den langsameren Renderpfad auf demselben Rechner.

Der Produktionsbuild wurde separat mit vier verbundenen WebGL-Clients geprüft. Alle empfingen den gemeinsamen Raumzustand mit 1.000 autoritativen Gegnern und zeichneten sichtbare Gegner. Der Browser-Test prüfte Pointer Lock, Eingaben, Feuer, manuelles Nachladen und die wieder gefüllte Munitionsanzeige. Der automatisierte Koop-Test prüfte zusätzlich Snapshot-Gleichheit, replizierten Sprint, Aim, Schuss und Reload, die Abweisung des fünften Clients und die Host-Übergabe. Die Vite-Größenwarnung bleibt für den Hauptchunk von etwa 1,12 MB (316 kB gzip) bestehen.

## Milestone 4 · Operation Bodenbruch

### Reproduzierbarer Server-Benchmark

```bash
npm run benchmark -- mission 1800 421337 4
npm run benchmark -- 1800 421337 4
```

Gemessen am 18. November 2026 mit Node.js 24.18.0, AMD Ryzen 7 9700X und Linux 7.3.3-300.fc45.x86_64. Je Profil liefen vier Spieler mit deterministischen Eingaben und 1.800 gemessene virtuelle Ticks. Die Aufwärmphase reichte von 360 Ticks bis 5.000 Ticks für die Sättigung. Kontrollierte Verstärkungsanforderungen erzeugten die Lastprofile für Nester und Durchbrüche. Die Spieler blieben für die Messung geschützt. Die Tickzeit erfasst den Simulationsstep. Die Bandbreitenschätzung kombiniert binäre Horden-Nutzdaten mit JSON-Größen der übrigen Anwendungspakete.

| Profil | Gegner Peak | Gruppen Peak | Nester Peak | Durchbrüche aktiv Peak / gesamt | Tick Ø / P95 (ms) | Horde-Encoding P95 (ms) | Ausgang ≈ B/s je Client |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Leerer Einsatz | 0 | 0 | 0 | 0 / 0 | 0,001 / 0,002 | 0,001 | 15.106 |
| Leicht, nur Patrouillen | 18 | 5 | 0 | 0 / 0 | 0,010 / 0,024 | 0,002 | 16.925 |
| Leicht, Durchbruch | 27 | 8 | 2 | 1 / 1 | 0,011 / 0,019 | 0,001 | 19.439 |
| Schwer, mehrere Nester | 339 | 31 | 5 | 0 / 4 | 0,074 / 0,123 | 0,007 | 49.998 |
| FREEFALL, Sättigung | 1.000 | 51 | 10 | 0 / 9 | 0,246 / 0,255 | 0,018 | 125.134 |

Der Arena-Regressionslauf erreichte 1.000 Aktive mit 0,240 ms P95 und einem maximalen Hordenframe von 10.006 Bytes. Die Missionsprofile zeichnen Server-Ticks auf. Die WebSocket- und Renderlast wurde separat im Browserlauf gemessen.

### Live-Browser und WebSocket

Ein gerenderter Produktionsclient mit Chromium 153.0.8010.12 und WebGL 2 über ANGLE OpenGL ES auf einer AMD Radeon RX 9070 XT. Profil Medium, 960 × 640 CSS-Pixel, DPR 1, etwa 864 × 576 Renderpixel. Pro Zeile wurde über rund 3,4 Sekunden mit Telemetrie-Stichproben gemessen. Die Bildrate lag an der 60-Hz-Grenze des Browsers. Der Lastlauf verwendete vier echte WebSocket-Verbindungen, davon einen Browser und drei SDK-Clients. Kontrollierte Spielerpositionen und ein beschleunigter Simulationsvorlauf stellten reproduzierbare Lastphasen her.

| Profil | FPS / Draw Calls (Median) | Gegner sichtbar zuletzt / aktiv Peak | Gruppen / Nester Peak | Durchbrüche aktiv Peak / gesamt | Live-Tick Ø / P95 (ms) | WebSocket Eingang / Ausgang (B/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Missionslobby | 60 / 37 | 0 / 0 | 0 / 0 | 0 / 0 | 0,01 / 0,01 | 5.753 / 2.654 |
| Leicht, Patrouillen und vorplatziertes Nest | 60 / 31 | 0 / 25 | 6 / 1 | 0 / 0 | 0,08 / 0,11 | 9.009 / 2.693 |
| Leicht, aktiver Durchbruch | 60 / 44 | 25 / 25 | 6 / 2 | 1 / 1 | 0,06 / 0,09 | 9.881 / 2.699 |
| Schwer, mehrere Nester | 60 / 39 | 252 / 343 | 33 / 5 | 0 / 4 | 0,17 / 0,21 | 43.826 / 2.669 |
| FREEFALL, vier Clients | 60 / 41 | 523 / 1.000 | 53 / 10 | 0 / 9 | 0,41 / 0,51 | 121.247 / 2.670 |

Der Netzwerkdurchsatz zählt tatsächliche WebSocket-Payloads des rendernden Clients ohne IP/TCP- und WebSocket-Header. Ein separater SwiftShader-Lauf auf derselben Maschine erreichte bei vier Verbindungen und 1.000 Aktiven mit etwa 540 sichtbaren Schaben 14 Median-FPS, 41 Draw Calls und 0,66 ms Server-P95. Diese Stichproben decken die jeweilige Blickrichtung, den Loopback-Room und die getestete Hardware ab. Ein WAN-Test und Messungen auf schwächerer Hardware mit echtem GPU-Rendering stehen aus.

Der Browser-Smoke-Test prüfte die sieben Lobby-Optionen, Pointer Lock, die beiden **E**-Interaktionen, Countdown, Dropship, Erfolgsanzeige und den Wechsel zurück in die Arena mit 1.000 Gegnern. Der automatisierte Lauf durch Normal verwendet normale Bewegung, echte Kollisionsabfragen und autoritative Interaktionen über den gesamten Weg. Die Koop-Regression prüft Hostrechte, Netzwerkereignisse, den synchronen Nest-Snapshot bei spätem Beitritt und die Raumgrenze.

## Milestone 5 am 18. November 2026

Die neue Messung wurde mit Node.js 24.18.0 auf einem AMD Ryzen 7 9700X durchgeführt.

```bash
npm run benchmark -- mission 1800 421337 4
```

| Szenario | Peak Gegner | Mittel / P95 / Max pro Simulationsschritt | Horden-Payload |
| --- | --- | --- | --- |
| FREEFALL, Sättigung im Feld | 1.000 | 0,354 / 0,365 / 0,438 ms | 10.006 B am Cap |
| FREEFALL, Ballon über 2.850 Ticks | 1.000 | 0,377 / 0,405 / 0,944 ms | Ø 10.006 B pro Hordenframe |

Im zweiten Lauf durchlief derselbe Room-Simulationszustand Carrier, Boarding, alle Flugphasen, beide echten Relaisinteraktionen, die 90-Sekunden-Ballonwartezeit, den Jägeranflug, die Extraktion von vier Operatoren und die Rückkehr. Der Treiber setzt die Operatoren an die Interaktionspositionen, schützt sie für die Messung und füllt die Horden mit Patrouillenmitgliedern aus gültigen Regionen auf. In 2.822 von 2.850 Extraktionsticks lag die Hordenpopulation nach dem Tick bei genau 1.000. Ein voller Hordenframe enthält 10.006 B bei 10 Hz, rund 100 kB/s pro Client für diesen Kanal ohne WebSocket-Overhead. Der gesonderte Sättigungslauf schätzte 137 kB/s pro Client für den gemischten Nutzdatenstrom anhand von binären Hordenframes und JSON-Größen für weitere Nachrichten. Die Tickmessung umfasst ausschließlich die Simulation.

Der Vier-Client-Test verwendet echte Colyseus-Verbindungen auf Loopback. Er prüft Hostrechte, gemeinsame Auswahl, identische Ereignisse, Entity-Identitäten, den Ballonsnapshot nach Reconnect und Beitritt nach gemeinsamer Rückkehr. Der integrierte Normal-Test nutzt reguläre Bewegung und beide Relaisinteraktionen bis zur Rückkehr. Die Browserprüfung nutzt Chromium mit SwiftShader. Das ist Software-Rendering und dient der Funktionsprüfung. Eine Messserie auf Ziel-GPUs und unter WAN-Bedingungen steht aus.

Im Browser-Smoke-Test am finalen Build war Medium bei 1.280 × 800 CSS-Pixeln und DPR 1 aktiv. Chromium 153 mit SwiftShader erreichte im Carrier-Messfenster einen Median von 16 FPS bei 87 Draw Calls. Während der Ballonverteidigung waren es 13 FPS bei 33 Draw Calls und 586 Gegnern am Ende des Messfensters. Nach Auffüllen auf 1.000 Gegner waren es 13 FPS bei 34 Draw Calls und 998 Gegnern am Ende des Fensters. Die Position der Testkamera bestimmte, wie viele Gegner sichtbar waren. Die Messfenster dauerten rund zwei bis drei Sekunden.
