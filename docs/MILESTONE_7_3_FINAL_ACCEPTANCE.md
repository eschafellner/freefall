# FREEFALL · Abnahme Milestone 7.3E

**Gesamtstatus BLOCKED.** Die funktionale und technische Prüfung ist erfolgt. Die Vier-Client-Sichtprüfung auf Zielhardware und die Freigabe der Performance-Budgets stehen aus. Stand 19. November 2026, Arbeitsstand auf `4daf04e`, Balance `4c6c58ca54715f11`.

## Integrationsaudit 7.3A–D

| Funktion | Status im Abnahmestand | Implementierung | Befund, Priorität und Testabdeckung | Folgemaßnahme |
| --- | --- | --- | --- | --- |
| 7.3A Standing, Crouching, Rutschen | VERIFIED | `shared/config/posture.ts`, `postureGeometry.ts`, `Battlefield.ts` | Haltungsbefehle, Geschwindigkeiten, Übergangstakt, Rutschanlauf, Sweep, Cooldown, Kollision und Aufrichten automatisiert. Hocke zusätzlich mit Browser-Eingabe | — |
| 7.3B 360°-Dive | VERIFIED | `shared/config/dive.ts`, `posture.ts`, `client/game/Prediction.ts` | Kardinal-, Diagonal-, Analog- und Neutralrichtung, kamerarelative Normalisierung, bestätigte Körperachse, stabile Zielhaltung, Tiefe und Landetick. Kontakt mit dünner Wand, Überhang und Tether. Feuer und Explosionen können im Flug Schaden verursachen | — |
| 7.3C PRONE, SUPINE und GETTING_UP | VERIFIED | `posture.ts`, `postureGeometry.ts`, `systems/combat.ts`, `systems/grenades.ts` | Für beide Haltungen Kriechtempo und Grundkontakt, Körperschwenk, Aktivierung und Dauer des Get-ups geprüft. Blockierter Freiraum und nachträglich auftauchender Solid werden pro Tick geprüft. Tod setzt Übergänge zurück. Beide Bodenhaltungen bleiben bis zur nächsten gültigen Aktion bestehen | — |
| 7.3C Waffen und Ausrüstung | VERIFIED | `systems/combat.ts`, `systems/equipment.ts`, `simulation/Player.ts`, `combat/handling.ts` | Primär- und Sekundärfeuer, Aim und Recoil, Waffenwechsel, Magazinverlust und Reserven, Stim und Friendly Fire geprüft. Granaten und Melee sind am Boden gesperrt. P1-Fix an der Lebensgrenze verhindert alte Waffenaktionen | — |
| 7.3C Collider, Mündung und Schabe-Angriffe | VERIFIED | `postureGeometry.ts`, `worldGeometry.ts`, `systems/combat.ts`, `systems/grenades.ts` | Haltung, Höhe, Orientierung und Kopf-/Rumpfzonen werden getrennt geprüft. Treffer, Überflug, Bodenkontakt, Deckung, gültiger Schabe-Kontakt und Fehltreffer geprüft. Drei Schabe-Dateien stimmen mit den freigegebenen Prüfsummen überein | — |
| 7.3D prozedurale Darstellung und Clip-Fallback | VERIFIED | `rendering/characters`, `rendering/AssetRegistry.ts` | Mapping, Blend, Maskierung, fehlende Tracks, Root-Motion-Schutz, Abbruch und Taktung automatisiert. Browser-Smoke auf der Missionsoberfläche mit beiden Bodenposen und Tracern. Frameweise Prüfung aller Varianten und der Remote-Perspektiven ausstehend | Kontaktpunkte an Deckung auf Zielhardware prüfen |
| 7.3D exportierte Produktionsclips | MISSING | `rendering/characters/animation`, `AssetRegistry.ts` | P2. Vertrags- und Retargeting-Tests verwenden Testdaten. Für das Produktionsrig sind lizenzierte, kompatible GLBs und visuelle QA offen. Der Runtime-Playtest nutzt die mitgelieferten prozeduralen Posen | [Asset-Inventar](ANIMATION_ASSET_INVENTORY.md) pflegen und Pilotclips am Zielrig prüfen |
| 7.3D Kamera und Konfiguration | VERIFIED | `ThirdPersonCamera.ts`, `CameraPreferences.ts`, `Bindings.ts`, `DesktopInput.ts`, `ControlSettings.tsx` | Kameraoffsets und Hindernisklemmung, Rückwärtsblick, reduzierte Bewegung und variable Framezeiten automatisch geprüft. Persistenz, Konflikt, Reset, Menü, Fokusverlust und Analogwerte in der Input-Suite. Playtest verwendet Standardtasten | Optischer Test über längere Spielsitzungen auf Zielhardware |
| Multiplayer-Zustand und Recovery | VERIFIED | `FreefallRoom.ts`, `networking/input.ts`, `snapshots.ts`, `Game.ts`, `Timeline.ts`, `Prediction.ts`, `RemoteInterpolation.ts` | Vier reale Sockets und fünf virtuelle Profile. P1-Fix für ältere Zustände, P2-Fix für Bewegungsstopp zwischen Landung und Aufrichten. Wiederverbindung mit laufendem Übergang und Waffenstatus geprüft. Join-in-Progress bei laufender Mission gesperrt | Vier gerenderte Perspektiven und reale Netzstörung abnehmen |
| Operation Bodenbruch | VERIFIED | `mission/MissionInstance.ts`, `ExtractionSystem.ts`, `ObjectiveManager.ts`, `EncounterDirector.ts`, `Convicts.ts`, `Resupply.ts` | Deployment, Relais, Nest-Aufbau und -Zerstörung, Convict-KI, Nachschub, beide Extraktionen und MissionResult geprüft. P1-Fix für Extraktionshaltung | Abnahme durch vier menschliche Spieler auf Zielhardware |

Die Kollisionswelt verwendet einen ebenen Gameplay-Boden. Die sichtbare Landschaft umfasst Dekoration und unpassierbare Geometrie. Gegenseitiges Passieren von Operatoren gehört zum bestehenden Controller. Höhe, Körperwinkel und seitlicher Ausschlag werden an Welt-Solids geprüft. [Charakterkollision](CHARACTER_COLLISION.md)

Die Balanceprüfung bestätigte 5 m Dive-Strecke bei 23 Ticks Gesamtdauer, 36 Ticks Cooldown, Kriechmultiplikatoren 0,25 und 0,20, Hocke 0,55 und Get-up nach 24 bzw. 30 Ticks. Die Zahlen stammen aus der veröffentlichten und validierten Registry. Die Waffen-, Heilungs- und Gegnerwerte wurden in diesem Arbeitsschritt beibehalten.

## Zentrale Fehlerliste

| Priorität | Befund | Ergebnis und Absicherung |
| --- | --- | --- |
| P1 | Gültig sequenzierte Eingaben eines alten Lebens konnten Blick und gehaltenes Feuer aktualisieren. Gehaltener Abzug konnte im Respawntick einen Schuss auslösen | Behoben. Sequenzfortschritt und aktive Eingabe getrennt. Regression prüft Respawntick, späte Pakete, Duplikate, Aim, Feuer, Reload und Slot. Nur der deterministische Arena-Fingerabdruck wurde mit dem beabsichtigten Verhalten aktualisiert. Alle sieben Missions-Fingerabdrücke blieben identisch |
| P1 | Die Extraktion ließ Operatoren im Dive, in Bodenhaltung, beim Rutschen und beim Aufrichten sichern oder übernehmen | Behoben. Stehen oder Hocke mit Bodenkontakt bei Anforderung, Sicherung und Lift. Beide Routen prüfen Ablehnung, Sicherung, Pickup und korrekte Belohnung |
| P1 | Ein veralteter Snapshot konnte trotz Ablehnung durch die Timeline auf lokale Prediction, HUD und Zustandswechsel wirken | Behoben. Annahme eines neueren Serverticks vor Reconciliation und Aktualisierung des HUDs. Regression prüft ältere und doppelte Snapshots, virtuelles Replay und Konvergenz |
| P2 | Ein Snapshot-Abstand über Landung und Get-up verteilte Positionsänderungen bis in das Aufstehen | Behoben. Interpolation stoppt am Aufstehtick, inklusive extrapolierter Anzeige. Regression für die Lücke und Endposition |
| P2 offen | Hochwertige lizenzierte Produktionsclips und frameweise Boden-/Handkontakt-Abnahme stehen aus | Prozedurale Posen sind integriert und als Fallback geprüft. Produktionsclips zuerst für den Rückwärts-Dive und die Rückenlandung validieren |

In den ausgeführten Szenarien sind keine bestätigten P0- oder P1-Fehler offen. Zusätzlich wurde keine eigenständige P3-Regression erfasst. Bekannte Reichweiten der Prüfung stehen in den Gates und Playtest-Schritten.

## Durchläufe und Nachweise

| Durchlauf | Besetzung und Methode | Ergebnis |
| --- | --- | --- |
| Normal, Operation Bodenbruch | 1 Operator, echte Spieleingaben in fester Server-Zeit, reguläres Boarding und Relais | Albatross, 1 extrahiert, korrekter MissionResult, Rückkehr zum Carrier |
| Normal, Operation Bodenbruch | 2 Operatoren, gleicher Testaufbau, reguläres Zusammenführen am Rettungspunkt | Ballon, 2 extrahiert, Rückkehr zum Carrier |
| Normal, Operation Bodenbruch | 4 Operatoren, gleicher Testaufbau, alle bereit, gesichert und im Ergebnis erfasst | Albatross, 4 extrahiert, Rückkehr zum Carrier |
| FREEFALL, Operation Bodenbruch | 4 Testoperatoren, beschleunigte Platzierung, Schutz und ständige Nachfüllung | Ballon, 4 extrahiert, 1.000 Gegner in 2.822 von 2.850 Extraktionsticks, Rückkehr zum Carrier |
| Chromium, FREEFALL | 1 Browser und 3 SDK-Slots, Flug und taktische Eingaben regulär, Ziele und Rettungsjäger per Testtreiber, reale Gegnersimulation unter Last | Beide Landungen, Kriechen, Schuss und Get-up geprüft. Ballon und Rettungsjäger bis MissionResult und Carrier durchgespielt. Der Browser-Operator wurde extrahiert |

Der Vier-Socket-Test prüft gemeinsames Ducken, vier Dives, beide Landungen, Kriechen, gleichzeitiges Feuer und Reloads sowie Get-up. Der Loopback-Reconnect stellt Session, Position, Haltung, Waffenstatus und Transitionstakte wieder her. Die deterministischen Profile konvergierten auch bei hoher Latenz, Jitter, Stau und verzögerten Duplikaten. Lokale Eingaben bewegen die Clientfigur vor der Serverbestätigung. [Multiplayer-Stresstest](MULTIPLAYER_STRESS_TEST.md) · [Netzwerk-Reconciliation](NETWORK_RECONCILIATION.md)

Im Ground-Lastlauf mit vier lebenden Operatoren und bis zu 1.000 Gegnern lag der Server-Tick bei 0,285 ms P95. Bei beschleunigter Vier-Operatoren-Ballonextraktion lag er bei 0,411 ms P95. Der Browser-Benchmark auf SwiftShader erfasste bei 1.000 aktiven Gegnern 7,75 FPS und 250 ms Frame P95. Die CPU-Stichproben konzentrierten sich auf Horde-Steering. Ein A/B-Versuch am Steering brachte keine belastbare Verbesserung und wurde zurückgenommen. WebGL, Speicher, Payload, Messmethoden und Budgetvorschläge stehen im [Performance-Benchmark](PERFORMANCE_BENCHMARK_7_3.md).

## Release-Gates

| Gate | Status | Nachweis und ausstehende Arbeit |
| --- | --- | --- |
| A · Functional Correctness | PASS | Haltungen, 360°-Dive, Landung, Bodenkampf, aktives Aufstehen und Serverfreigaben mit automatisierter Suite und Browser-Smoke geprüft |
| B · Physics & Damage | PASS | Analytische Körperprofile, Schadensfläche, Weltgeometrie, Treffer im Flug und beim Aufstehen, Schabe-Kontakt und Deckung im Spielmodell geprüft |
| C · Multiplayer | NOT TESTED | Vier WebSocket-Operatoren, Prediction, Reconciliation und Reconnect bestanden. Zielhardware-Aufzeichnung der Remote-Darstellung aus vier gleichzeitig gerenderten Blickwinkeln und reale TCP-Störung unter Last sind offen |
| D · Mission Integration | PASS | Vollständige Eingabeläufe mit 1, 2 und 4 Operatoren, beide Extraktionssysteme, aktive Missionssysteme und Rückkehr. Separater Sättigungslauf und Chromium-Smoke |
| E · Performance | BLOCKED | Reproduzierbare 1.000er-Messungen vorhanden. Freigegebene Projektbudgets, Hardware-WebGL-Messung mit vier gerenderten Clients und Langzeitprofil nach Reconnects stehen aus |
| F · Regression & Build | PASS | Produktionsbuild, TypeScript, Balance-Check und 195 automatisierte Tests. Keine bestätigten offenen P0/P1 in der geprüften Suite |
| G · Documentation | PASS | Integrationsaudit, Fehlerliste, Profile, Messwerte, Playtest, Reproduktionsschritte und offene Freigaben dokumentiert |

Ein offenes Gate blockiert die vollständige Abnahme. Die offenen Schritte sind eine vollständige Bodenbruch-Partie mit vier gerenderten Clients und Netzstörung, die Messung auf Zielhardware samt Budgetfreigabe und die Produktionsclip-Prüfung. Die automatisierten Sollwerte und Proben stehen im [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md) und im [Performance-Benchmark](PERFORMANCE_BENCHMARK_7_3.md).

## Änderungen dieses Arbeitsschritts

| Bereich | Dateien |
| --- | --- |
| Server | `simulation/{Player,Battlefield,FixedLoop}.ts`, `mission/{MissionInstance,ExtractionSystem}.ts`, `rooms/FreefallRoom.ts`, `benchmark.ts` unter `apps/server/src` |
| Gemeinsame Haltung | `packages/shared/src/config/posture.ts` |
| Client | `game/{Game,Timeline,RemoteInterpolation}.ts`, `networking/Match.ts` unter `apps/client/src` |
| Regressionen | `apps/server/test/{balance,mission,multiplayer,review-fixes}.test.ts`, `apps/client/test/{tactical-movement,tactical-network}.test.ts` |
| Testtreiber | `scripts/playtest-ms6.mjs` mit taktischen Prüfungen und dynamischen lokalen Ports, `scripts/tactical-component-bench.ts` für isolierte CPU-Messung |
| Dokumentation | `docs/{TACTICAL_MOVEMENT,POSTURE_STATE_MACHINE,CHARACTER_COLLISION,CHARACTER_ANIMATION,TACTICAL_CAMERA,INPUT_REBINDING,PRONE_SUPINE_COMBAT,TACTICAL_MOVEMENT_PLAYTEST,NETWORK_INTERPOLATION,MULTIPLAYER_STRESS_TEST,NETWORK_RECONCILIATION,PERFORMANCE_BENCHMARK_7_3,MILESTONE_7_3_FINAL_ACCEPTANCE}.md` |
