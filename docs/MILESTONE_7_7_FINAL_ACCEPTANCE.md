# FREEFALL · 7.7E Integrations- und Abnahmebericht

**Abnahme offen.** Vier prozedurale Planeten erreichten im regulären Browserclient ein erfolgreiches `MissionResult`. Die Waldprobe mit vier gerenderten und vertonten Clients hielt 1.000 aktive, serverseitig simulierte Schaben. Menschliche Hörabnahme und die Freigabe der Zielhardware-Budgets sind offene Release-Bedingungen.

## Build und Prüfstand

- 21. November 2026, Version `0.1.0`, Arbeitskopie auf `4daf04e` mit den vorhandenen, noch nicht separat eingecheckten 7.7A–D-Arbeiten und den nachstehenden 7.7E-Änderungen. Die frühen 7.7E-Leistungsmessungen entstanden vor der Firefox-Korrektur. Die vier geprüften Referenz-Welt-IDs und weitere 84 v1-Welt-IDs sind identisch. Ein 1.000er-Lauf wurde auf dem finalen Stand wiederholt. Balance `01855759529dd588`, Mission-/Weltgenerator v1, Wetter v1. Produktionsbundle `index-D-3lvDYc.js`, SHA-256 `aca075f518c87e14ed1b975b0bf54d597b963c13b38d1a0b1a25f4fbb1d3d013`.
- Node `24.18.0`, Linux `7.3.3-300.fc45`, Ryzen 7 9700X, 16 logische CPUs, rund 62,4 GiB RAM, Radeon RX 9070 XT mit ANGLE/OpenGL ES 3.2. Chromium `153.0.8010.12` für Rendering, Eingaben, Koop und Audio. Firefox `159.0.1` für Dekodierung, v1-Weltidentität und einen WebGL-2-Einsatz-Smoke mit 176 Schneepunkten und zwei aktiven Soundscape-Stimmen. Pointer Lock im Headless-Profil blieb unbelegt. Die vier Browseransichten liefen auf derselben Maschine.
- `npm run typecheck`, `npm run build`, `npm run balance:check` und `git diff --check` erfolgreich. `npm test` erfolgreich mit **305/305** Tests. Vite meldet das bekannte Hauptbundle über 500 kB. `assets:check` erwartet ein humanoides GLB als Parameter, für diesen Prüfstand lag kein GLB vor. Die getrennte Schabe-Prüfsumme ist erfolgreich. [Testausgabe und Prüfsummen](playtest/7-7e/regression.txt)

## Änderung und Audit

| Datei | Änderung in 7.7E |
| --- | --- |
| `apps/client/src/rendering/environment/PlanetMaterials.ts` | Sand und Hardpan mit weniger gleichförmigen, schwächeren Rippen. Keine zusätzlichen Texturen, Draw Calls oder Textursamples. |
| `apps/client/src/rendering/ArenaView.ts`, `apps/client/src/rendering/environment/AtmosphereController.ts` | Beim Raumaustritt werden missionseigene Geometrien, Instanzpuffer, Materialien, Texturen und der Himmel aus der Szene gelöst. Im MissionResult bleibt die letzte Lichtstimmung stehen, lokale Wetterpartikel und Vegetationswind enden. Aufnahmeparameter der Kamera sind im lokalen Missions-Debugraum messbar. |
| `apps/client/src/audio/AudioEngine.ts` | Legacy-Setter für Web-Audio-Listener und Panner verwenden, wenn der Browser keine Positions- oder Orientierungsparameter anbietet. Die Firefox-Eiswelt lief danach mit räumlichen Audioquellen. |
| `apps/client/src/game/Game.ts`, `apps/client/src/audio/HordeAudio.ts` | Nach Verbindungsabbruch bestimmt der tatsächliche Wiedergabe-Tick die Audio-Grenze. Der neuere Horde-Frame bestätigt die Attacke und kann abgebrochene Angriffe aus dem älteren Frame unterdrücken. Entfernte Gegner verlieren ihre bewegten Stimmen. Diagnostik zählt angenommene Windup- und Impact-Cues. |
| `packages/shared/src/world/WorldGenerator.ts`, `apps/server/test/procedural-world.test.ts` | Der Server und alle Browser berechnen die in den v1-Welt-Hash eingehende Länge mit einer gemeinsamen Formel. Die vier Referenz-IDs und weitere 84 v1-IDs sind durch Vergleich bestätigt. |
| `apps/client/test/audio.test.ts`, `apps/client/test/weather-rendering.test.ts` | Regressionen für ältere Web-Audio-Schnittstellen, abgebrochene Angriffe und das Aufräumen bei konstantem Resultatlicht. |
| `scripts/playtest-planet-atmosphere.mjs`, `scripts/playtest-horde-director.mjs`, `scripts/playtest-audio.mjs` | Reproduzierbare Aufnahmeparameter, Missions- und Reconnect-Checkpoints, Angriffe unter echter Simulationslast, längere Stichproben und dekodierte Datei-/Loop-Messwerte. |
| `docs/` und `docs/playtest/7-7e/` | Ergänzte technische Dokumentation, Audit, Release-Status, Rohdaten und Gameplay-Referenzen. |

Die Schabe-Dateien und ihre Prüfsummenliste entsprechen dem vorgefundenen Stand. 7.7E verändert weder die Ausspielung der Schabe-Geometrie noch das Rig, die Animationen oder die Gameplay-Balance. Bestehende Missionen, Audio-Assets und Kollisionswerte wurden weiterverwendet. Asset-Käufe, Generierungen und Credits kosteten zusammen **0 €**. Die Einzellizenzen der vorhandenen Sounds sind dokumentiert. [7.7A–D-Audit](ENVIRONMENT_AUDIT_7_7.md) · [Lizenzinventar](AUDIO_ASSET_LICENSING.md)

## Missionen und Aufnahmen

Alle Sololäufe nutzten das normale Client-UI für Missionsauswahl, Generierung, Relay-Aktivierung, Verteidigung, Nachschub und Extraktion. Der Debugserver startete das vorhandene Deployment und brachte die Operatoren für reproduzierbare Ansichten und Interaktionen an feste Positionen. Flugphasen, Gefechtseingaben, Relay-Abschluss und beide Extraktionssequenzen liefen über Spielcode und Server-Ticks. Jeder Lauf nahm eine Nachschubladung auf. Optionale Nester blieben in diesen vier Durchläufen optional. Die Nest-, Convict- und Operation-Bodenbruch-Regressionsfälle wurden separat automatisiert geprüft.

| Planet | Welt-Seed | Mission / Tageszeit | Ruhig → Haupteffekt, Alternativwetter | Extraktion | Serverzeit / Walltime |
| --- | ---: | --- | --- | --- | ---: |
| Grüne Ebene | 17 | Seed 0 `relay-defense` / `overcast-day` | `clear` → `windy`, `light-mist` | Albatross | 52,2 / 52,8 s |
| Wüste | 31 | Seed 0 `relay-defense` / `day` | `dry-clear` → `light-dust-gusts`, `dust-haze` | Albatross | 52,0 / 52,6 s |
| Eiswelt | 48 | Seed 0 `relay-defense` / `dusk` | `clear-cold` → `windy-snow`, `light-snow` | Ballon | 146,0 / 146,5 s |
| Wald | 63 | Seed 0 `relay-defense` / `dawn` | `forest-calm` → `ground-mist`, `windy-forest` | Ballon | 146,3 / 146,8 s |
| Wald · Vierer-Koop | 63 | Seed 0 `relay-defense` / `dawn` | `ground-mist` → `windy-forest` | Ballon, 4 IDs | 154,7 s Serverzeit |

Die Zeiten stammen vom Boarding/Deployment bis zum Ergebnis in beschleunigten Fixtures. Die angestrebten 20–30 Minuten normaler Spielzeit wurden damit nicht vermessen. In den Einzelmissionen war die Gegnerzahl dynamisch und je Bild protokolliert. Lautstärke in Gameplay-Proben laut Reglerwerten Master 0,8, Combat 0,9, World/Ambience/Weather 0,8 und UI 0,7, Ton aktiv und ungemutet. Die Werte sind vor der quadratischen Skalierung im Mixer. [48 Referenzansichten und Vergleich](MILESTONE_7_7_VISUAL_ACCEPTANCE.md) · [Rohdaten zu Missionen](playtest/7-7e/captures.json)

## Release Gates

| Gate | Status | Abnahmegrundlage |
| --- | --- | --- |
| A · Planetary Visual Quality | **PASS** | Vier unterscheidbare Profile in geprüften Gameplay-Ansichten. Eis, Dünen, offene Ebene und dichter Wald sind im Bild erkennbar. |
| B · Weather & Atmosphere | **PASS** | Vier Tagespresets und Wetterprofile, sichtbare Übergänge, Fog, Wind, Partikel, synchronisierte Endpunkte und lokaler Wetterpfad geprüft. |
| C · Environmental Materials | **PASS** | Vier Materialpaletten, Bodennahaufnahmen, stabile Details in den geprüften Szenen, deterministische Platzierung und GPU-Freigabe beim Raumwechsel. |
| D · Planetary Audio | **BLOCKED** | Vier aktive und messbare Soundscapes, 124 dekodierte Dateien in beiden Browsern. Menschlicher Blind-Hörvergleich fehlt. |
| E · Spatial & Combat Audio | **BLOCKED** | Technische Richtungs- und Distanztrennung, Schritte, Dive-Dedup, Windup und Impact bestätigt. Menschliche Raumklangprüfung aus Boden- und Fahrzeugperspektiven fehlt. |
| F · Audio Mixing | **BLOCKED** | Reservierte Stimmen, Ducking, Cues und Peak-Spitzen der dekodierten Samples gemessen. Hörbarkeit kritischer Hinweise in der realen Vierer-Mischung und Lautheit über einen vollständigen Spielabend stehen aus. |
| G · Combat Readability | **PASS** | Reticle, Lebensanzeige, Munition, Ziele und Schaben in den kontrollierten vier Wetter- und Kampfszenen erkennbar. Crouch, Dive, Prone, Supine, Reload und Get-up durchlaufen. |
| H · Multiplayer | **PASS** | Vier gerenderte und vertonte Operatoren, konsistente Welt sowie Wetter- und Gameplayzustände. Reconnect im Wetter-/Angriffswechsel, bei Nachschub, im Ballon-Countdown und beim Soundscape-Wechsel überprüft. |
| I · Mission Integration | **PASS** | Vier vollständige beschleunigte Missionsabläufe und getrennte Vierer-Extraktion dokumentiert. Reguläre 20–30-Minuten-Spielrunde bleibt **NOT TESTED**. |
| J · Rendering & Audio Performance | **BLOCKED** | Reproduzierbare native Messungen liegen vor. Die vorhandenen Server-, Partikel- und Stimmenlimits wurden in den geprüften Szenarien eingehalten. Freigabe der Zielgeräte/Frame-/Lautheitsbudgets und Messung auf weiteren Zielgeräten offen. |
| K · Horde Compatibility | **PASS** | 1.000 aktive Gegner im Serverframe, vier lokale GPU-Clients, Wetter und Audio aktiv, echte Positionsänderungen und Angriffscues. Null verworfene Server-Ticks im Messfenster. Der finale Build hielt in der Gegenprobe 60,0 FPS Ø auf allen vier Clients. |
| L · Resource Stability | **PASS** | Vier Raumaustritte mit freigegebenem Terrain und null Stimmen, Planetwechsel, WebGL-Recovery, 20 Minuten Browser-Soak sowie 36.000 Messticks natürlicher Serversättigung. Mehrstündiger Vierer-Soak bleibt offen. |
| M · Regression & Compliance | **PASS** | 305 automatisierte Tests, Build, TypeScript, Balancecheck und geschützte Schabe-Hashes erfolgreich. Assetkosten 0 €. |
| N · Documentation | **PASS** | Testfälle, reproduzierbare Runs, Rohdaten, Referenzbilder, Quellen und Freigabegrenzen dokumentiert. |

[Visuelle Abnahme](MILESTONE_7_7_VISUAL_ACCEPTANCE.md) · [Audioabnahme](MILESTONE_7_7_AUDIO_ACCEPTANCE.md) · [Koop-Abnahme](MILESTONE_7_7_MULTIPLAYER_ACCEPTANCE.md) · [Umgebungsmessungen](ENVIRONMENT_PERFORMANCE.md) · [Audiomessungen](AUDIO_PERFORMANCE.md)

## Prioritäten und offene Stichproben

| Priorität | Befund | Stand |
| --- | --- | --- |
| P0 | Firefox verweigerte die generierte Eiswelt wegen unterschiedlicher Rundung beim Welt-Hash | Behoben. 88 Server-IDs des v1-Bestands stimmen nach der Korrektur in Node und Firefox überein. |
| P0 | Firefox brach den Render-Loop beim ersten Zugriff auf fehlende `AudioListener`-Parameter ab | Behoben. Firefox-Eisprobe hat WebGL, Schnee, Soundscape und einen laufenden Audiokontext ohne gemeldeten Fehler bestätigt. |
| P1 | Missionsterrain blieb nach endgültigem Raumverlassen resident | Behoben und über Renderzähler im zurückgekehrten Client geprüft. |
| P1 | Alter Horde-Playhead konnte nach Reconnect veraltete Kampfhinweise vertonen | Behoben, Codepfad und gezielte Reconnect-Proben dokumentiert. |
| P2 | Statischer Lichtwechsel am Resultat und wiederholte Sandrippel | Licht/Partikel-Lebenszyklus korrigiert, Sandkontrast reduziert. |
| P2 | Waldkronen und ihre Schatten sind in Nahsicht teilweise stilisiert. Sehr dichte Testhorden überlagern sich am Operator | Im Referenzbogen sichtbar. Bewegte Bewertung entlang normaler Sitzungsrouten offen. |
| P3 | Übliche Vite-Größenwarnung und nicht isolierte Audio-/GPU-Speicherwerte | Protokolliert. Keine Release-Budgetfreigabe aus diesen Messwerten abgeleitet. |

Die Firefox-Abweichung entstand in der Längenberechnung für gehashte Collider- und Terrainschritte. Die Spec erlaubt bei `Math.hypot` engineabhängiges Runden. Eine feste normalisierte Berechnung erhält das v1-Verhalten des Servers. [ECMAScript-Spezifikation](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.hypot) · [Welt-ID-Vergleich](playtest/7-7e/world-identities.json)

Der Echtzeit-Browser-Soak lief 20 Minuten mit Wetter und Audio. Die 20 Stichproben zeigten konstante 73,06 MiB PCM-Cache, zwei Soundscape-Stimmen und null Audiofehler. Der 20-Minuten-Server-Soak hielt 1.000 Gegner in 36.000/36.000 Messticks. [Browser-Soak](playtest/7-7e/browser-soak.json) · [Server-Soak](playtest/7-7e/server-soak.txt)

Die Checkliste aus dem Auftrag ist über die Gates rückverfolgbar. Punkte 1–10 beziehen sich auf A–C, 11–23 auf D–F und L, 24–35 auf G und M, 36–46 auf H und I, 47–55 auf J–L und 56–64 auf M/N sowie die noch offenen Prüfgates. Offene Einzelprüfungen sind im jeweiligen Bericht benannt. `PASS` für einen automatisierten Pfad schließt die separat ausgewiesene manuelle Hör- und Zielhardwareprüfung nicht ein.

## Reproduktion

Node 24, installierte Projektabhängigkeiten und lokales Playwright mit einem Chromium-Binary verwenden. Die Debug-Server binden nur Loopback. `FREEFALL_BROWSER_ANGLE=gl` steht in den folgenden Befehlen für den nativen Grafikpfad, `swiftshader` liefert eine separate Software-Kontrolle. Die Skripte schreiben JSON auf stdout und geben das Aufnahmeverzeichnis beim Start aus.

```sh
export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/pfad/zu/chromium
export FREEFALL_BROWSER_ANGLE=gl
npm run typecheck
npm run build
npm test
npm run balance:check
sha256sum -c docs/enemies/schabe/baseline.sha256

FREEFALL_FINAL_QA=1 FREEFALL_WEATHER_PLAYTEST=1 FREEFALL_BROWSER_WIDTH=960 FREEFALL_BROWSER_HEIGHT=540 \
  node --conditions=development scripts/playtest-planet-atmosphere.mjs
FREEFALL_AUDIO_FORMATS=1 node --conditions=development scripts/playtest-audio.mjs
```

```sh
export FREEFALL_GENERATED_SEED=0 FREEFALL_WORLD_PLANET=forest FREEFALL_WORLD_SEED=63
export FREEFALL_TIME_OF_DAY=dawn FREEFALL_WEATHER=ground-mist FREEFALL_BROWSER_AUDIO=1
export FREEFALL_BROWSER_WIDTH=1280 FREEFALL_BROWSER_HEIGHT=720 FREEFALL_BROWSER_QUALITY=medium

FREEFALL_OPERATORS=4 FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ENEMIES=250,500,1000 \
  FREEFALL_BROWSER_THREAT=1 FREEFALL_BROWSER_COOP_ACCEPTANCE=1 FREEFALL_BROWSER_SAMPLE_MS=12000 \
  node --conditions=development scripts/playtest-horde-director.mjs

FREEFALL_OPERATORS=1 FREEFALL_BROWSER_PEERS=1 FREEFALL_BROWSER_ENEMIES=0 \
  FREEFALL_BROWSER_LOAD_ONLY=1 FREEFALL_BROWSER_SOAK=1 FREEFALL_BROWSER_SAMPLE_MS=1200000 \
  node --conditions=development scripts/playtest-horde-director.mjs

npm run benchmark -- mission 36000 77 4 director
npm run benchmark -- enemy-ai 36000 77 4 director
```

Weitere Prüfpunkte sind vier physische Operatoren über WAN, Safari/WebKit und vollständige Firefox-Durchläufe mit Pointer Lock, ein 20–30-Minuten-Missionsdurchlauf ohne Debug-Platzierung je Planet, Kopfhörer- und Blindtest sowie Ziel-GPU-/Audio-Thread-/VRAM-Messungen. Browserabhängige Native-Benchmarks mit demselben Seed, Kamerapfad, 1.280 × 720 Medium und 0/250/500/1.000 Gegnern wiederholen. Messungen bei Abweichung mit Hardware, Browser und Trace belegen. [Manueller Hörablauf](MILESTONE_7_7_AUDIO_ACCEPTANCE.md#offene-hörabnahme)
