# Milestone 7.5 · Funktionsnachweis und Release-Gates

**Implementiert und automatisiert verifiziert. Formale Release-Abnahme offen.**

Auf der festen Bodenbruch-Oberfläche von Dev’ Ault stehen Nestjagd, Relaisverteidigung und Relaisverbund zur Auswahl. Der Host erzeugt einen gültigen Auftrag auf dem Carrier, prüft das gemeinsame Briefing und startet über die bestätigte Plan-ID. Nach der Rückkehr ist eine erneute Auswahl möglich. Operation Bodenbruch bleibt direkt auswählbar.

Der Server friert den Plan und die aufgelöste Balance vor dem Start ein. Drei vollständige Durchläufe mit regulären Gameplay-Eingaben belegten die Seeds **4**, **0** und **3** auf Normal. Beide Extraktionen, Nestzerstörung, Albatross-Nachschub, Relay-Zustände, Wiederholung, MissionResult und Carrier-Rückkehr wurden ausgeführt. Alle **512 von 512** Seeds führten zu gültigen Plänen. Der Vier-Peer-Netzwerktest bestätigte den gemeinsam gespielten Plan, gleichzeitige Interaktion und Reconnect. [Reproduktion und Einzelergebnisse](MISSION_REPLAYABILITY_TESTS.md)

## Release-Gates

| Gate | Status | Nachweis |
| --- | --- | --- |
| A · Deterministic Generation | PASS | Reproduzierbare IDs, Versionschecks, JSON-Roundtrip, 512 gültige Seeds und begrenzte Fehlerszenarien mit geprüftem Ersatzauftrag. |
| B · Planet Compatibility | PASS | Dev’ Ault mit vorhandener Szene und Inhalten. Navigation, Relais, Anker, beide Extraktionen und verfügbare Durchbruchregionen sind validiert. |
| C · Mission Playability | PASS | Drei vollständige Spieleingabe-Durchläufe. Chromium prüfte zusätzlich den Ablauf vom gemeinsamen Briefing bis zum Missionsresultat mit gestuftem Lastaufbau. |
| D · Cooperative Synchronization | PASS | Vier reale SDK-Peers mit identischer Plan-ID, gemeinsamer Zielzeit, simultaner Interaktion, Reconnect und identischem Resultat. |
| E · Mission Integration | PASS | Deployment, gebundenes Startnest, Convicts, Nachschub, geprüfter Director-Regionsfilter und effektive Balance, Albatross, Ballon, Fehlschlag und MissionResult. |
| F · Performance | BLOCKED | Reproduzierbare Einzelraum-Messungen liegen vor. Zielgeräte, verbindliche Budgetfreigabe und längerer Mehrraum-/WAN-Soak stehen aus. |
| G · Regression | PASS | 262/262 Tests. Build, TypeScript, Balance-Validierung und drei Schaben-Prüfsummen grün. Bestehende Bewegung, Kamera, Tastenbelegung, Gunplay, Horde-Kampf, Bodenbruch und beide Extraktionspfade abgedeckt. |
| H · Documentation | PASS | Architektur, Inhalte, Graph, Orte, Versionsregeln, Netzwerk, Wiederspielbarkeit und Abnahme dokumentiert. |

## Messwerte

| Profil | Kennzahl | Ergebnis |
| --- | --- | --- |
| Seed-Matrix, 512 Aufträge | Generierung P95 / P99 | 0,308 / 0,375 ms |
| Seed-Matrix | Validierung P95 / P99 | 0,168 / 0,211 ms |
| Erster Plan der Matrix | Generierung inklusive Geometrieaufbau / Validierungsanteil | 4,482 / 4,218 ms |
| Planserialisierung | JSON-Größe Ø / P95 / Maximum | 1.596 / 1.953 / 1.965 Byte |
| CPU-Cap, 1.000 aktive Gegner, vier Operatoren | Server-Tick P95 / P99, 360 Ticks | 2,077 / 3,664 ms |
| CPU-Cap | Zielupdate P95 / P99 | 0,00355 / 0,01037 ms |
| CPU-Cap | Node-RSS und Heap vor → nach | 101,6 → 113,6 MiB RSS, 15,7 → 18,5 MiB Heap |
| Chromium, vier Ansichten, 1.000 aktive Gegner, 12 s | Server-Tick P95 / P99 | 1,650 / 1,858 ms, 0 verworfene Ticks |
| Chromium bei 1.280 × 720 Medium auf RX 9070 XT | Langsamste Ansicht, Frame P95 / P99 | 16,8 / 16,8 ms bei rund 60 FPS |
| Chromium, pro Client | Missionsnachrichten | 1.485 Byte Plan einmalig, 13.404 B/s Missionszustand und rund 5 B/s Missionsereignisse im Messfenster |
| Chromium, pro Client | Horden-Nutzdaten | 100.681 B/s bei 10,06 Paketen/s |
| Chromium-Harness | Node-RSS vor → nach, inklusive Vite und Testharness | 658,8 → 674,2 MiB |

Der Browser-Lauf nutzte Seed 0, Vorlage Relaisverteidigung, Schwierigkeit FREEFALL und Plan-ID `generated.6c6b39b2d2a40983`. Danach bestätigten alle vier Browser das Resultat mit einem per Albatross extrahierten Operator. Die CPU-Cap-Messung verwendete denselben Plan und hielt 1.000 aktive Gegner bis zur Extraktionsfreigabe. Das technische 30-Hz-Tickfenster beträgt 33,33 ms. Für eine Freigabe von Produktions-RSS und Bandbreite sind ein isolierter Serverprozess sowie die vollständigen Transportdaten über mehrere Räume erforderlich. [Messmethodik und Befehle](MISSION_REPLAYABILITY_TESTS.md)

## Offene Spielabnahme

Menschlicher Vierertrupp sowie Balance der Ballonverteidigung auf dem östlichen Vorfeld sind **NOT TESTED**. Eine längere Mehrraum-/WAN-Messung und die Freigabe von Hardware und Budgets fehlen für Gate F. Bei der ersten Regression trat ein Timeout im bestehenden 1.000er-Reconnect-Test auf. Die folgenden vollständigen Durchläufe bestanden. Der Build meldete die bestehende Vite-Warnung für das minifizierte Hauptbundle über 500 kB. Die ausgeführten Nachweise zeigten am finalen Stand keinen reproduzierten P0- oder P1-Fehler.

Als nächster Schritt eignen sich ein menschlicher Vierer-Durchlauf je Ballonort und ein Vergleich der Zeit bis zur ersten Verstärkung bei aktivem Modifier. Danach folgen Zielgeräte-Messung und Mehrraum-Soak mit derselben Profil- und Balance-Version. Für eine weitere feste oder generierte Welt braucht es eine registrierte Szene, kollidierendes Terrain, Höhen- und Navigationsdaten, stabile Regions- und Location-IDs sowie ein Streaming-Konzept für Deployment bis Extraktion. [Planetprofile](PLANET_PROFILES.md) · [Geometrieadapter](MISSION_LOCATION_VALIDATION.md)

## Geänderte Dateien für 7.5

- Shared Contracts und Daten · `packages/shared/src/contracts/{mission,missionPlan}.ts`, `definitions/{missions,proceduralMissions}.ts`, `balance/{index,definitions}.ts`, `balance/data/swarm.json` und `index.ts`.
- Server · `apps/server/src/mission/{MissionGenerator,MissionLocations,MissionInstance,ObjectiveManager,EncounterDirector,ExtractionSystem}.ts` und `rooms/FreefallRoom.ts`.
- Client · `apps/client/src/game/Game.ts`, `networking/Match.ts`, `rendering/mission/{MissionEnvironment,MissionMarkers}.ts`, `ui/{App,CarrierConsole,MissionHud}.tsx` und `ui/styles.css`.
- Tests und Harness · `apps/server/test/{procedural-mission,multiplayer}.test.ts`, `scripts/playtest-horde-director.mjs` und `scripts/playtest-ms6.mjs`.
- Dokumentation · [Architektur](MISSION_SYSTEM_ARCHITECTURE.md), [Generator](PROCEDURAL_MISSION_GENERATION.md), [Seeds und Versionen](MISSION_SEEDING_AND_VERSIONING.md), [Vorlagen](MISSION_TEMPLATES.md), [Zielgraph](OBJECTIVE_GRAPH.md), [Profile](PLANET_PROFILES.md), [Standorte](MISSION_LOCATION_VALIDATION.md), [Koop](COOP_MISSION_SYNCHRONIZATION.md), [Spiel- und Replay-Tests](MISSION_REPLAYABILITY_TESTS.md) und diese Abnahme.
