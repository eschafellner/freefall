# Audio-Performance 7.7D

## Messmethode

Die Browserlast verwendet Chromium 153.0.8010.12, Low, 720 × 450. Die Vier-Client-Fixture setzt exakt 250, 500 und 1.000 aktive Gegner bei weiterlaufender KI. Der Einzelclient-Lauf verwendet die Legacy-Mission mit null Gegnern. Die F2-Zähler pro Client lesen den lokalen Audiographen. Die Szenen-FPS und Server-Tickzeiten messen das gesamte Spiel. `Audio CPU` misst den Audio-Kontrollpfad auf dem Client und `Horde-Spitze` die längste Stichprobe der Horde-Auswahl im Verlauf. Die Audiothread-CPU ist separat offen.

## Native Radeon-Matrix

Chromium 153.0.8010.12 nutzte die Radeon RX 9070 XT über ANGLE OpenGL ES 3.2. Wald-Seed 76, Mission Seed 77, `forest-calm`, Low, 720 × 450, vier Chromium-Clients. Je Laststufe wurden rund fünf Sekunden aus dem laufenden Spiel erfasst.

| Operatoren / Gegner | Langsamster Client | Spitzenstimmen je Client in F2 | PCM-Cache max. | Audio-Kontrollpfad, größter F2-Mittelwert | Server-Tick P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 / 250 | 60,0 FPS | 5 | 73,45 MiB | 0,034 ms | 0,73 ms |
| 4 / 500 | 60,0 FPS | 6 | 73,45 MiB | 0,034 ms | 0,95 ms |
| 4 / 1.000 | 60,0 FPS | 6 | 73,45 MiB | 0,027 ms | 1,46 ms |

Die Horde-Auswahl erreichte in der nativen Messung bis zu 0,70 ms. Die maximale Ladezeit lag bei 190 ms, die maximale Dekodierzeit bei 246 ms. Alle Clients blieben beim 60-Hz-Limit. Es gab null verworfene Server-Steps und null Audiofehler.

## SwiftShader-Matrix

| Operatoren / Gegner | Spitzenstimmen je Client in F2 | PCM-Cache max. | Audio-Kontrollpfad, größter F2-Mittelwert | FPS Host | Server-Tick P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / 0 | 3 | 67,8 MiB | 0,04 ms | 30,2 | 0,37 ms |
| 4 / 250 | 5 | 73,4 MiB | 0,15 ms | 5,3 | 0,66 ms |
| 4 / 500 | 6 | 73,4 MiB | 0,20 ms | 4,7 | 0,89 ms |
| 4 / 1.000 | 4 | 75,1 MiB | 0,20 ms | 2,7 | 1,16 ms |

In allen Lastfenstern gab es null verworfene Server-Steps und null Audiofehler. Die F2-Spitze der Horde-Auswahl lag im 1.000er-Lauf über alle Ansichten bei 8,1 ms. Die kürzeren F2-Mittelwerte und die langsame GPU-Darstellung messen verschiedene Pfade. Vier Software-Renderer auf einem Rechner sind ein Engpass. Die niedrigen Gesamt-FPS werden getrennt von der Audio-Stimmenprüfung geführt.

Der Lauf mit 1.000 gleichzeitigen dekorativen Audioanforderungen hielt die Stimmenzahl unter 28 und konnte darüber ein Missionssignal aufnehmen. Gemessen wurden 23 aktive Stimmen und 978 verworfene Anfragen. Ein Unit-Test befüllt alle reservierten Plätze, begrenzt Stimmen pro Besitzer und prüft die Rückgabe der Plätze nach Ablauf. Zusätzlich prüft die Horde-Fixture 250, 500 und 1.000 gleichzeitig ausgelöste Angriffsphasen.

## Speicher und Ladepfad

Der Client lädt lokal über HTTP und dekodiert geteilt pro Audio-ID. Der LRU-Cache hält bis zu 80 MiB PCM pro Context. Ausklingende, bereits referenzierte Puffer können bis zum Ende ihrer Überblendung zusätzlich von ihren Audio-Nodes gehalten werden. Cache, Nodes und Context werden beim Dispose abgeräumt. Die Paketgröße aller 124 Dateien beträgt etwa 23 MiB. Zur Laufzeit werden nur die aktuell verwendeten Samples in ihrer primären Kodierung angefordert. Der Test erzwang einmal ein fehlendes Ogg und bestätigte die MP3-Ausweichdatei.

In der SwiftShader-Matrix betrugen die höchsten gemessenen Lade- und Dekodierzeiten 2.620 bzw. 437 ms pro Asset. Im separaten, parallel laufenden Reconnect-Test waren einzelne Spitzen höher. Das Spiel nutzt gepufferte Loops. Die Zahl gestreamter Soundquellen beträgt null. Der 20–30-minütige Speichersoak bleibt offen.

```bash
export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/pfad/zu/chromium
export FREEFALL_BROWSER_AUDIO=1 FREEFALL_BROWSER_LOAD_ONLY=1
export FREEFALL_BROWSER_ANGLE=gl
FREEFALL_OPERATORS=1 FREEFALL_BROWSER_ENEMIES=0 \
  node --conditions=development scripts/playtest-horde-director.mjs
FREEFALL_OPERATORS=4 FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ENEMIES=250,500,1000 \
  FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=76 FREEFALL_GENERATED_SEED=77 FREEFALL_WEATHER=forest-calm \
  node --conditions=development scripts/playtest-horde-director.mjs
```

## Native Koop-Messung 7.7E

Vier unabhängige Web-Audio-Kontexte bei 1.280 × 720, `medium`, Wald 63, Missions-Seed 0, `dawn`, `ground-mist` auf Radeon RX 9070 XT. Die Horden-Audio- und Spielmetriken wurden über den tatsächlichen Clientpfad gelesen. Der Cachegrenzwert gilt für dekodierte PCM-Dateien im LRU, inklusive beider Soundscape-Layer. Der Audiothread, eviktierte und von laufenden Stimmen gehaltene Buffers, Impulsantworten und übrige Browser-Allokationen sind darin nicht enthalten.

| Gegner / Operatoren | Höchster F2-Spitzenwert | Max. PCM-Cache | Höchste mittlere Audio-Kontrollpfadzeit pro F2-Intervall | Autoritative Operator-Angriffsstarts im Sample |
| --- | ---: | ---: | ---: | ---: |
| 250 / 4 | 11 / 28 | 73,98 MiB | 0,093 ms | 321 |
| 500 / 4 | 9 / 28 | 73,98 MiB | 0,047 ms | 569 |
| 1.000 / 4 | 10 / 28 | 73,98 MiB | 0,047 ms | 581 |

Die Schätzwerte sind F2-Stichproben um die Messfenster; die Audio-Spitze wird im Spiel in kurzen Fenstern zurückgesetzt. Die höchste Horde-Scan-Stichprobe lag bei 9,0 ms, die maximale Dekodierung bei 602 ms und bis zu vier räumliche Stimmen je Client wurden im 1.000er-Lauf nach dem Messfenster beobachtet. Die registrierten Kontext- und Ladefehler blieben bei null. Der Reconnect brachte alle Views wieder auf zwei planetare Layer. Ausgangspegel, Dateidekodierung und laufende Hörabnahme stehen im separaten Audiobericht. [Rohdaten](playtest/7-7e/performance.json) · [Audioabnahme](MILESTONE_7_7_AUDIO_ACCEPTANCE.md)

### Stereo-Ausgang unter hoher Gegnerlast

In einer zusätzlichen 15-s-Probe im Wald mit `windy-forest` erfasste ein Stereo-Tap hinter dem Master-Kompressor je vier Clients 300–301 überlappende PCM-Fenster. Die vier gemessenen Peaks lagen bei 0,827, 0,811, 0,796 und 0,764 FS. RMS lag bei 0,144, 0,148, 0,158 und 0,072 FS. Es wurde in keinem dieser Fenster ein Sample bei oder über Vollaussteuerung erfasst. Die Messung erfasst PCM des Spielgraphen vor dem Audiogerät und beschreibt diesen Lastfall. `FREEFALL_BROWSER_AUDIO_METER=1` beim Vier-Client-Test mit `FREEFALL_WEATHER=windy-forest` aktiviert das Messfenster. [Messdaten](playtest/7-7e/additional-measurements.json)

Der 20-Minuten-Browser-Soak hielt bei realen Waldwetterwechseln konstant zwei Soundscape-Layer und 73,06 MiB PCM-Cache. 20 Minutenstichproben erfassten 3–4 Gesamtstimmen und null Audiofehler. Der Belastungstest mit 1.000 Schaben und der Solo-Soak messen unterschiedliche Einsatzbedingungen. [Soak-Stichproben](playtest/7-7e/browser-soak.json)
