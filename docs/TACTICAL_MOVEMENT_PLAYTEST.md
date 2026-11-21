# Milestone 7.3 Playtest

## Abnahme 7.3C

Das Audit bestätigte Dive-Landungen, persistente Bodenhaltungen, die vorhandene Waffen-/Ausrüstungstransaktion sowie das prozedurale Rig. 7.3C ergänzte körperrelatives Kriechen mit Geschwindigkeitsbegrenzung, die vollständige Haltungsmatrix, gemeinsame Trefferzonen für Schüsse und Schabe-Angriffe, den Standfreiraum bis zum Abschlusstakt und die Darstellung von Aufsteh- und Bodendaten in Prediction, Remote-Interpolation und F2.

- Die vollständige Suite umfasst 177 Tests einschließlich vier echter Colyseus-Verbindungen, paralleler Feuer- und Aufstehanfragen, Reconnect in beiden Bodenhaltungen und einer laufenden Aufstehtransition. Sie enthält außerdem Wiedergabe ausstehender Eingaben, Korrektur an einer Wand, Trefferzonen- und Deckungstests, die 7.2B-Golden-Traces, die Schabe-Baseline sowie die Missionsregressionen. TypeScript, Build und Balance-Validierung liefen erfolgreich.
- Chromium 153.0.8010.12 mit SwiftShader prüfte im gebauten Client Pointer Lock, beide Dive-Landungen, seitliches Kriechen, die F2-Anzeige, das projizierte Fadenkreuz, Primärfeuer, taktisches Nachladen, blockierte Granaten, Stim und Aufstehen per Leertaste. Ein Browser war aktiv. Die Sekundärwaffe und vier gleichzeitige Operatoren sind durch die automatisierten Tests abgedeckt.

### Servermessung 7.3C

Linux x64, AMD Ryzen 7 9700X, Node 24.18.0. Die Arena lief mit Seed 421337, vier Operatoren, 360 Aufwärmticks und 1.800 Messticks je Hordengröße. Die Messung umfasst die Server-Simulation bei virtuellen 30 Hz. Das Horde-Paket blieb bei maximal 10.006 Bytes. Die Referenz wurde vor den 7.3C-Änderungen am vorhandenen Arbeitsstand gemessen.

| Szenario mit 1.000 Gegnern | Mittel ms | P95 ms | Maximum ms | Spieler-JSON max. Bytes |
| --- | ---: | ---: | ---: | ---: |
| Dauerfeuer, Referenz | 0,227 | 0,278 | 1,150 | 1.636 |
| Dauerfeuer, 7.3C | 0,224 | 0,255 | 1,116 | 1.636 |
| Taktisches Muster, Referenz | 0,177 | 0,227 | 0,426 | 2.669 |
| Taktisches Muster, 7.3C | 0,175 | 0,213 | 1,056 | 2.330 |
| Vier Operatoren in Bodenhaltung, 7.3C | 0,230 | 0,290 | 0,443 | 2.985 |

Der Dauerfeuerlauf hatte in beiden Versionen 1.068 Schüsse. Das taktische Muster variiert durch das geänderte Kriechen und die Gefechtsverläufe. In 7.3C bestätigte es drei Hechtsprünge, 607 Schüsse und 14 Explosionen einschließlich Aufwärmphase. Der gesonderte Bodenlauf verwendete zwei Operatoren je Haltung. Vier Operatoren krochen in 1.800 Ticks, feuerten gleichzeitig in 200 Ticks, luden gleichzeitig in 630 Ticks nach und verwendeten gleichzeitig in 360 Ticks Stims. Dieser Lasttreiber füllt Reserven und schützt die Testoperatoren vor Schaden. Der taktische Lauf verwendet regulären Schaden. Einzelmessungen erlauben aufgrund unterschiedlicher Last und Laufzeitstreuung keine allgemeine Aussage über eine Beschleunigung.

Der Bodenbruch-Benchmark erreichte bei 1.000 Gegnern 0,318 ms P95. Das separate Extraktionsszenario erreichte 0,361 ms P95 und kehrte mit vier extrahierten Operatoren zu `CARRIER_HUB` zurück. Es verwendet beschleunigte Platzierung und geschützte Testoperatoren.

```sh
npm test
npm run typecheck
npm run build
npm run balance:check
npm run benchmark -- 1800 421337 4 continuous
npm run benchmark -- 1800 421337 4 tactical
npm run benchmark -- 1800 421337 4 ground
npm run benchmark -- mission 1800 421337 4
```

### Geänderte Dateien

| Bereich | Dateien |
| --- | --- |
| Gemeinsame Simulation | `packages/shared/src/config/posture.ts`, `packages/shared/src/config/postureGeometry.ts` |
| Balance | `packages/shared/src/balance/definitions.ts`, `packages/shared/src/balance/data/movement.json` |
| Server und Lasttreiber | `apps/server/src/simulation/Player.ts`, `apps/server/src/systems/combat.ts`, `apps/server/src/benchmark.ts` |
| Client und Netzwerkdarstellung | `apps/client/src/game/Game.ts`, `apps/client/src/game/Prediction.ts`, `apps/client/src/game/RemoteInterpolation.ts`, `apps/client/src/rendering/Agents.ts`, `apps/client/src/rendering/ArenaView.ts`, `apps/client/src/rendering/ThirdPersonCamera.ts`, `apps/client/src/rendering/characters/PlayerVisualController.ts`, `apps/client/src/ui/App.tsx`, `apps/client/src/ui/styles.css` |
| Automatisierte Tests | `apps/client/test/tactical-movement.test.ts`, `apps/server/test/tactical-movement.test.ts`, `apps/server/test/multiplayer.test.ts` |
| Dokumentation | `docs/PRONE_SUPINE_COMBAT.md`, `docs/POSTURE_STATE_MACHINE.md`, `docs/CHARACTER_COLLISION.md`, `docs/TACTICAL_MOVEMENT.md`, `docs/TACTICAL_MOVEMENT_PLAYTEST.md` |

### Offene Abnahme und 7.3D

- Produktionsclips für beide Bodenhaltungen, Waffenaktionen und Aufstehen integrieren und die Kontakte von Händen, Knien und Waffe bei Kriechen, Zielwechsel und Übergängen mit dem vorhandenen IK prüfen. Der aktuelle Stand verwendet prozedurale Posen. Die Clip-IDs stehen in [Taktische Bewegung](TACTICAL_MOVEMENT.md).
- Kamerafahrten an Überhängen und Wandkanten, Darstellung sehr naher Ziele und analoge Bedienung mit physischem Gamepad auf Zielhardware abnehmen.
- Framezeiten mit vier realen Browsern und voller Horde auf Zielhardware erfassen. Die Servermessungen und der Chromium-Smoke-Test decken diesen GPU-Lastfall noch nicht ab.
- Begehbare Hänge und Hindernisoberseiten benötigen ein höhenfähiges Weltmodell. Die begehbaren Kartenflächen dieser Abnahme sind eben.

## Abnahme 7.3B

- `npm test` bestand 165 Tests. `npm run typecheck`, `npm run build` und `npm run balance:check` liefen erfolgreich. Die Suite deckt Ducken und Rutschen, 360°-Richtung, getrennte Körper- und Kameraausrichtung, Eingabepuffer, Cooldown, Wand und Überhang, Rettungsseil, Friendly Fire und Explosionen im Flug, Tod, Reconciliation sowie Remote-Rekonstruktion über Snapshot-Lücken ab. Die Colyseus-Tests verwenden vier echte Verbindungen und prüfen die gemeinsame Landung sowie einen Mission-Reconnect.
- Headless Chromium 153 mit Software-WebGL bestätigte Pointer Lock, Ducken, X+D aus der Hocke, X+S aus dem Stand, reale Flughöhe, freie Kamera im Flug, beide bleibenden Bodenhaltungen, aktives Aufstehen und die F2-Haltungsanzeige. Der gebaute Client bestätigte über die simulierte Gamepad-API zusätzlich einen analogen Zwischenwinkel. Die Prüfung verwendete kein physisches Gamepad.
- Die 7.2B-Golden-Traces, der Schabe-Baseline-Test sowie die Missions-, Extraktions- und Movement-Regressionsprüfungen liefen mit. Client-Framezeiten mit vier Browsern auf Zielhardware bleiben eine manuelle Abnahme.

Die Arena-Benchmarks liefen mit Seed 421337 über 1.800 Messticks nach 360 Aufwärmticks. Bei vier Operatoren und 1.000 Gegnern lag die Serverzeit im Dauerfeuer bei 0,253 ms P95 und im taktischen Muster bei 0,207 ms P95. Im taktischen Lauf wurden vier Dives bestätigt. Der größte Spieler-Snapshot umfasste 2.669 JSON-Bytes. Das Horde-Paket blieb bei 10.006 Bytes. Der Missionslauf erreichte unter Sättigung 0,312 ms P95 und kehrte im separaten Extraktionsszenario mit vier Operatoren zum Carrier zurück (0,355 ms P95).

## Frühere 7.3-Prüfungen

- Die automatisierten Tests prüfen Zustand und Tempo beim Ducken, 360°-Richtungen einschließlich analoger Zwischenwerte, Cooldown, dünne Hindernisse und zu niedrige Überstände. Sie prüfen außerdem Absprung, Landung, blockiertes Aufstehen und Tod während Sprung und Aufrichten.
- In beiden Bodenhaltungen sind Primär- und Sekundärwaffe, taktisches Nachladen und Stims abgedeckt. Tests prüfen blockierte Granaten und Nahkampfangriffe, gegnerische Angriffshöhen, Kopf- und Körperprofile, niedrige Mündungen, Deckung und Friendly Fire während des Flugs.
- Vier echte Colyseus-Verbindungen sehen gemeinsam vier unterschiedliche Hechtsprünge samt Flug und Landung. Der Missionstest prüft einen Reconnect in Rückenlage. Weitere Tests prüfen die Rekonstruktion eines aktiven Sprungs, lokale Rücknahme abgelehnter Requests und Remote-Interpolation.
- Der Chromium-Smoke-Test auf der lokalen Testarena hat Pointer Lock, Rebinding einschließlich Konflikt und Seitenreload, reduzierte Kamerabewegung, Ducken, beide Landungen, einen Schuss mit taktischem Nachladen in Rückenlage und aktives Aufstehen bestätigt.
- Die 7.2B-Golden-Traces sowie die Regressionstests für Schabe, Convicts, Nester, Ziele, Deployment, beide Extraktionssysteme und MissionResult laufen mit. Der gesonderte Mission-Benchmark erreichte mit vier Operatoren und 1.000 Gegnern die Extraktion und den Carrier.

## Servermessung

Linux x64, Node 24.18.0, AMD Ryzen 7 9700X. Die Arenazeilen verwenden Seed 421337, vier Operatoren, 360 Aufwärmticks und 1.800 gemessene Ticks bei virtuell 30 Hz. Die Zeiten messen die Server-Simulation. Die Snapshot-Größen sind Nutzdaten vor Transport-Overhead.

| Szenario mit 1.000 Gegnern | Mittel ms | P95 ms | Max. ms | Horde max. Bytes | Spieler-JSON max. Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Arena vor 7.3, Dauerfeuer | 0,214 | 0,245 | 0,488 | 10.006 | – |
| Arena mit 7.3, Dauerfeuer | 0,226 | 0,252 | 0,432 | 10.006 | 1.620 |
| Arena mit 7.3, taktisches Muster | 0,158 | 0,211 | 1,217 | 10.006 | 2.490 |
| Bodenbruch, Stufe 7, Sättigung | 0,298 | 0,309 | 0,636 | – | – |

Im vergleichbaren Dauerfeuermuster stieg P95 um 0,007 ms. Das taktische Muster bestätigte bei 1.000 Gegnern 24 Sprünge, 716 Schüsse und 36 Explosionen. Die 36 Explosionen enthalten die Aufwärmphase. Das taktische Muster hat durch Flug, Bodenhaltung, Aufrichten und andere Gefechtsverläufe eine andere Schuss- und Trefferlast. Der zusätzliche Missionsdurchlauf für die Extraktion lag bei 0,341 ms P95 und erreichte mit vier extrahierten Operatoren wieder `CARRIER_HUB`. Der Extraktionsbenchmark nutzt beschleunigte Platzierung und geschützte Testoperatoren.

```sh
npm run typecheck
npm test
npm run build
npm run balance:check
npm run benchmark -- 1800 421337 4 continuous
npm run benchmark -- 1800 421337 4 tactical
npm run benchmark -- mission 1800 421337 4
```

## Nächste manuelle Abnahme

1. Auf dem Carrier vom Spawn aus links zum gelb markierten Servicerahmen nahe X = −6,5 und Z = 12,4 gehen. Aufrecht davor stoppen, mit C unter den Rahmen gehen und dort die Leertaste drücken. Die Meldung soll erscheinen und die Hocke erhalten bleiben. Hinter dem Rahmen erneut aufstehen.
2. Im Feld mit vier Clients aus Sprint und Hocke in entgegengesetzte Richtungen hechten. Landetiming, Blickfreiheit, Vortrieb nach Wandkontakt und Kamerafahrt beim Aufstehen aus Sicht anderer Operator prüfen.
3. In Bauch- und Rückenlage an der Deckung beide Waffen abfeuern, nachladen und Stims verwenden. Auf Handkontakt, Knie- und Gewehrfreiheit, Mündungsdeckung und die Kamerakorrektur an engen Ecken achten.
4. In Bodenhaltung und im Flug die Verbindung unterbrechen. Unter Netzjitter F2 für Korrekturen, Serverkollider, Bodenkontakt und Animationszustand beobachten.
5. Client-Framezeiten mit vier realen Browsern und 1.000 Gegnern auf Zielhardware erfassen. Die Chromium-Prüfung verwendete Software-WebGL. Produktionsclips und deren Animation-Polish bleiben die nächste Asset-Aufgabe.

Die vollständige Clipliste steht in [Tactical Movement](TACTICAL_MOVEMENT.md). Die aktuellen Posen und Übergänge verwenden das prozedurale Rig.

## 7.3D — Prüflauf vom 19. November 2026

**Automatisiert.** TypeScript-Prüfung, Produktionsbuild, Balance-Check und 184 Tests erfolgreich. Die Suite umfasst die 7.2B-Golden-Traces, 7.3A–C, Eingabekontexte und Rebinding, Flug-/Landeticks, Kamera unter Deckung, variable Framezeiten, reduzierte Bewegung, Clip-Unterbrechungen, Maskierung, fehlerhafte Bindings, Root Motion und Remote-Schüsse mit Tick und Lebens-ID. Vier echte Colyseus-Verbindungen prüfen gleichzeitige Dives und Bodenkampf, Prediction und Reconnect. Die Missionssuite umfasst Convicts, Nester, Missionsziele, Deployment, Extraktion und MissionResult. Die drei Prüfsummen der geschützten Schaben-Dateien stimmen mit der gespeicherten Baseline überein.

**Browser und Sichtprüfung.** Playwright steuerte den gebauten Client in Chromium 153.0.8010.12 mit SwiftShader. Pointer Lock, Standardbelegungen und ein nach Reload persistierter Ersatz für X wurden benutzt. Die UI meldete einen Konflikt mit C. Die Mausempfindlichkeit blieb beim Neuladen auf 150 %. Die Prüfpunkte A–E liefen im Browser. Vorwärts- und Seitwärtssprünge endeten in Bauchlage, der Rückwärtssprung in Rückenlage. Beide Bodenhaltungen konnten seitlich bewegt werden, zielen, feuern, nachladen, einen Stim verwenden und aufstehen. Granaten blieben in Bodenhaltung gesperrt. Die Landeposen und F2-Haltungsanzeigen wurden anhand von Browserbildern geprüft. Der Feuer- und Ausrüstungsstatus wurde zusätzlich am laufenden Server kontrolliert.

**Vier Browser.** Vier separate Chromium-Clients betraten dieselbe Arena. Gleichzeitig wurden Stand, Hocke, Bauchlage und Rückenlage in den vier Clients erreicht. Nach dem Landen feuerten beide liegenden Operatoren und wechselten in ihrer jeweiligen Haltung auf die Sekundärwaffe. Die Prüfung verglich den autoritativen Zustand und die jeweilige Client-Anzeige. Der visuelle Vergleich der vollständigen Remote-Animationen aus allen vier Blickwinkeln bleibt offen.

### Last und Vergleich

Linux x64, Node 24.18.0, AMD Ryzen 7 9700X. Der Serververgleich lief mit Seed 421337, vier Operatoren, 360 Aufwärmticks und 600 Messticks. Alle vier Operatoren kriechen und feuern im Ground-Szenario. Der Browserbenchmark benutzt einen gerenderten Client und drei aktive SDK-Clients. Der 60-Hz-Takt dient als Abtastziel.

| Messung | Vor 7.3D-Änderungen | Nachher |
| --- | ---: | ---: |
| 1.000 Gegner, Server-Tick Ø / P95 | 0,228 / 0,289 ms | 0,230 / 0,292 ms |
| Max. Horde-Paket und Spieler-Snapshot, Nutzdaten | 10.006 / 2.937 Byte | 10.006 / 2.937 Byte |
| Schüsse / Abschüsse im 1.000er-Szenario | 320 / 99 | 320 / 99 |
| Motion-Benchmark mit simuliertem LAN und Jitter, 60 und 144 Hz | Referenzlauf | Identische Ergebnistabellen mit gleicher Rundung |
| Browser mit SwiftShader, 1.000 Gegner und vier aktive Operatoren | Kein vergleichbarer Lauf | 7,3 FPS, Frame P95 250,0 ms, rAF-CPU Ø 1,73 ms und P95 4,00 ms, Server P95 0,451 ms |
| Prozedurales Posing von vier Operatoren / Kamera mit Bodenbruch-Geometrie, Node ohne Renderer | Einzelmessung | P95 0,011 / 0,002 ms bei 2.400 Frames nach 600 Aufwärmframes |

Die beiden neuen Felder im Operator-Schussereignis erhöhten eine mit dem Colyseus-Encoder gemessene Beispiel-Nutzlast bei Tick 960 und Leben 1 von 147 auf 161 Byte. Spieler- und Horde-Snapshots tragen weiterhin die bestehenden Daten. Der Client lädt 0 neue Animationsdateien. Speicher, individuelle Asset-Ladezeiten und GPU-Zielhardware wurden nicht separat gemessen.

Wiederholbare Messungen:

```bash
npm run benchmark -- 600 421337 4 ground
node --conditions=development scripts/motion-bench.ts 60,144 lan,jitter
ANGLE=swiftshader VSYNC=60 PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs node --conditions=development scripts/perf-browser.mjs /tmp/freefall-browser-perf.json
```

### Offene Abnahme für 7.3E

- Geskinnten Operator und animierte In-Place-GLBs liefern. Beim rückwärtigen Pilot zuerst `diveBackward`, `supineLand` und `supineIdle` am Produktionsrig prüfen. [Asset-Inventar](ANIMATION_ASSET_INVENTORY.md)
- Fuß- und Handkontakt, Waffenwinkel, Kniefreiheit und die bisher prozeduralen Übergänge frameweise in der Nähe von Deckung abnehmen. Für externe Assets Lizenz, Editierrechte und Export nachweisen. [Higgsfield-Pilot](HIGGSFIELD_ASSET_PIPELINE.md)
- Vier gerenderte Clients mit 1.000 Gegnern auf Zielhardware profilieren und die vollständige Mission dort spielen. Der SwiftShader-Lauf dokumentiert den Software-Renderer unter Last. Produktions-FPS und optische Abnahme stehen aus.

### Dateien dieses Arbeitsschritts

| Bereich | Dateien |
| --- | --- |
| Operator-Darstellung | `apps/client/src/rendering/characters/{CharacterAnimation,CharacterClipPlayer,PlayerVisualController,SoldierRig,TacticalAnimation}.ts`, `apps/client/src/rendering/characters/animation/ClipLibrary.ts` |
| Kamera und Kollision | `apps/client/src/rendering/{ArenaView,CameraPreferences,ThirdPersonCamera}.ts`, `packages/shared/src/config/worldGeometry.ts` |
| Eingabe und Telemetrie | `apps/client/src/input/{Bindings,DesktopInput}.ts`, `apps/client/src/ui/{App,ControlSettings}.tsx`, `apps/client/src/game/Game.ts` |
| Remote-Darstellung und Schuss-Timing | `apps/client/src/game/RemoteInterpolation.ts`, `apps/client/src/rendering/Agents.ts`, `apps/client/src/networking/Match.ts`, `apps/server/src/rooms/FreefallRoom.ts`, `packages/shared/src/contracts/messages.ts` |
| Tests und Browserbenchmark | `apps/client/test/{animation-hybrid,presentation,tactical-movement}.test.ts`, `apps/server/test/multiplayer.test.ts`, `scripts/perf-browser.mjs` |
| Dokumentation | `docs/{ANIMATION_ASSET_INVENTORY,ANIMATION_SYSTEM,CHARACTER_ANIMATION,CHARACTER_ASSET_REQUIREMENTS,HIGGSFIELD_ASSET_PIPELINE,INPUT_REBINDING,POSTURE_STATE_MACHINE,TACTICAL_CAMERA,TACTICAL_MOVEMENT,TACTICAL_MOVEMENT_PLAYTEST}.md` |

## 7.3E – Integration und Wiederholung

Der Abnahmestand lief durch 195 automatisierte Tests, Produktionsbuild, TypeScript und Balance-Check. Operation Bodenbruch wurde in der Server-Simulation mit einem, zwei und vier Operatoren ohne Debug-Befehle bis zum Carrier-Rücklauf ausgeführt. Ein separater Browserlauf mit drei SDK-Teilnehmern durchlief Deployment, beide Bodenhaltungen und die Ballonextraktion. Der Treiber setzte die Relais für diesen Lauf fertig und füllte den Ballonabschnitt bis 1.000 aktive Gegner. Die geprüften Fälle, Messwerte und Gate-Entscheidungen stehen im [Abnahmebericht](MILESTONE_7_3_FINAL_ACCEPTANCE.md), [Netzwerk-Stresstest](MULTIPLAYER_STRESS_TEST.md) und [Performance-Benchmark](PERFORMANCE_BENCHMARK_7_3.md).

```bash
npm test
npm run typecheck
npm run build
npm run balance:check
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs node --conditions=development scripts/playtest-ms6.mjs tactical stress
```

### Ausstehende Sicht- und Lastprüfung

1. Vier getrennt gerenderte Clients mit Zielhardware und Medium-Profil verbinden. Regulär planen, boarden und Alpha/Bravo in derselben Mission abschließen. Körperhaltung, Waffenwechsel und Reload in jeder Perspektive beobachten.
2. Vorwärts, seitwärts, rückwärts und diagonal an Wänden, Überhängen und Deckung hechten. In F2 Landetick, Körperwinkel, Haltungsbox und Hit-Zonen prüfen. Bodenkontakt und ruhige Kameraführung bei beiden Landungen und beim blockierten Get-up beurteilen.
3. In beiden Bodenhaltungen zielen, nachladen, Waffen wechseln und Stims verwenden. Mündungsrichtung, Handpositionen und Bodenkontakt beim Schuss vergleichen. Tastenbelegung ändern, Reload der Seite und Fokusverlust testen.
4. Bei unterschiedlichen Haltungen gegnerischen Kontakt, Deckung und Friendly Fire prüfen. Echte Netzverzögerung und Unterbrechung an einem Client einfügen. Während Dive, Reload, Stim und Get-up trennen. F2 und Missions-/Waffenstatus nach Rückkehr vergleichen.
5. Albatross und Ballon in separaten Durchläufen verwenden. Beim Sichern und Pickup die Haltungsregel testen. Ergebnis, erfasste Operatoren und Rückkehr zum Carrier verifizieren. Die 1.000er-Dauermessung und das Speicherprofil nach Reconnects auf Zielhardware protokollieren.
