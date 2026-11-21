# FREEFALL 7.8E · Performance und Ressourcen

Gemessen am 21. November 2026 auf Ryzen 7 9700X, Fedora 45, Node 24.18.0 und Chromium 153.0.8010.12. Die Softwareläufe verwenden ANGLE/Vulkan mit SwiftShader bei 800 × 450 und Medium. Der separate native Lauf verwendet die Radeon RX 9070 XT mit ANGLE/OpenGL ES 3.2. Die Lastproben in der Matrix nutzten Wald, Ground Mist, Morgendämmerung, Welt-Seed 76, Missions-Seed 0, Relaisverteidigung und Schwierigkeit FREEFALL. Auf den lokalen Produktionsbuild folgten persistente WebSocket-Verbindungen. Ein Browser renderte, die übrigen Operatoren wurden über das reale Colyseus-SDK gesteuert.

## Vorher und nachher

Die 10-Sekunden-Läufe nutzten die damalige identische Fixture und die gleiche 160-ms-Verzögerung für Blast-Batches. Der Ausgangsbuild stammt aus dem lokalen Arbeitsbaum vor den Änderungen für 7.8E. Er enthielt die laufenden Änderungen aus 7.8A–D auf Basis von `4daf04e`. Der Commit allein bezeichnet daher nicht den vollständigen Ausgangsbuild. In dieser Fixture werden Director-Spawns und Convict-Feuer während der künstlichen Laststufen unterdrückt. Gegnerbewegung, Waffen, Trefferprüfung, Wetter und Audio laufen. Beide Proben starteten mit 1.000 aktiven Schaben, endeten mit 987 und lieferten sechs Detonationen.

| Messwert | Vor 7.8E | Nach Combat-/HUD-Integration |
| --- | ---: | ---: |
| FPS Ø | 18,38 | 18,68 |
| Frame P95 / P99 | 116,7 / 183,3 ms | 116,6 / 150,0 ms |
| CPU / GPU im letzten F2-Fenster | 4,7 / 48,8 ms | 4,3 / 50,2 ms |
| Server P95 / P99, Intervallstichproben | 3,064 / 5,104 ms | 2,944 / 4,720 ms |
| Server-Ticks / verworfene Steps | 311 / 0 | 310 / 0 |

Die 0,30 FPS Differenz stammt aus je einem Lauf. Der Unterschied direkt an der Bildrate ist klein. In den vergleichbaren F2-Fenstern blieb die GPU-Zeit deutlich über der synchronen CPU-Framearbeit. Die CPU-Arbeit in 7.8E reduziert vor allem identische Marker-/Lampenupdates und vermeidet Nachrichten-Serialisierung bei geschlossenem F2-HUD.

## Lastmatrix

Die Stichprobe dauert 4,5 s für die Stufen bis 750 und 30 s für das erste kombinierte Maximum. Die Messung der neueren Proben erfasst die Laufzeit jedes ausgeführten Simulationsticks und die darin aktive Population. Für die abschließende 250er-, 500er- und 750er-Matrix wartete der Harness vor dem nächsten Lauf ausstehende Granaten ab. Dadurch startete jede Stufe bei exakt ihrer Zielpopulation. Der kombinierte Lauf lässt nach den Oberflächen-Fixtures SpawnManager/Horde Director und Convict-Feuer wieder regulär laufen. Test-Fixtures setzen Positionen, Startpopulation, Munition und anfänglichen Schutz. Der gerenderte Operator wird während der Probe verwundbar. Die Nestmeldung wird durch die vorhandene lokale Debug-Aktion mit autoritativem Missionsereignis ausgelöst.

| Ziel | Operatoren | Aktive Schaben Min–Max | FPS Ø | Frame Median / P95 / P99 in ms | Tick P95 / P99 in ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1 | 0–0 | 20,15 | 33,3 / 133,4 / 233,3 | 0,506 / 1,218 |
| 100 | 1 | 96–100 | 21,18 | 49,9 / 100,0 / 150,0 | 0,487 / 2,353 |
| 250 | 4 | 240–250 | 19,93 | 33,3 / 150,0 / 166,6 | 1,949 / 5,218 |
| 500 | 4 | 489–500 | 19,27 | 50,0 / 116,6 / 166,7 | 1,062 / 2,294 |
| 750 | 4 | 733–750 | 16,93 | 50,0 / 116,7 / 300,0 | 1,182 / 1,422 |
| 1.000 | 4 | 987–1.000 | 19,80 | 49,9 / 116,7 / 150,1 | 1,938 / 3,799 |

Der erste kombinierte 30-s-Lauf hielt die Zielpopulation in **288 von 909 instrumentierten Ticks**. Insgesamt liefen einschließlich Browser-Setup und Cleanup 914 Ticks. Kein Step wurde verworfen. Es gab 969 Schüsse inklusive Convicts, sechs Detonationen, eine Nahkampfaktion, einen Schadenspfeil und eine bestätigte Nestmeldung.

Im zweiten gezielten 30-s-Lauf bestätigte der Server **22 Schabentreffer des Browser-Operators**. Im HUD wurde ein Hitmarker beobachtet. Die Operatoren feuerten 67, 208, 212 und 212 Schüsse; gemeinsam mit den Convicts waren es 817. Hinzu kamen sechs Detonationen, zwei gleichzeitige Schadenspfeile und die Nestmeldung. Der Browser-Operator fiel im Gefecht aus. Der Server hielt 1.000 aktive Schaben in 4 von 906 instrumentierten Ticks; die Population fiel auf 917. Der Lauf erreichte 18,89 FPS, 116,6/133,4 ms Frame-P95/P99, 2,448/4,420 ms Tick-P95/P99 und null verworfene Schritte. Die höhere Trefferfrequenz zeigt den Populationsverlust im aktiven Gefecht. [Gezielter 30-s-Waldlauf](playtest/7-8e/max-final/report.json)

## Nativer Waldlauf

Bei **1.280 × 720 Medium** lief dieselbe 30-s-Zielprobe auf der **Radeon RX 9070 XT mit 60,0 FPS Ø**, Frame-Median 16,7 ms und P95/P99 jeweils 16,8 ms. Die vier Operatoren feuerten 68, 205, 209 und 209 Schüsse. Der gerenderte Operator erzielte 25 serverbestätigte Schabentreffer und sichtbare Hitmarker. Sechs Detonationen, Schadensrichtung, Wald-Soundscape und Nestmeldung liefen im Messfenster. Der Browser-Operator fiel im Verlauf aus. Die Last lag zwischen 910 und 1.000 Schaben, mit voller Population in 3 von 902 Ticks. Die Server-Ticks lagen bei P95/P99 1,144/1,618 ms, ohne verworfene Schritte. Die letzte F2-Stichprobe zeigte 1,4 ms CPU, 0,1 ms GPU, 15 Audiostimmen in der Fensterspitze und 0 Audiofehler. [Native Messwerte](playtest/7-8e/native/report.json)

Ein zweiter nativer Lauf renderte **vier Chromium-Sichten gleichzeitig**. Die Messung bei 1.280 × 720 Medium, Wald-Seed 63, Missions-Seed 0 und 30,04 s hielt 1.000 serverseitig simulierte Schaben in der festen Testpopulation durchgehend. 954 Schaben der Fixture bewegten sich. Der Server registrierte 1.216 Angriffsstarts gegen Operatoren. Alle vier Browser lagen bei 60,0 FPS Ø und 16,8 ms Frame-P99. Das letzte Server-Tickfenster lag bei P95/P99 1,060/1,131 ms und meldete null verworfene Schritte. Auf den vier Perspektiven lagen die Spitzen bei 15/14/14/10 Stimmen ohne Verwerfungen. Dem Lastfenster folgten Reconnect während eines Windups, Wetter-Wiederherstellung, Reconnect während Nachschub und während Ballon-Countdown sowie vier bestätigte Extraktionen. Diese Kapazitätsprobe hält die Population per Fixture ohne Operatorfeuer und ergänzt den gezielten nativen Feuerlauf. [Vier native Perspektiven](playtest/7-8e/native-coop/forest.txt)

Der kontrolliert nachgefüllte **1080p-Medium-Lauf** nutzte Wald-Seed 76 und Mission-Seed 0. Er hielt 1.000 aktive Schaben in **899 von 901** Messticks, in zwei Ticks waren 999 aktiv. Der Harness ließ 105 regulär validierte Ersatzgegner zu und zählte sie erst als aktive Instanzen. Gegner-KI, Horde Director, Schaden, Waldwetter, Audio und alle Präsentationspfade liefen weiter. Alle vier Operatoren feuerten. Der lokale Browser zeigte bestätigtes Trefferfeedback mit 25 Schabentreffern und erfasste zwei Schadenspfeile sowie die Nestmeldung. Der Browser-Operator fiel im Verlauf aus. Gemessen wurden 60,0 FPS Ø, jeweils 16,8 ms Frame-P95/P99, 1,258/1,693 ms Tick-P95/P99 und keine verworfenen Server-Steps. Es gab sechs bestätigte Explosionen, einen Nahkampfschwung und null Audiofehler. Ein Browser renderte, die übrigen drei Operatoren wurden über das SDK per WebSocket gesteuert. [Kontrolliertes 1080p-Maximum](playtest/7-8e/native-steady/report.json)

## Effekt-, Audio- und Speichergrenzen

| Ressource | Konfiguriertes Limit | Beobachtung im ersten kombinierten Lauf |
| --- | --- | --- |
| Medium-Waffen-VFX | 10 Blitze, 36 Tracer, 16 Hülsen, kein Lauflicht | Die zulässigen Pools melden aktive Plätze und kosmetische Kürzungen über F2. High verwendet ein zusätzliches Lauflicht. |
| Medium-Impact-VFX | 36 Impact-Slots und 288 Partikel im GPU-Puffer | Die Oberflächenproben prüften neun Kontaktkombinationen mit getrenntem Audio und VFX. |
| Medium-Explosions-VFX | 8 Blast-Slots, je 4 Rauch, 4 Staub, 8 Splitter; 1 Licht | Spitze 3 Blasts, 12 Rauch, 12 Staub, 24 Splitter und 1 Licht; letzte Stichprobe vollständig geräumt. |
| Wetter | 64 / 176 / 320 Partikel für Low / Medium / High | Der Wald nutzte Ground Mist. Bodennebel nutzt den Atmosphärenpfad und kann mit 0 Wetterpunkten aktiv sein. |
| Audio | 28 Stimmen gesamt, 4 je Besitzer, priorisierte Reserven und 80 MiB PCM-Cache | Letztes F2-Fenster mit Spitze 20, 357 kumulierte Verwerfungen, 75,1 MiB PCM; 0 Audiofehler. Längste gemeldete Dekodierung 745 ms. |
| Netzlast | F2 schätzt übertragene Anwendungsdaten | Letztes F2-Fenster ca. 94,76 kB/s; WebSocket-/TCP-Overhead ist darin nicht enthalten. |
| Speicher | CDP JS-Heap und Node-Prozess-RSS getrennt | JS-Heap 22,53 → 26,46 MiB; RSS des lokalen Server-/Harness-/Vite-Prozesses 758,42 → 808,57 MiB. Three.js meldete am Ende 202 Geometrien und 52 Texturen. |

F2 schätzt das Alter beim Eintreffen des letzten Schusses, Action- und Missionsevents relativ zum letzten Spielersnapshot. Im letzten Fenster des ersten Max-Laufs lauteten die Werte 0 / 19 / 4 ms bei 137 ms gemessener Wartezeit auf Posenabgleich. Das Alter hat eine gemeinsame Snapshot-Zeitbasis und liefert keine absolute Einweg-Netzwerklatenz. Die Queue-Wartezeit wird auf der Uhr des Browsers gemessen.

Der bekannte Server-Schrittrahmen beträgt **33,33 ms**. Die Messung des ersten kombinierten Laufs lag selbst beim Maximum von **14,714 ms** darunter. Der native 1080p-Lauf erreicht den Vorschlag von rund 60 FPS im Mittel und Frame-P95 ≤ 20 ms für Medium auf dieser GPU. Ein freigegebenes Client-Budget wurde im Projekt für diese Kombination nicht dokumentiert. VRAM in Bytes, GPU-Ressourcen über mehrere Planetwechsel, ein längerer Heap-/GC-Verlauf und die subjektive Soundscape-Balance verbleiben offen.

## Server-Langlauf

`npm run benchmark -- enemy-ai 36000 77 4 director` lief mit vier Operatoren, Seed 77 und 36.000 Messticks je Stufe. Das sind 20 Minuten Simulationszeit je Stufe. Die feste Bodenbruch-Kohorte hielt 1.000 tatsächlich simulierte Gegner in allen 36.000 Ticks. Der Benchmark prüft die Population pro Tick und den autoritativen HP-Verlust. Bei 1.000 lagen Tick-P95/P99/Maximum bei 0,316/0,460/4,126 ms, gemessen mit 58.086 Schabentreffern an Operatoren, 325,19 MiB RSS am Ende und −17,04 MiB Heap-Differenz. Diese Serverprobe verwendet eine feste Population und deckt die clientseitige Waldpräsentation sowie Gegnernachschub unter Operatorenfeuer nicht ab. [Server-Langlauf](playtest/7-8e/server-soak.txt)

[Vorher](playtest/7-8e/before/report.json) · [Nachher](playtest/7-8e/after/report.json) · [Solo-Matrix](playtest/7-8e/solo/report.json) · [Vier-Operatoren-Matrix](playtest/7-8e/forest-matrix/report.json) · [Erster 30-s-Waldlauf](playtest/7-8e/max/report.json)
