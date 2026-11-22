# FREEFALL 7.9C · Taktische Bewegung und Bodenkampf

## 1. Repository-Audit vor der Umsetzung

| Meilenstein | Im Code verifizierter Stand |
| --- | --- |
| 7.1 | 30-Hz-Simulation, autoritative Eingabe-ACKs, Client-Replay und getrennte Renderposition. Die Remote-Timeline puffert Server-Snapshots und begrenzt die Extrapolation. |
| 7.2A | `BALANCE.movement` wird validiert, eingefroren und in `MissionBalance` übernommen. Client und Server liefern die Registry mit dem Build aus. Die Verbindung vergleicht den Versionshash und meldet Abweichungen. |
| 7.3 | `posture.ts` steuert Server und Prediction. Der Client bildet Tastenkanten und Analogstick über `DesktopInput` ab. Die Serverqueue prüft Sequenz, Lebens-ID und Eingabebereich. Dive- und Aufstehphasen werden mit Serverticks repliziert. |
| 7.4 | `EnemyCombat` prüft Ziel- und Lebensidentität, Kontaktvolumen, Angriffswinkel und Deckung am aktiven Servertick. Die aktuelle Director- und Gegnerbalance ist integriert. |
| 7.6 | `MissionGenerator` verbindet Green Plains, Desert, Ice und Forest mit generierten Heightfields und Solids. `MissionInstance.movementWorld` nutzt die Missionsoberfläche. `Game` rekonstruiert dieselbe Welt für Prediction und Rendering. |
| 7.8D | Schulter- und Boom-Kollision, gedämpfte Blickhöhe, reduzierte Bewegung und projiziertes Reticle laufen in `ThirdPersonCamera` und `ArenaView`. Das prozedurale Rig und die optionale GLB-Ebene lesen dieselben bestätigten Haltungsphasen. |
| 7.9A/B | Vorhandene lokale Waffen-Audio- und Balance-Arbeiten sind aktiv. Kestrel-Recoil und Spread sind serverseitig. Die laufende Registry ist 7.9B mit übernommener Waffenbalance und angepasstem Schaben-Windup sowie Director-PEAK. |

Quellen im Repository. [7.1 Messung](PERFORMANCE_BASELINE_7_1.md) · [7.2A Registry](BALANCE_ARCHITECTURE.md) · [7.3 Steuerung](TACTICAL_MOVEMENT.md) · [7.4 Abnahme](MILESTONE_7_4_FINAL_ACCEPTANCE.md) · [7.6 Planeten](PLANET_PROFILES.md) · [7.8D Abnahme](MILESTONE_7_8D_FINAL_ACCEPTANCE.md) · [7.9A.2 Balance](COMBAT_BALANCE_7_9A_2.md) · [7.9B Bericht](MILESTONE_7_9B_REPORT.md)

## 2. Reproduzierbare Baseline

- Revision `ffc81913055f9673ffb55fa027b7488ef0ec9d71` mit den beim Start vorhandenen lokalen Arbeiten für 7.9A und 7.9B. Registry-Release `7.9B`, Schema `2`, Hash `390e375eec0bf943`.
- `movement.json` SHA-256 `f286166953f757bd83bf7d92943e06f1cea74f9b0caf0bc55b0ad4d53b2d2338`. `operators.json` SHA-256 `fbdb0e3bf70b7fb78c4446862883e80f56d6e297b321d448bc03a848328359ae`. `combat.json` SHA-256 `0d34147b65b99322a855f9fb417264cc1ef07137bae84c1f937bc0989f2fad90`.
- Autoritative Zustandsdaten in `PostureState` und `DiveState`, über `playerSnapshot` mit Tick, Life, ACK und Position übertragen. Das prozedurale Rig bindet `TacticalAnimation` an diese Phasen. `ClipLibrary` definiert optionale Clip-IDs und Fallbacks. Produktionsclips für alle Dive-Richtungen stehen weiterhin aus. [Registry-Werte](../packages/shared/src/balance/data/movement.json) · [Zustandsmaschine](../packages/shared/src/config/posture.ts) · [Animationsbindungen](../apps/client/src/rendering/characters/animation/ClipLibrary.ts)
- Baseline `npm test` auf Loopback mit 347/347 Tests. Die ursprüngliche Sandbox blockierte das Öffnen von lokalen Ports. Der freigegebene Lauf dient als Referenz.

| Haltung | Bewegung, Eintritt und Austritt | Haltungsform Breite × Höhe × Länge |
| --- | --- | --- |
| `STANDING` | Gehen 5,8 m/s, Sprint 9,2 m/s. C duckt oder startet bei ausreichendem Sprinttempo `SLIDING`. X kann in `DIVING` wechseln. | 0,84 × 1,78 × 0,84 m. Friendly Fire nutzt Radius 0,42 m und Höhe 1,85 m. |
| `CROUCHING` | 55 % des Gehtempos, 3,19 m/s. C oder Leertaste richtet bei Freiraum auf. X kann in `DIVING` wechseln. Pose blendet 6 Ticks. | 0,84 × 1,18 × 0,84 m |
| `SLIDING` | 4,5 m in 18 Ticks, linear abnehmendes Tempo mit Faktor 0,80. Start ab 7 m/s mit Anlauf. Nach Zeitablauf oder Blockade in `CROUCHING`. Cooldown 36 Ticks. | 0,84 × 0,90 × 1,44 m |
| `DIVING` | 23 Ticks inklusive 3 Ticks Vorbereitung, 5 m auf freier Bahn, 0,62 m maximale relative Höhe. Erster Flugschritt 0,333125 m, entsprechend rund 9,994 m/s. Richtung beim Tastendruck, Landewahl relativ zum bestätigten Körper-Yaw. Cooldown 36 Ticks. | Zuerst Ausgangsprofil, im Flug 0,84 × 0,72 × 1,88 m. Der Bewegungssweep reserviert zusätzlich das Landeprofil. |
| `PRONE` | Vorwärts- und Seitwärtslandung. Kriechen bis 1,45 m/s, Drehen bis 5 rad/s. Leertaste beginnt bei Freiraum das Aufstehen. | 0,80 × 0,49 × 1,92 m, Trefferzonen für Kopf, Torso und Beine |
| `SUPINE` | Rückwärtslandung einschließlich rückwärtiger Diagonalen. Kriechen bis 1,16 m/s, Drehen bis 4 rad/s. Leertaste beginnt bei Freiraum das Aufstehen. | 0,86 × 0,55 × 1,96 m, gespiegelte Kopf- und Beinorientierung |
| `GETTING_UP` | 24 Ticks aus Bauchlage, 30 aus Rückenlage. Bewegung und Waffenaktionen gesperrt. Nach Ablauf in `STANDING`. Freiraumverlust bricht in die Ausgangslage ab. | Lineare Interpolation zur Standform. |

Kriechbeschleunigung 8 m/s² bei anliegender Eingabe, Loslassen stoppt die Bewegung. Boden-Zielbereich ±60° zum Körper, Pitch −0,48 bis +0,48 rad in Bauchlage und −0,27 bis +0,55 rad in Rückenlage. `DIVING` und `GETTING_UP` sperren die Kampfaktionen. Landung verbraucht ihren Tick. Beide Bodenhaltungen erlauben Aim, Feuer, Reload und Stim, sperren Sprint, Granate und Nahkampf. Die Zustandsmaschine kennt keinen automatischen Aufstehbeginn. Lebenswechsel und Missionsplatzierungen setzen die Haltung zurück. Es gibt keinen separaten Puffer für abgelehnte Haltungsbefehle. Die Serverqueue hält höchstens zehn Eingaben und bevorzugt beim Verwerfen Haltungsbefehle gegenüber gewöhnlichen Steps.

Die Baseline enthält die vollständigen Registry-Eingaben einschließlich der lokal vorhandenen 7.9A/B-Daten. Der Messharness akzeptiert diese Datei direkt. [Registry-Snapshot](playtest/7-9c/baseline-registry.json)

## 3. Festgestellte Probleme

| Bereich | Bestätigter Fehler und Referenzmessung |
| --- | --- |
| Eingabe | Bei sieben anstehenden Kriecheingaben quittierte der Server im blockierten Landetick drei statt einer. Die Kriechschritte wurden im selben Tick ignoriert. |
| Remote-Darstellung | Im Wandtest extrapolierte die Bauchlage bis X = 0,675 m in feste Deckung. Die gültige Grenze liegt bei X = 0,59 m. Auf gestückeltem Gelände wich die interpolierte Höhe zusätzlich von der Dreiecksoberfläche ab. |
| Waffenpose | Bei −8 m Welt-Y und abwärts gerichteter Eingabe zeigte die Waffe in Bauchlage rückwärts. Die Pose zielte auf die globale Nullhöhe. Der Server und das Reticle berücksichtigten bereits das Heightfield. |
| Dive-Vorbereitung | Der Wechsel in `DIVING` verkürzte die Friendly-Fire-Trefferhöhe sofort von 1,85 auf 1,78 m. Ein Schuss im weiterhin aufrechten Bereich über 1,78 m verfehlte vor dem Absprung. |

Eine vollständige Änderung der Schnittberechnung für die stehenden Trefferzylinder beeinflusste die gepinnten Kampftraces. Der Versuch wurde verworfen. Die bestehende Schnittregel und die stehenden Trefferabmessungen gelten damit auch während der aufrechten Dive-Vorbereitung. Die Versionsprüfung der Registry warnt bei abweichenden Builds. Der Produktionspfad verwendet auf beiden Seiten die gebündelte Registry. Eine Übertragung benutzerdefinierter Serverprofile wurde im Standardbetrieb nicht benötigt.

## 4. Implementierte Änderungen

| Datei | Änderung |
| --- | --- |
| `apps/server/src/simulation/Battlefield.ts` | Am blockierten Dive- oder Slide-Landetick bleibt späterer Queue-Inhalt für den nächsten beweglichen Tick verfügbar. Erfasst Bewegungs- und Bodenkampfmetriken auf Anforderung. |
| `apps/server/src/systems/combat.ts` | Der serverseitige Friendly-Fire-Zylinder der Standhaltung gilt bis zum Absprung aus dem Stand. Die Schadensmessung erfasst die Opferhaltung zum Trefferzeitpunkt, vor einem möglichen Reset bei Tod. |
| `apps/server/src/systems/telemetry.ts` | Begrenzte Zähler pro Haltung, Richtung und Übergang. Erfasst verarbeitete Befehle, verworfene Queue-Befehle, Dive-Kollisionen, Dauer und Distanz abgeschlossener Dives, Aufstehen, bestätigte Schüsse, Magazintransaktionen, Stim-Anwendungen, Schaden, Todesfälle und Bewegungszeit. |
| `apps/client/src/game/RemoteInterpolation.ts` | Extrapolierte Bodenbewegung läuft durch den vorhandenen Haltungs-Sweep. Die Darstellung liest die Höhe des Heightfields am tatsächlich dargestellten Punkt. |
| `apps/client/src/rendering/Agents.ts`, `apps/client/src/rendering/characters/PlayerVisualController.ts` | Die Waffenpose von lokalen und entfernten Operatoren konvergiert relativ zur Geländeoberfläche. Bei einem Bodenkontakt des Zielstrahls hinter der Mündung bleibt die Waffe in Schussrichtung ausgerichtet. |
| `apps/client/src/game/Game.ts`, `apps/client/src/rendering/ArenaView.ts` | Der vorhandene F2-Debug zeichnet die drei autoritativen Bodentrefferzonen auf ihrer jeweiligen Geländehöhe. |
| `apps/client/test/tactical-movement.test.ts`, `apps/server/test/tactical-movement.test.ts`, `apps/server/test/procedural-mission.test.ts` | Regressionen für Waffenpose, Remote-Geländehöhe und -Deckung, Queue am Landetick, Treffer in Dive und Rise und vier generierte Hindernisse. Der vollständige Forest-Pfad enthält einen Rückwärtsdive, Bodenfeuer und eine Extraktion aus der Hocke. |
| `scripts/measure-tactical-movement.ts` | Gepaartes Serverexperiment mit gleicher Ausgangsbelegung für Stand, Hocke und taktische Sequenz. Erstellt Messwerte je Seed, Last, Haltung und Aktion. |
| `scripts/playtest-tactical-presentation.mjs`, `scripts/playtest-combat-presentation.mjs` | Bestätigte niedrige Mündung in beiden Bodenhaltungen, beobachtete Client- und Serverübergänge sowie optionaler taktischer Belastungstest für Forest. |
| `docs/MILESTONE_7_9C_REPORT.md`, `docs/playtest/7-9c/` | Abnahmebericht, reproduzierbare Baseline und Messdaten. |

Die lokalen Probes aktivieren die Zähler im jeweiligen Serverprozess und verwenden die regulären Bewegungs- und Trefferpfade. Die bestehende F2-Prediction-Telemetrie erfasst Korrekturen und harte Sprünge.

## 5. Balance-Entscheidung

| Parameter | Vorher | Beibehalten | Beobachtung |
| --- | --- | --- | --- |
| Dive-Strecke, Vorbereitung, Gesamtdauer | 5 m, 0,09 s, 0,75 s | 5 m, 0,09 s, 0,75 s | Alle zehn ungehinderten Dives im Planetenvergleich legten 5 m in 23 Serverticks zurück. Die Hindernisproben stoppten räumlich korrekt. |
| Aufstehen aus Bauchlage und Rückenlage | 0,8 s und 1,0 s | 0,8 s und 1,0 s | Je 24 und 30 Ticks. Der Test prüft Treffer und Freiraum über die Transition. |
| Stand-, Hock- und Kriechtempo | 5,8 / 3,19 / 1,45 / 1,16 m/s | 5,8 / 3,19 / 1,45 / 1,16 m/s | Grundbewegung, Richtungswechsel und Lösen der Eingabe funktionieren mit dem bestehenden Beschleunigungsmodell. Die kontrollierte Überlebensprobe lieferte keinen belastbaren Grund für generelles Mehrtempo. |

Der Registry-Hash `390e375eec0bf943` gilt für Baseline und Endstand. Werte für Gegnerdruck, Waffen und Damage Policy stammen aus dem vorgefundenen 7.9B-Stand. Die acht autoritativen Kampftraces stimmen mit der Baseline überein.

## 6. Bewegungsvalidierung und Überleben

- Stand, Sprint, Hocke und Rutschen liefen mit den bestehenden Auslösern. Die Suite deckt Anlauf, Tempo, Richtungswechsel, die Kollision an einer dünnen Wand und das Auslaufen in der Hocke ab.
- Die 360°-Matrix enthält acht Haupt- und Diagonalrichtungen, analoge Zwischenwinkel, neutralen Start und Kameradrehung zwischen Tastendruck und Serververarbeitung. Rückwärtige Komponenten landen in `SUPINE`. Wiederholte Befehle, veraltete Lebens-IDs und ungültige Achsen werden geprüft.
- In `PRONE` und `SUPINE` bestätigte der Server Aim, Schüsse, Magazintransaktionen und Heilstims. Sprint, Granate und Nahkampf blieben gesperrt. Ohne Aufstehbefehl blieben beide Haltungen bestehen. Der Browser-Smoke-Test erfasste für beide Haltungen einen Schuss aus der jeweiligen niedrigen Mündung.
- Aufnahme des Bodenkriechens nach der Landung ist bei simuliertem Queue-Stau reproduzierbar. Eine blockierte Aufstehbewegung prüft die Standfläche sowie die wachsende Zwischenform und fällt kontrolliert in die Ausgangshaltung zurück.

Forest-Überlebensprobe mit World Seed `63`, Simulationsseed `421337`, 210 Ticks pro Lauf und identischer Startbelegung in jedem Dreiervergleich. Die Schaben sind aktiv simuliert. Die Fixture setzt sie direkt in die Welt. Bewegung, Angriffe, Schaden und Tod folgen dem Spielfluss. Die Taktiksequenz hält die Bodenlage bis Tick 173, damit Schüsse, Reload und Stim beobachtbar sind.

| Operatoren / aktive Gegner zu Beginn | Stand · Schaden / Überlebende | Hocke · Schaden / Überlebende | Dive und Bodenkampf · Schaden / Überlebende |
| --- | --- | --- | --- |
| 1 / 1 | 40 HP / 1 | 40 HP / 1 | 32 HP / 1 |
| 2 / 8 | 232 HP / 2 | 212 HP / 1 | 256 HP / 2 |
| 4 / 36 | 400 HP / 0 | 400 HP / 0 | 400 HP / 0 |
| 4 / 1.000 | 400 HP / 0 | 400 HP / 0 | 400 HP / 0 |

Beim Einzelgegner trafen vier von fünf gestarteten Angriffen in der Taktiksequenz, gegenüber fünf von fünf im Stand. Der Unterschied umfasst Position, Haltung, Waffen und Folgezustände. Im Acht-Gegner-Lauf erhielten die Operatoren in beiden Bodenhaltungen jeweils 96 HP und beim Aufstehen insgesamt 56 HP Schaden. In den zwei hohen Laststufen unterlag diese feste Sequenz in allen drei Varianten. Bestätigte Treffer im Dive und beim Aufstehen wurden zusätzlich als gezielte Kontaktfälle getestet. [Weltidentitäten, Zustandszähler, Treffer und Datenmengen](playtest/7-9c/server-movement.json)

## 7. Treffer- und Kollisionsvalidierung

- Der Bewegungskollider, Friendly-Fire-Trefferzylinder, Schadenszonen am Boden und Kamerakollision wurden getrennt geprüft. Schüsse und Schabenangriffe lesen den Serverzustand. Die autoritative Flugbox folgt X, Y, Z und dem gespeicherten Körper-Yaw. Kopf, Torso und Beine in den Bodenhaltungen folgen dem Gelände. Der Aufstehkollider interpoliert über den bestätigten Fortschritt.
- Ein Treffer im oberen Standvolumen wird während der Dive-Vorbereitung verarbeitet. Friendly Fire trifft im Flug und in der interpolierten Aufstehform aus beiden Bodenhaltungen. Verbindliche Schabenangriffe treffen während der Vorbereitung, im Flug und beim Aufstehen. Ein Granatentreffer im Flug und tödlicher Schaden in beiden Übergängen sind weiterhin abgedeckt. Der bestehende Spawn-Schutz endet beim akzeptierten Dive.
- Die Kamera und das Reticle verwenden die bestehende räumliche Kollisions- und Zielprüfung. Geprüft wurden Überhänge, niedrige Haltungen bei steilem Pitch auf vier Heightfields, Kameraeigenschaften über einen Haltungswechsel, reduzierte Bewegung und der Mündungspfad gegen Deckung und Boden. Die neue Waffenpose zeigte bei −8 und +8 m im Vergleich dieselbe gültige Zielrichtung.

## 8. Multiplayer und Netzwerk

| Probe | Ergebnis |
| --- | --- |
| 1–4 Operatoren | Unabhängige Uhren und Haltungen, Sync der Platzierung und Aktionen, vier reale Colyseus-Verbindungen. Die fünfte Verbindung wird abgewiesen. |
| Prediction und Reconciliation | Der Client spielt offene Inputs nach dem autoritativen Tick und ACK erneut ab. Tests prüfen Replay von Dive, Slide, Kriechen und Aufstehen, Rollback für abgelehnte Inputs und Abbruch veralteter Life-Inputs. |
| Impairment | Je 375 Ticks mit vier Clients bei LAN, WAN, hoher Latenz, geordnetem Jitter mit 300-ms-Stau und fehlerhaften Snapshot-Streams. Im Stau sechs Korrekturen bis 1,55 cm, sonst keine. Der Drop-/Replay-Fall ließ 108 Anwendungssnapshots aus und wies 192 doppelte oder veraltete Pakete ab. Kein Snap. Ein echter Colyseus-Lauf verwendete zusätzlich 140 ms simulierten RTT. |
| Remote und Reconnect | Remote-Pose rekonstruiert Dive, Kollision und Landung über ausgelassene Snapshots. Beim Aufstehen ist die Position fixiert. Tests prüfen Wiederverbindung in Bauchlage, im Dive mit bestätigtem Aufprall und im Aufstehen aus Rückenlage. Der Missionsreconnect am Gegnerlimit und die Deduplizierung von Ereignissen bestanden. |

Die Client-Impairment-Probe unterdrückt und dupliziert Anwendungssnapshots. Der WebSocket-Test simuliert RTT. Physischer Paketverlust am Netzwerkinterface war nicht Teil der Messung.

## 9. Planet und Missionsabschluss

| Planet / World Seed | Kollision in eigener Testprobe | Vollständige automatisierte Missionspfade |
| --- | --- | --- |
| Green Plains / 76 | Fels | Relay Chain, vier Operatoren, Ballon. Separater Solo-Nest-Purge auf Seed 17. |
| Desert / 31 | Pfeiler des Steinbogens | Relay Defense, ein und vier Operatoren, Albatross. |
| Ice / 48 | Eis-Solid | Relay Defense, ein und vier Operatoren, Albatross. |
| Forest / 63 | Baum | Relay Defense, ein und vier Operatoren, Albatross. Der Viererpfad prüft Rückwärtsdive aus dem Marsch, einen bestätigten Schuss in Rückenlage, explizites Aufstehen, ein reguläres Missionsziel und die anschließende Extraktion mit geducktem Operator. |

Die vier Kollisionsproben prüfen die Höhenlage bei jedem Servertick bis nach Kriechen und Aufstehen. Open-Field-Probes auf denselben Seeds enthalten 1, 2, 3 und 4 Operatoren. Je Operator sind sieben Schüsse, ein Magazinwechsel, ein Stim und ein vollständiges Aufstehen bestätigt. Der Weltgenerator hat Version `1`. Die Standard-Missionspfade nutzen die generierten Welten mit autoritativem Deployment, Interaktionen und Ergebniszustand. Automatisierte Erfolgswege dauern abhängig von Plan und Extraktion unterschiedlich lang. Eine repräsentative 20–30-Minuten-Mission mit menschlichem Team bleibt offen.

## 10. Leistung und Laufzeitmessung

Gemessen auf AMD Ryzen 7 9700X mit 16 logischen CPUs, Linux 7.3.3-300.fc45.x86_64 und Node 24.18.0. Die Browser-Probes nutzten den Produktionsbuild, Chromium 153.0.8010.12 und ANGLE mit SwiftShader. Im Forest-Probe renderte ein Client bei 800 × 450 im Profil Medium. Drei SDK-Clients steuerten die übrigen Operatoren über Loopback. GPU-Beschleunigung auf Zielhardware war in der Messumgebung nicht verfügbar.

| Lauf | Gemessene Ergebnisse |
| --- | --- |
| Isolierte Komponenten, 2.400 Frames bei virtuellen 120 Hz | P95 vorher → nachher. Physik für vier Operatoren 0,0113 → 0,0127 ms, Pose 0,0142 → 0,0135 ms, Kamera 0,0046 → 0,0044 ms. Der Komponentenlauf verwendet das bestehende Bodenbruch-Szenario ohne Renderer. |
| Arena, vier Operatoren, Seed 421337, 900 Messticks | 609–1.000 tatsächlich simulierte Schaben im 1.000er-Preset. Step-P95 0,726 → 0,719 ms, P99 0,763 → 0,758 ms. 20 Dives, 453 Schüsse und 90 Kills in beiden Läufen. Maximal 10.156 Byte je Horde-Frame, 3.319 Byte Player-JSON, zusammen ca. 138,6 KiB/s auf Nutzdatenebene. |
| Forest, gepaarte Serverprobe, Seed 63, 210 Ticks | Vier Operatoren, taktischer Verlauf, 997–1.000 aktive Schaben, 32 Ticks am Cap. Step-P95 0,632 ms, P99 0,820 ms. Gemessene Bewegungsverarbeitung Ø 0,00145 ms pro Tick. Horde + Player-JSON ca. 137,1 KiB/s Nutzdaten je Empfänger. Prozess-RSS am Ende 118,3 MiB. |
| Forest, 30 s Browser- und Loopback-Last | World Seed 76, Mission Seed 0, Schwierigkeit FREEFALL, Bodenmist in der Morgendämmerung. 994–1.000 aktive Schaben, 899/903 Ticks mit 1.000, 0 verworfene Simulationsschritte. Server-Step Ø 0,878 ms, P95 1,935 ms, P99 3,419 ms, Max. 12,885 ms. Browser 22,1 FPS, Frame-P95/P99 83,3/83,4 ms. HUD ca. 133,01 kB/s. Node-RSS inklusive Browsersteuerung 746,1 → 801,6 MiB. |

Im 30-s-Fenster bestätigte der Server 16 vollständige Dives mit 80 m Gesamtstrecke, je acht Landungen in Bauch- und Rückenlage, 14 abgeschlossene Aufstehvorgänge sowie 92 bzw. 94 Schüsse aus den Bodenlagen. Es gab 476 Schüsse insgesamt, drei Explosionen und bestätigten Friendly Fire. Zwei Operatoren starben in den Bodenhaltungen. Der Kameraclient sah bestätigte Treffer und den Missionshinweis. Waffen-Audio meldete 45 lokale und 315 entfernte Samples. Schaben-Nahkampftreffer waren in diesem Browserfenster null. Die gepaarte Serverprobe und die Kontakt-Regressionen liefern die ergänzenden Schabentreffer unter Bewegung. [Forest-Browser-Rohdaten](playtest/7-9c/browser-forest.json)

Der 60/144-Hz-Motion-Benchmark erfasste je nach Abtastung 32,4/33,8 ms Median von Input bis zur ersten sichtbaren Bewegung. Der Chromium-Test beobachtete den autoritativen Dive 82 ms bzw. 85 ms nach Auslösung und die passende HUD-Bodenhaltung nach 967 ms bzw. 890 ms. Die Zeitstempel enthalten Playwright-Dispatch, Abfrageintervall und Software-Rendering. Die Serverlandung lag jeweils 23 Ticks nach Start. [Browser-Haltungs- und Missionsnachweise](playtest/7-9c/browser-presentation.json)

Die Serverbudget- und Netzwerkprobes haben für diesen Meilenstein ausreichenden Nachweis geliefert. Der Software-Renderer limitiert die Client-Bildrate in diesem Setup. Vier gerenderte Clients auf Zielhardware und der kombinierte Abnahmelauf von 7.9E stehen aus.

## 11. Ausgeführte Prüfungen

```bash
npm test
npm run typecheck
npm run build
npm run balance:check
npm run balance:trace
sha256sum --check docs/enemies/schabe/baseline.sha256
git diff --check

node --conditions=development --test --test-isolation=none --test-name-pattern='forest relay-defense.*4 operators' apps/server/test/procedural-mission.test.ts
node --conditions=development scripts/tactical-component-bench.ts
npm run benchmark -- 900 421337 4 tactical
node --conditions=development scripts/motion-bench.ts 60,144 lan,wan,jitter --json /tmp/freefall-79c-motion.json
node --conditions=development scripts/measure-tactical-movement.ts docs/playtest/7-9c/baseline-registry.json
```

Browser-Läufe mit den lokal installierten Playwright- und Chromium-Binaries.

```bash
export PLAYWRIGHT_MODULE=/home/edgar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/home/edgar/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
node --conditions=development scripts/playtest-tactical-presentation.mjs /tmp/freefall-79c-presentation-final

FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LIVE_MAX=1 \
FREEFALL_COMBAT_STEADY_POPULATION=1 FREEFALL_COMBAT_MOVEMENT=1 FREEFALL_COMBAT_LOAD=1000 \
FREEFALL_COMBAT_SAMPLE_MS=30000 \
node --conditions=development scripts/playtest-combat-presentation.mjs /tmp/freefall-79c-forest-final
```

`npm test` bestand mit **357 von 357 Tests**. TypeScript-Prüfung, Produktionsbuild, Registry-Prüfung, acht Gameplay-Traces und drei Schabe-Baseline-Hashes sind erfolgreich. Vite meldet den bestehenden Größenhinweis für den Hauptchunk. Automatisierte Netzwerk- und Browserläufe verwendeten lokale Loopback-Ports. **Manuelles Playtesting · NOT TESTED.**

## 12. Release-Gates

| Gate | Status | Nachweis |
| --- | --- | --- |
| C-G1 Repository-Audit | PASS | Quellpfade und Vorarbeiten für 7.1 bis 7.9B geprüft. |
| C-G2 Bewegungsbaseline | PASS | Zustände, Balancewerte, Hashes, Animationsbindung und ladbarer Snapshot dokumentiert. |
| C-G3 Eingabe | PASS | Konflikt-, Queue-, Richtungskanten-, Verzögerungs- und Transition-Probes ausgeführt. |
| C-G4 360°-Dive | PASS | Acht Richtungsbereiche, analoge Zwischenwinkel, Fixierung der Richtung und Landewahl geprüft. |
| C-G5 Bauchlage | PASS | Aim, Schuss, Reload, Stim sowie die drei gesperrten Aktionen serverseitig geprüft. |
| C-G6 Rückenlage | PASS | Rückwärtslandung, anhaltende Rückenlage, Schüsse, Reload, Stim und explizites Aufstehen geprüft. |
| C-G7 Aufstehen | PASS | Eingabe, Zeit, Freiraum, Abbruch sowie Schaben- und Friendly-Fire-Treffer in beiden Rise-Varianten geprüft. |
| C-G8 Haltungs-Hitboxen | PASS | Aktive Haltung, Vorbereitung, Flug, Landung, Bodenprofile und wachsende Rise-Box geometrisch validiert. |
| C-G9 Verwundbarkeit | PASS | Autoritative Treffer in Dive-Vorbereitung, Flug und Rise sowie Granatenschaden bestätigt. |
| C-G10 Kamera und Zielabgleich | PASS | Reales Browserfeuer aus beiden Bodenlagen, Terrain, Deckung, reduzierte Bewegung und vier Heightfield-Kameraprobes. |
| C-G11 Multiplayer | PASS | Reale Verbindungen, Replay, Remote-Darstellung, Snapshot-Drops und Wiederverbindung einschließlich 1.000er-Cap. |
| C-G12 Vier Planeten | PASS | Vier generierte Kollisionstests und abgeschlossene Missionspfade mit Original-Geometrie. |
| C-G13 Central Balance Registry | PASS | Baseline und Endstand `390e375eec0bf943`, acht gepinnte Gameplay-Traces. |
| C-G14 Überleben und Spielgefühl | NOT TESTED | Skriptierte Überlebensprobes liegen vor. Menschliche Vergleichsläufe und Feedback zur Bedienung und Fairness fehlen. |
| C-G15 Leistung | PASS | Komponenten, Headless-Server, 4-Operator-Loopback und real gerenderter Forest-Lauf gemessen. Zielhardware und 7.9E sind gesondert offen. |
| C-G16 Regression | PASS | Tests, Produktionsbuild, gepinnte Traces und geschützte Schabe-Dateien geprüft. |

**Technische Umsetzung verifiziert. Vollständige Abnahme offen, solange C-G14 aussteht.**

## 13. Offene Prüfungen und Playtest-Checkliste

- Je einen Solo- und einen Viererlauf von 20–30 Minuten mit gleicher Schwierigkeit und protokolliertem Welt- und Missionsseed durchführen. Pacing, Überleben, Zielarbeit und Extraktion festhalten. Testende bewerten direktes Feedback nach Tastendruck, Timing zum Vortrieb und die Verständlichkeit abgewiesener Aktionen.
- Alle Haupt- und Diagonalrichtungen aus Sprint, Stand und Hocke antesten. Auf Forest an einem Baum, auf Ice in einer Engstelle und in Desert am Steinbogen die Kontrolle bei Deckung, Kameradrehung und Abbruch vergleichen. Auf Green Plains auf offenen Hängen dieselben Aktionen wiederholen. Je Standort normalen und reduzierten Kameramodus prüfen.
- Unter einem Gegner, einer kleinen Gruppe und dichtem Druck Bauch- und Rückenlage separat ausprobieren. Treffer, Nachladen, Stim, Repositionierung und Zeitpunkt des Aufstehens erfassen. Dokumentieren, wann der Schaden durch verlorene Übersicht oder durch sichtbare Positionierung zustande kam. Subjektive Präzision, Nutzen und Fairness von Spielenden erfragen.
- Mit den echten Zielrechnern einen Vierer-Renderlauf durchführen und Inputgefühl, Framezeiten und Serverkorrekturen mit stabiler Verbindung sowie bei Jitter beobachten. Der aktuelle Browservergleich lief auf einer Software-GPU. Bewegungswirkung bei reproduzierbarem physischem Paketverlust und das kombinierte 7.9E-Lastprofil sind offen.
- Die vorhandene stehende Zylinderschnittregel und die fehlenden Produktionsclips bleiben als getrennte Verbesserungsmöglichkeiten dokumentiert. Der aktuelle Parser vergleicht Registry-Versionen. Für abweichende Client-/Server-Profile sind zusätzliche Vertrags- und Migrationsprobes nötig.

## 14. Prüfpunkte für Milestone 7.9D

| Thema | Aus 7.9C abgeleiteter Prüfpunkt |
| --- | --- |
| Solo-Schwierigkeit | Einzelkontakt, Alarm und größere Gruppe in vollständigen Solo-Missionen messen. Der Sieben-Sekunden-Einzelkontakt erlaubt keine Aussage über die langfristige Schwierigkeit. |
| Teamkoordination | Abdecken eines aufstehenden Operators, Kreuzfeuer und gestaffelte Repositionierung in zwei bis vier Personen beobachten. |
| Zieldruck und Pacing | Kontakt, Zielaktivierung, verteidigte Zeit und Wege ins Missionsprotokoll aufnehmen. Die Zeit unter Druck pro Rolle und Missionsphase vergleichen. |
| Nachschub | Verbrauch von Magazinen und Stims pro Phase erfassen und prüfen, wann sichere Interaktion am Albatross möglich ist. |
| Extraktion | Zeiten, Zugangswege und Team-Commitment beider Extraktionsmethoden bei verbleibenden Gegnern vergleichen. |
| Planeten | Gleiche Mission und Schwierigkeit auf offenen Hängen, an Engstellen und im Wald mit seedgebundenen Weg- und Ausfallmetriken vergleichen. |
