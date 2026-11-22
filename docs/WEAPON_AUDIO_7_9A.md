# FREEFALL 7.9A.1 · Waffenaufnahmen und Abnahme

7.9A.1 integriert 13 neue Waffen-Master, jeweils in Ogg Vorbis und MP3. Die beiden Operatorwaffen und die bestehenden Convict-Kestrel-Varianten nutzen diese Bank. Die Ausführung basiert auf Commit `ffc8191` und Balance-Hash `01855759529dd588`. Weitere Details über Waffenwerte, Fire-Mode, Reload und Ausgangszustand stehen im [Ausgangsinventar](WEAPON_AUDIO_INVENTORY_7_9A.md).

## Aufnahmen und Zuordnung

| Asset-ID | Waffe und Cue | Original und Bearbeitung |
| --- | --- | --- |
| `kestrel-shot-1` | Kestrel und Convicts, nah | `D_31.wav`, AR-15-Nahaufnahme, Take 1 |
| `kestrel-shot-2` | Kestrel und Convicts, nah | `D_30.wav`, AR-15, Mikrofone rechts vom Schützen |
| `kestrel-shot-distant` | Kestrel und Convicts, entfernt | `D_23.wav`, AR-15, rechtes Distanzmikrofon |
| `kestrel-mag-out` | Bestätigte Magazin-Entnahme | `D_5.wav`, geladenes Magazin abziehen |
| `kestrel-mag-in` | Bestätigte Magazin-Insertion | `D_4.wav`, geladenes Magazin einsetzen |
| `kestrel-reload-finish` | Bestätigter Kestrel-Reload-Abschluss | `D_13.wav`, Verschluss freigeben |
| `p01-shot-1` | P-01, nah | `X_39.wav`, Walther PPQ, Take 1 am rechten Mikrofon |
| `p01-shot-2` | P-01, nah | `X_39.wav`, Take 2 am linken Mikrofon, drei isolierte Vollpeaks bearbeitet |
| `p01-shot-distant` | P-01, entfernt | `X_31.wav`, zweiter Take des rechten Fernmikrofons |
| `p01-mag-out` | Bestätigte Magazin-Entnahme | `X_5.wav`, geladenes Magazin abziehen |
| `p01-mag-in-slide` | Bestätigte Insertion und gezeichneter Schlittenrücklauf | `X_4.wav` und `X_17.wav`, kurze Insertion mit anschließendem Schlitten |
| `weapon-switch-foley` | Waffenwechsel beider Slots | LFA, ein Equipment-Transient aus `equipmentclicks.wav` |
| `weapon-casing-hard` | Gelegentlicher Kontakt lokaler Kestrel-Hülsen auf hartem Boden | rubberduck, Ausschnitt aus `metal_falling_02.ogg` als Foley |

Alle Dateien wurden am **21. November 2026** gegen die Quelllizenz geprüft. Die Schüsse und Waffenmechanik wurden von **Ben Jaszczak, Brian Nelson, Kevin Heras und Matthew Nanney** aufgenommen. Die geprüfte CC0-Veröffentlichung und der dateiweise verwendete Spiegel dokumentieren dieselbe Bibliothek. Der Spiegel ist im Manifest auf Commit `beb2f4041f3d6740fa0aeaf0e71159bd65a78c1b` gepinnt. Jede heruntergeladene Datei wurde mit ihrem Git-Blob-Hash verglichen. [Quellveröffentlichung](https://opengameart.org/content/the-free-firearm-sound-library) · [Katalog des Spiegels](https://github.com/buddingmonkey/FreeFirearmsSFXLibrary/tree/beb2f4041f3d6740fa0aeaf0e71159bd65a78c1b) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

Equipment-Foley von **LFA** und Metall-Foley von **rubberduck** stammen aus ihren eigenen öffentlichen CC0-Paketen. CC0 1.0 erlaubt Bearbeitung und kommerzielle Weitergabe. Namensnennung ist freiwillig und wird hier erbracht. [Equipment Clicks II](https://opengameart.org/content/equipment-clicks-ii) · [100 CC0 metal and wood SFX](https://opengameart.org/content/100-cc0-metal-and-wood-sfx)

Zusätzlich geprüft wurden die kommerziell nutzbaren GDC-Bundles von Sonniss mit Lizenz 2.0 und Einschränkungen bei eigenständiger Weitergabe, mehrere einzeln als CC0 markierte Freesound-Kandidaten mit Konto für den Originaldownload sowie Kenneys CC0-Foley. Die ausgewählte Bank verwendet die drei oben genannten Veröffentlichungen. Assetkosten **0 €**. [Sonniss-Lizenz](https://sonniss.com/gdc-bundle-license/) · [Freesound-Kandidatenbeispiel](https://freesound.org/people/Nox_Sound/sounds/490309/) · [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)

### Bearbeitung und Reproduktion

Die Manifeste halten Originaltitel, Urheber, konkrete Quell-URL, Quelldatei, Auswahl des Mikrofonkanals, Schnittfenster, Filter, Gain und SHA-256-Werte der Originale und Runtime-Dateien fest. Die Originale bleiben außerhalb des Repositorys. Kurze Mono-Ausschnitte mit erhaltenen Transienten, Ausblendung und mindestens 6 dB Spitzenreserve vor Codec-Kompression teilen sich den bestehenden PCM-Cache. [Quellmanifest](audio-sources.json) · [Master-Manifest](audio-masters.json) · [Laufzeitdateien](../apps/client/public/audio/)

```sh
python3 scripts/prepare-audio.py /pfad/zu/originalaufnahmen --weapons
```

## Abdeckungsmatrix

| Aktion | Kestrel AR-01 | P-01 Dienstpistole |
| --- | --- | --- |
| Schuss und mechanischer Impuls | Zwei Nah-Takes, ein getrenntes Distanzsample | Zwei Nah-Takes, ein getrenntes Distanzsample |
| Gehaltener Abzug | Kurze Einzelsamples zum bestehenden 10-Schuss/s-Takt | Kurze Einzelsamples zum bestehenden 4-Schuss/s-Takt |
| Reload, taktisch und leer | Bestätigte Entnahme, Insertion, Abschluss | Bestätigte Entnahme, Insertion mit Schlitten |
| Separater Bolt-/Charging-Handle-Befehl | NOT APPLICABLE | NOT APPLICABLE |
| Dry Fire ohne Reserve | NOT APPLICABLE, kein bestätigtes Dry-Fire-Ereignis | NOT APPLICABLE, kein bestätigtes Dry-Fire-Ereignis |
| Waffenwechsel | Bestätigtes Equipment-Foley | Bestätigtes Equipment-Foley |
| Lokale und Remote-Wiedergabe | Vorhersage und Bestätigung, Remote-Mündung und Tiefe | Vorhersage und Bestätigung, Remote-Mündung und Tiefe |
| Hülse | Leises lokales Kontakt-Foley auf harten Oberflächen | NOT APPLICABLE, ursprünglich ohne eigenen Hülsenton |

## Umsetzung im Repository

| Dateien | Änderung |
| --- | --- |
| [WeaponAudio.ts](../apps/client/src/audio/WeaponAudio.ts), [WeaponAudioCatalog.ts](../apps/client/src/audio/WeaponAudioCatalog.ts) | Kurze Aufnahmen, Distanzüberblendung, begrenzte Laufzeit, planetare Reflexion, bestätigte Handhabung und Freigabe gespielter Audioquellen. |
| [AudioAssets.ts](../apps/client/src/audio/AudioAssets.ts), [AudioEngine.ts](../apps/client/src/audio/AudioEngine.ts) | Waffenbank bleibt innerhalb des bestehenden PCM-Limits abrufbar. Dekodieren kann nach der Nutzergeste anlaufen, während der AudioContext noch startet. |
| [Game.ts](../apps/client/src/game/Game.ts), [App.tsx](../apps/client/src/ui/App.tsx) | Anschluss an Vorhersage, Remote-Pose und autoritative Spieler-Snapshots. F2 zählt Wiedergaben und fehlende Puffer. |
| [Audio-Pipeline](../scripts/prepare-audio.py), [Quellmanifest](audio-sources.json), [Master-Manifest](audio-masters.json), [Runtime-Dateien](../apps/client/public/audio/) | Reproduzierbare Schnitte und Quellnachweise für 26 neue Runtime-Dateien. |
| [Regressionen](../apps/client/test/weapon-audio.test.ts), [Missionsbrowser](../scripts/playtest-weapon-audio.mjs), [Arena-Browser](../scripts/playtest-weapon-vfx.mjs) | Katalog, Stimmenbudget und Cache, bestätigte Handhabung, Browser-Audio, Planetenmatrix und bestehende Kampfpfade. |

Die Browserprüfung deckte zwei Integrationsfehler auf. Das Laden der Planetenatmosphäre verdrängte bereits dekodierte Waffensamples. Außerdem kodiert der Server den Übergang zu `READY` im gewöhnlichen Snapshot als `reloadUntil = 0` ohne Reload-Objekt. Die finale Integration behält die kleine Waffenbank im Cache und wertet die bestehende Abschlusskodierung aus.

## Technische Prüfungen

```sh
npm run typecheck
npm run build
npm test
npm run balance:check
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256
git diff --check

export PLAYWRIGHT_MODULE=/home/edgar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/home/edgar/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
FREEFALL_BROWSER_ANGLE=gl node --conditions=development scripts/playtest-weapon-audio.mjs
FREEFALL_BROWSER_ANGLE=gl FREEFALL_WEAPON_AUDIO_PLANET=forest node --conditions=development scripts/playtest-weapon-audio.mjs
ANGLE=gl FREEFALL_HIT_ACCEPTANCE=1 node --conditions=development scripts/playtest-weapon-vfx.mjs
FREEFALL_AUDIO_FORMATS=1 node --conditions=development scripts/playtest-audio.mjs
```

- **Suite:** 345 bestanden, 0 fehlgeschlagen, 0 übersprungen. Darunter WebSocket-Tests mit vier Clients und 140 ms simulierter RTT. Typecheck und Produktionsbuild erfolgreich. Vite meldete die bestehende Warnung zur Hauptbundle-Größe. Balance-Hash `01855759529dd588`, acht Gameplay-Fingerabdrücke und drei Schaben-Prüfsummen bestätigt.
- **Missionsbrowser:** Grüne Ebene/Solo, Wüste/2, Eis/3 und Wald/4 mit Missions-Seed `0` und Welt-Seeds `76/31/48/63`. Lokale Wiedergabe mit um 160 ms verzögerten Bestätigungen, Remote-Schüsse mit vertauschter Reihenfolge und Duplikaten, taktischer und leerer Reload, Vollmagazin-Ablehnung, leerer Abzug ohne Reserve und Abbruch beim Wechsel geprüft. Ein Browser spielte die Mischung ab. Die übrigen Operatoren sendeten Eingaben über echte SDK-WebSockets. Im Wald lief Reconnect mit anschließendem Suspend/Resume und null Stimmen im suspendierten Zustand.
- **Arena-Browser:** Kestrel im Stand und in der Hocke, P-01 im Stand, in Bauch- und Rückenlage nach einem Dive. Beide Bodenlagen spielten genau eine Magazin-Entnahme und eine Insertion pro geprüftem Reload. Vier Operatoren feuerten bei 1.000 aktiven Schaben zu Anfang und Ende der Arena-Stichprobe. Treffer-, Kill-, Friendly-Fire- und Deduplizierungsregressionen liefen mit.
- **Codecs:** Chromium dekodierte alle 150 Audio-Dateien, darunter alle 26 neuen Waffen-Dateien. Die höchste dekodierte Waffenspitze war 0,577 des Vollpegels. Die 13 Ogg-Waffenpuffer belegten zusammen 0,445 MiB PCM. Die ausgelieferten Waffen-Dateien umfassen 106.847 Bytes für beide Codecs.

### Leistungsstichproben

Chromium 153.0.8010.12 mit ANGLE/OpenGL ES auf Ryzen 7 9700X und Radeon RX 9070 XT. Ein gerenderter Client bei 960 × 540, Medium, lokaler Server. [Rohdaten der Browser- und Codec-Läufe](playtest/7-9a1/results.json)

| Messung | Wald mit Nebel, Wetter, vier feuernden Operatoren | Boreal Relay, vier feuernde Operatoren |
| --- | --- | --- |
| Umfang | 2,6 s Audio-/Framefenster, mindestens 443 aktive Schaben im Instrumentierungsfenster | 2,3 s Feuerfenster, 1.000 aktive Schaben zu Anfang und Ende |
| Schüsse | 104 bestätigt, 104 Waffen-Wiedergaben | 90 bestätigt |
| Framezeit P95 / P99 | 16,7 / 16,8 ms, im vorherigen 1-s-Idlefenster 16,8 / 16,8 ms | 16,7 / 16,8 ms |
| Server-Schritt P95 / P99 | 1,16 / 1,32 ms | NOT TESTED in dieser Browserprobe |
| Audiomix | Spitze 15/28 Stimmen. Sechs Budget-Verwerfungen im Gesamtmix. Acht Schaben-Windups und acht Impacts. | Siehe F2-Stichprobe im Rohdatensatz |
| Ressourcen | 133 Buffer-Source-Erzeugungen im gesamten Kampf-Mix. PCM 72,62 MiB vor Feuer, 73,18 danach, 75,52 nach Reconnect. 0 Lade-/Dekodierfehler und 0 Vollpegelsamples im gemessenen Output. | Cleanup von Hülsen, Lauflicht und Tracern geprüft |

## Release-Gates 7.9A.1

| Gate | Status | Nachweis |
| --- | --- | --- |
| A1-G1 Waffeninventar | PASS | Beide Slots, Convict-Feuerpfad, Ereignisse und Zeitpunkte inventarisiert. |
| A1-G2 Lizenz | PASS | CC0 1.0 für jede verwendete Quelle, Quellpfade und Hashes dokumentiert, €0. |
| A1-G3 Aufnahmen | PASS | Schüsse, Distanz und unterstützte Handhabung aus der aufgenommenen Samplebank. Alle Assets decodiert. |
| A1-G4 Timing | PASS | Bestätigte Handhabung, Normal-/Taktik-/Leer-Reload, Unterbrechung, Ablehnung, Bodenlagen und geordnete Wiedergabe geprüft. |
| A1-G5 Multiplayer-Audio | PASS | 1–4 Operatoren, verzögerte lokale Bestätigung, umsortierte Remote-Schüsse, Duplikate und Reconnect. |
| A1-G6 Räumlichkeit und Planeten | PASS | Alle vier Planeten im Missionsbrowser mit Waffenbank, Soundscape und Wetter. Distanzaufnahme und Laufzeitbudget separat getestet. |
| A1-G7 Audio-Performance | PASS | Begrenzte Stimmen, Cache-Verdrängung und Freigabe regressionsgeprüft. Vierer-Waldprobe, Arena-Last und natives Suspend/Resume gemessen. |
| A1-G8 Gameplay | PASS | Vollständige Regression, gleiche serverseitige Balance und Gameplay-Fingerabdrücke. |

Offen bleiben die subjektive Hörabnahme, längere Sessions mit mehreren gerenderten Hörperspektiven und die tatsächliche Ausführung auf Firefox/WebKit mit der neuen Waffenbank. Der kombinierte 1.000-Schaben-Waldeinsatz mit vollständiger 7.9E-Last ist ein späteres Gate.

## Manueller Hörtest

Status **NOT TESTED**. Für die Hörabnahme aus Operatorperspektive prüfen:

1. Einzelschüsse beider Waffen im direkten A/B-Vergleich. Realismus, Unterscheidbarkeit, Attacke und Bass auf Kopfhörern und kleinen Lautsprechern beurteilen.
2. Mehrere volle Kestrel-Magazine in kurzen Salven und am Stück. Auf Wiederholung, Pegelsprünge, harte Schnitte und den Ausklang beim Loslassen achten.
3. Leeren und taktischen Reload, anschließend unterbrochenen Reload und Waffenwechsel anhören. Magazin- und Schlittenmomente mit der Pose vergleichen.
4. Lokale Schützen, nahe und entfernte Mitspieler auf allen vier Planeten vergleichen. Lokalisierung, Wind, Reflexionen und Verständlichkeit der Schaben-Telegraphen beurteilen.
5. Vier Operatoren während Schwarmangriff, Explosion und Missionsmeldung abhören. Überdeckung, Clipping, Stimmenverlust und auffällige Cues beim Reconnect vermerken.
