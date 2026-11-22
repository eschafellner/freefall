# FREEFALL 7.9E · Integration und Release-Abnahme

## 1. Ergebnis

**NOT ACCEPTED – FAILURES / INCOMPLETE EVIDENCE / BLOCKED.** Die technische Integration wurde erneut geprüft. 357 Regressionstests, 77 vollständige serverseitige Missionsabläufe und ein kombinierter Waldlasttest liegen vor. Das autoritative Gegnerlimit von 1.000 wurde wiederholt erreicht. Die regulären Missionsläufe dauerten 58,2–223,3 Sekunden. Der technische Nachweis für die angestrebte Missionsdauer von 20–30 Minuten fehlt. Menschliche Spiel- und Hörtests sowie die Freigabe der Performance-Zielgeräte und Grenzwerte stehen aus.

## 2. Prüfstand

- Basisrevision `ffc81913055f9673ffb55fa027b7488ef0ec9d71` plus lokale Vorarbeiten 7.9A–D. Build `0.1.0`, TypeScript `7.0.2` mit ES2023, Strict Mode und getrennten Workspace-Konfigurationen. Serverstart standardmäßig auf `127.0.0.1:2567`, Laufzeittests mit temporären Loopback-Ports und lokalem Fixture-Raum. Client über Vite-Produktionsbuild und Preview. [Ausgangsstand](playtest/7-9e/baseline-source.sha256) · [Geprüfter Quellstand](playtest/7-9e/tested-source.sha256) · [Befehle](playtest/7-9e/README.md)
- Registry 7.9B, Schema 2, Hash `390e375eec0bf943`. Der eingefrorene Snapshot ist bytegleich zur Basis aus 7.9D, SHA-256 `399f66da5d661cadb8c2edbfe691a2fb60aa6b15fde5521fa5f04c871e170390`. Weltgenerator, Missionsgenerator, Weltformat, Planetenprofil und Umgebungskatalog jeweils v1. Der Audio-Katalog nutzt das datierte Quellen- und Mastermanifest. [Registry-Snapshot](playtest/7-9e/balance.json) · [Audio-Master](audio-masters.json)
- Derselbe Rechner diente als Server und Client. Fedora Linux 45 x64, Kernel `7.3.3-300.fc45.x86_64`, Ryzen 7 9700X mit 8 Kernen und 16 Threads, 62,4 GiB RAM, Radeon RX 9070 XT, Node `24.18.0`, Chromium `153.0.8010.12`. Native Waldmessungen mit ANGLE/OpenGL, Medium und 800 × 450 CSS-Pixeln. Der Audio-Funktionslauf nutzte SwiftShader. Simulation 30 Hz, Spieler/Horde/Mission 20/10/5 Hz. Messfenster und abweichende Bedingungen stehen bei den Szenarien.

## 3. Integrationsmatrix

| Phase | Im aktuellen Quellstand geprüft | Befunde und bisherige Gates |
| --- | --- | --- |
| 7.6 | `WorldGenerator`, `PlanetProfiles`, `GroundNavigation` und Client-Terrain. Erneut 400 gültige generierte Welten mit Missionsvalidierung, Geländegrenzen und Waldkollision. | Der historische technische Nachweis bleibt für die geprüften Pfade reproduzierbar. Reguläre menschliche Missionen waren offen. [7.6-Bericht](MILESTONE_7_6_FINAL_ACCEPTANCE.md) |
| 7.7 | `MissionAtmosphere`, `ArenaView`, `AudioAssets` und Soundscape. Wetterübergänge, Ressourcenfreigabe und netzwerkgeteilte Atmosphären über aktuelle Tests geprüft. | Der historische Hör- und Zielgeräteblocker bleibt relevant. [7.7-Bericht](MILESTONE_7_7_FINAL_ACCEPTANCE.md) |
| 7.8 | `Game`, `Match`, `VisualEffectsManager`, bestätigte Treffer und Missionspräsentation. Vierer-Reconnect und Browserproben zu Duplikat und ausgelassenem Blast. | Frühere P1 bei Ereignispfaden regressionsgeprüft. FF78E-6 betrifft weiter Zielgeräte und Client-Budgets. [7.8-Bericht](MILESTONE_7_8_FINAL_ACCEPTANCE.md) · [Fehlerliste](MILESTONE_7_8E_BUG_REPORT.md) |
| 7.9A.1 | `WeaponAudioCatalog`, `WeaponAudio`, `AudioEngine`, Quellen- und Mastermanifest. Native Audio-API im Produktionsclient, Hashes und Codecs für alle 26 Dateien geprüft. | Technische Waffenabdeckung bestätigt. Subjektive Abnahme und Firefox/WebKit offen. [7.9A.1-Bericht](WEAPON_AUDIO_7_9A.md) |
| 7.9A.2 | `combat`, `equipment`, `telemetry`, Snapshot und beide Waffenprofile. Aktuelle Schießstand-, Ressourcen- und Regressionsläufe. | Range-Werte und Ressourcenverhalten reproduziert. Menschlicher Vergleich und Langzeitökonomie offen. [7.9A.2-Bericht](COMBAT_BALANCE_7_9A_2.md) |
| 7.9B | `Battlefield`, `EnemyCombat`, `EnemyNavigation`, `PatrolManager`, `SpawnManager`, `HordeDirector`. Sechs Waldlaststufen und kompletter Director-Phasenverlauf gemessen. | B-G14 war offen. Engstellen, hoher Druck und Übergänge in RECOVERY bleiben Beobachtungspunkte. [7.9B-Bericht](MILESTONE_7_9B_REPORT.md) |
| 7.9C | `movement`, `posture`, Hitbox-Auflösung, `Prediction`, `RemoteInterpolation`, `TacticalCamera`. Autoritative Haltungen, Treffer und Reconnect erneut geprüft. | C-G14 Spielgefühl offen. Haltungsbezogene Schäden und Eingabesynchronisierung technisch bestätigt. [7.9C-Bericht](MILESTONE_7_9C_REPORT.md) |
| 7.9D | `MissionGenerator`, `MissionInstance`, `MissionTelemetry`, `ObjectiveManager`, `Convicts`, `Resupply`, `ExtractionSystem`. 77 Ergebnisse, beide Extraktionswege und Rückkehr über mehrere Einsätze geprüft. | D-G4 erneut verfehlt. D-G6 und D-G16 benötigen menschliche Stichproben. [7.9D-Bericht](MILESTONE_7_9D_REPORT.md) |

## 4. Änderungen in 7.9E

- `scripts/playtest-combat-presentation.mjs` erfasst aktive Schaben pro ausgeführtem Tick, AI-/Navigationskosten, Gegnerbewegung, Zielauswahl, WebSocket-Hordenbytes und Audiotelemetrie. Der optionale Waldablauf führt Nachschub, Relaisverteidigung und Ballonstart über echte Operator-Nachrichten bei laufender Last aus.
- `scripts/measure-mission-balance.ts` kann reguläre Routen in derselben Missioninstanz wiederholen. Der Modus prüft eindeutige Ergebnisse, Rückkehr zum Carrier, Bereinigung von Gegnern, Granaten, Plan, Extraktion und Telemetrie sowie die fortbestehenden Operator-Identitäten. Er erfasst Speicherwerte nach jeder Rückkehr.
- Der erste kombinierte Lauf brach bei der Nachschubprüfung ab. Der Testoperator brauchte fortlaufende neutrale Eingaben, damit der Server seine Interaktion abschließen konnte. Der korrigierte Test wiederholte die Sequenz vollständig. Der fehlgeschlagene Ablauf und seine Rohdaten sind erhalten. [Erster Versuch](playtest/7-9e/forest-attempt.txt) · [Erster Messdatensatz](playtest/7-9e/forest-attempt.json) · [Wiederholung](playtest/7-9e/forest-combined.json)
- `README.md` verlinkt die Abnahme und die Reproduktionsbefehle. Der Vergleich der Quellmanifeste zeigt Änderungen an genau zwei Testwerkzeugen. Die geschützten Schaben-Quellprüfsummen stimmen. Zusätzliche Assetkosten 0 €.

## 5. Balance und Ressourcen

| Bereich | Geprüfte Baseline |
| --- | --- |
| Kestrel AR-01 | 24 Schaden, 10 Schuss/s, 72 m, 45 Schuss und acht Reservemagazine, Reload 2,10 s, Basis-Rückstoß 0,36° Nick/0,22° Gier vor Dauerfeueranstieg |
| P-01 | 21,6 Schaden, 4 Schuss/s, 44 m, 12 Schuss und vier Reservemagazine, Reload 1,45 s, 0,85°/0,25° |
| Operator | 100 HP, 5,8 m/s Gehen, 9,2 m/s Sprint, zwei Granaten, fünf Stims mit bis zu 40 HP pro Anwendung |
| Schaben und Director | Normal 200 aktive Gegner und 360 Nest-HP. FREEFALL 1.000 aktive Gegner und 450 Nest-HP. Wellenfaktoren nach lebenden verbundenen Operatoren 1,00/1,24/1,48/1,72. CALM 27–33 s, BUILDUP 6 s, ASSAULT 8–20 s, PEAK 7–12 s, RECOVERY 16–30 s unter den zugehörigen Phasenbedingungen. |
| Missionsökonomie | Relais 8 s besetzte Verteidigung. Nachschub zwei Container mit je vier Ladungen, 2,2 m Reichweite, 1 s Interaktion. Eine Nutzung gewährt bis zu zwei Primär- und ein Sekundärmagazin, eine Granate und zwei Stims innerhalb der Tragegrenzen. |

16 Schießstandversuche je Kombination. Auf 8 m im Stand mit stetigem Feuer lagen die TTK-Mediane bei 0,10 s für das Kestrel und 0,50 s für die P-01. Ein erzwungener taktischer Reload reduzierte die verfügbaren Runden im Test von 405 auf 375 bzw. von 60 auf 54. Der Verlust erfolgte beim bestätigten Einsetzen. Die Werte stammen aus der kontrollierten Testumgebung und den im Datensatz aufgeführten Zielbedingungen. [Kampfbalance](playtest/7-9e/combat-balance.json)

In 72 regulären Normal-Routen bestätigte der Server 4.434 Schüsse, 4.356 Waffentreffer, 104.544 Waffenschaden, 56 verwendete Magazine, 225 verworfene Patronen, fünf Stims, acht Nachschubnutzungen, 2.062 Operator-Kills, vier Operator-Tode und 600 Gegner-Schadenspunkte an Operatoren. Die direkten Routen vermeiden Friendly Fire. Granaten, Nahkampf und Friendly Fire wurden in eigenen Proben und im Waldkampf ausgeübt. Die hohe Trefferquote der direkten Routen beschreibt den automatisierten Controller. [Missionsmatrix](playtest/7-9e/mission-matrix.json)

## 6. Waffen-Audio

Kestrel, Convict-Kestrel und P-01 verwenden Nahvarianten, dedizierte Fernsamples und bestätigte Handhabung. Der Kestrel-Bank gehören Magazin-Entnahme, -Insertion, Verschluss und gelegentliche Hülsen hinzu. Die P-01 nutzt einen kombinierten Insertion-/Schlitten-Cue. Wechsel-Foley gehört zu beiden Slots. Der leere Abzug ohne Reserve hat kein eigenes bestätigtes Soundereignis. [Inventar](WEAPON_AUDIO_7_9A.md)

13 Master und 26 Ogg-/MP3-Dateien stimmen mit den veröffentlichten Prüfsummen überein und wurden vollständig dekodiert. Der dateiweise Ursprung und die Ausschnitte sind im Master-/Quellenmanifest dokumentiert. Die drei Veröffentlichungen weisen CC0 aus. Die Namen der Aufnahmeautoren, LFA und rubberduck sind in der Projektattribution angegeben. Die Herkunftsprüfung nutzt die indexierten Originalseiten und den gepinnten Aufnahme-Spiegel. [Dateiprüfung](playtest/7-9e/weapon-assets.txt) · [Aufnahmebibliothek](https://opengameart.org/content/the-free-firearm-sound-library) · [Gepinnter Spiegel](https://github.com/buddingmonkey/FreeFirearmsSFXLibrary/tree/beb2f4041f3d6740fa0aeaf0e71159bd65a78c1b) · [LFA](https://opengameart.org/content/equipment-clicks-ii) · [rubberduck](https://opengameart.org/content/100-cc0-metal-and-wood-sfx) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

Vier Audio-Browserproben mit 1–4 Operatoren validierten Vorhersage mit verspäteter Bestätigung, Remote-Duplikate und -Umordnung, Schussserien, unzulässigen Reload, Wechsel und Suspend/Resume. Die Lastprobe mit 590–600 Schaben erreichte 18 Spitzenstimmen bei Budget 28, 75,5 MiB PCM und 24 verworfene Anfragen durch Priorisierung. Der gemessene Mix erreichte rund 0,649 des Vollpegelbereichs ohne Vollpegelsamples. Nach Suspend meldete der Audio-Kontext null Stimmen. Die native kombinierte Probe erreichte 16 Spitzenstimmen, 25 verworfene Anfragen, 175 lokale und 314 entfernte Waffencues, null nicht verfügbare Samples und null Ladefehler. Subjektives Hören, Browser außer Chromium und isolierte Allokationsraten im Audiopfad sind offen. [Audio-Lauf](playtest/7-9e/weapon-audio.txt) · [Native Last](playtest/7-9e/forest-combined.json)

## 7. Kampf, Bewegung und Gegner

Waffenfeuer, Treffer-/Tötungsbestätigung, Reload- und Wechselzeitpunkte, Recoil, Munition, Granaten, Nahkampf, Stims und Friendly Fire liefen durch die bestehenden Serverpfade. Clientprüfungen decken verspätete und doppelte Ereignisse, Remote-Interpolation, Kameraführung, reduziertes Bewegungsprofil und HUD ab. Der Waldprobe wurden Boden-, Holz- und Metallkontakte, ein Nahkampf-Treffer und eine serverseitig ausgelassene Detonation vor der Lastsequenz zugeführt. Die ausgelassene Detonation erschien weder bei den SDK-Peers noch als alleiniger Client-Effekt. [Regression](playtest/7-9e/regression.txt) · [Kampfpräsentation](playtest/7-9e/forest-combined.json)

Stehen, Hocke, Dive in acht Richtungsbereichen, Bauch- und Rückenlage und explizites Aufstehen sind getestet. Das Trefferprofil änderte sich serverseitig mit der Haltung. Schabentreffer und Friendly Fire wurden für Bodenlagen und Übergänge geprüft. Der Test weist Schaden während Dive und Get-up nach. Bodenlagen ließen Aim, Schuss, Reload und Stims zu und sperrten Sprint, Granate und Nahkampf. Im kombinierten Fenster gab es 26 abgeschlossene Dives, davon 12 in Bauch- und 14 in Rückenlage, 26 Aufstehvorgänge und 137/161 Schüsse in Bauch-/Rückenlage. [Haltungsdaten](playtest/7-9e/tactical-movement.json) · [Waldprobe](playtest/7-9e/forest-combined.json)

Zielbindung und -wechsel, Routen, Separation, Hindernisse, Stuck Recovery, Telegraphen, Angriffswindup, Schaden und Despawn sind abgedeckt. Die Spawn-Regression prüft Kollision, Wegbarkeit, Mindestabstand, Sichtlinie einschließlich des vierten Beobachters und begrenzte Kandidatenarbeit. Alle fünf Director-Phasen traten in der Missionsmatrix auf. Regulär verteilten sich 291.928 Director-Ticks auf CALM 248.346, BUILDUP 8.252, ASSAULT 4.946, PEAK 128 und RECOVERY 30.256. 38 Wellen endeten wegen Verteidigung und zehn wegen Verstärkungsereignissen. Der erweiterte Waldlauf zeigte 12 Wellenstarts, zehn vollständige Wellen und eine Spitze von 200 Gegnern. Die geringe PEAK-Exposition und die überwiegende CALM-Zeit der direkten Routen bleiben ein Pacing-Befund. Die separaten Druckmessungen erfassen Nähe, Reichweite, Zielverteilung, Attacken und Schaden pro Phase. [Gegnerdaten](playtest/7-9e/enemy-pressure.json) · [Director](playtest/7-9e/director-pressure.json)

## 8. Missionen und Extraktion

77 Läufe ergaben genau ein `MissionResult` je Ablauf. 72 reguläre Normal-Läufe extrahierten erfolgreich, je 36 per Albatross und Ballon. Vier FREEFALL-Testgruppen mit je 1–4 Operatoren erreichten auf derselben Waldroute das Nestziel, verloren aber das Team vor der Abholung. Ein gesonderter ausgedehnter Normal-Lauf extrahierte bei 19:25,3 simulierter Einsatzzeit und enthielt 18 Minuten geplante Exposition. 1.096 Sekunden entfielen auf Stillstand ohne Operator-Kampfereignis. Der Lauf validiert ausgedehnten Missionszustand.

Reguläre Dauer ab Abflug, nächster Rang für Perzentile: Minimum 58,2 s, P50 131,1 s, P95 216,8 s, Maximum 223,3 s. Deployment dauerte 8,3 s, Anmarsch 16,8–50,5 s, Ziele 1,1–8,1 s, Reisen zwischen Zielen 18,8–28,4 s, Nachschubumwege bei Nutzung 24,0–29,6 s und Weg zum Abholpunkt 1,3–56,1 s. Ab Start dauerte die Extraktion 6 s per Albatross bzw. 95 s per Ballon. Der Server maß Kampfereignisse tickweise. Pausen zwischen solchen Ereignissen können Teil eines Gefechts sein. [Rohdaten mit beiden Seeds, Plan-IDs und Timings](playtest/7-9e/mission-matrix.json)

Die technische Validierung umfasste Skyfall Carrier, generierten Missions-DAG, Standortvalidierung, Nestzerstörung, Relaisfortschritt, Convict Defense, Nachschub, Extraktionsberechtigung und den Abschluss. 512 Dev’Ault-Missionsseeds und 100 Weltseeds pro prozeduralem Planeten prüften Versionierung, getrennte Seeds, Layout und Validierung. Der Vergleich mit 7.9D ergab deckungsgleiche Szenarien, Ergebnisse, Abschlusszeiten, Etappen und Abschlussinventare. In drei Datensätzen variierten die gemessenen Ausführungszeiten der Blast-Abfragen. [Regression](playtest/7-9e/regression.txt) · [Missionsmatrix](playtest/7-9e/mission-matrix.json)

## 9. Koop nach Gruppengröße

| Operatoren | Reguläre Extraktionen | P50, nächster Rang | Höchste aktive Population je nach Route | Beobachtung der gleichen FREEFALL-Nest-Route |
| ---: | ---: | ---: | ---: | --- |
| 1 | 20/20 | 122,2 s | 41–96 | Team verloren, 99,9 s |
| 2 | 16/16 | 131,1 s | 43–96 | Team verloren, 59,0 s |
| 3 | 16/16 | 131,1 s | 43–96 | Team verloren, 82,8 s |
| 4 | 20/20 | 166,5 s | 43–98 | Team verloren, 57,4 s |

Die Gruppen haben unterschiedliche Nest-Purge- und Extraktionsanteile. Ein gepaarter Vergleich auf Forest `76`/Mission `20` mit Relay Chain und Ballon ergab 222,7/217,7/216,7/216,4 s für 1–4 Operatoren. Der technische Solo- und Koop-Pfad ist belegt. Schwierigkeit und Rollenverteilung mit Menschen wurden nicht getestet. [Missionsmatrix](playtest/7-9e/mission-matrix.json)

## 10. Planeten und Abdeckung

Jede Zelle zeigt die erfolgreichen regulären Missionen in der Basiskonfiguration. In jeder Zelle sind Relay Defense und Relay Chain mit beiden Extraktionen enthalten. Die Einser- und Vierergruppen schließen zusätzlich Nest Purge mit Nachschub ein.

| Planet | Weltseeds | 1 Operator | 2 Operatoren | 3 Operatoren | 4 Operatoren |
| --- | --- | ---: | ---: | ---: | ---: |
| Green Plains | 76, 17 | 5/5 | 4/4 | 4/4 | 5/5 |
| Desert | 31, 32 | 5/5 | 4/4 | 4/4 | 5/5 |
| Ice | 48, 49 | 5/5 | 4/4 | 4/4 | 5/5 |
| Forest | 63, 76 | 5/5 | 4/4 | 4/4 | 5/5 |

Missions-Seeds `0`, `20` und `4`, Generatoren v1, Registry `390e375eec0bf943`. Die Simulation prüfte u. a. offene Ebenen, Dünen, Engstellen auf Eis und Waldstämme mit Umwegpfad. Wetterpfade prüfen unter anderem Wind, Staub, Schnee und Bodennebel. Partikel, Wind und Sichtprofil sind über die prozedurale Identität synchronisiert. Die Wetterregression prüft die Trennung von Präsentation und Gameplay. [Planeten-Browserprotokoll](playtest/7-9e/planet-browser.txt) · [Green Plains](playtest/7-9e/green-plains.png) · [Desert](playtest/7-9e/desert.png) · [Ice](playtest/7-9e/ice.png) · [Forest](playtest/7-9e/forest.png)

Vier zusätzliche native Browserläufe mit Fixture-Positionen bestätigten Schüsse, Bauch- und Rückenlage, Wetterwechsel, eine Nachschubnutzung und je ein erfolgreiches `MissionResult`. Green Plains und Desert nutzten den Albatross, Ice und Forest den Ballon. Bei jedem Raumaustritt meldete der Browser null Audiostimmen. Die Geometriezähler gingen je nach Planet von 205–241 auf 106–117 zurück und die Texturzähler von 52–57 auf 45–48. [Mit Clients ausgeführte Planetenprüfung](playtest/7-9e/planet-browser.txt)

## 11. Netzwerk und Wiederverbindung

Vier echte Colyseus-Verbindungen teilten Operator-Zustand, Hordenframes, Plan, Ziele und Missionsresultat. Eine fünfte Verbindung wurde abgewiesen. Die Wiederverbindung wurde für Dive, Prone, Get-up, laufenden Angriff, Welle, Relais, Extraktion, Ergebnis, nach Nachschub und getrennt für Abbruch eines laufenden Nachschubs abgedeckt. Der Browser stellte Audio und Wetter nach dem Verbindungswechsel wieder her und verwarf alte Kampfcues. Die technische Abdeckung kombiniert reale Loopback-Peers mit deterministischen Tests. [Regression](playtest/7-9e/regression.txt) · [Vier Browser](playtest/7-9e/forest-four-clients.txt)

Das Netzwerkprofil umfasste 140 ms künstliche RTT über echte WebSocket-Peers, geordnete LAN-/WAN-/Jitter-Simulation bei 60 und 144 Hz, ausgesetzte Anwendungsevents, umsortierte und doppelte Nachrichten und absichtlich geschlossene Verbindungen. Die Jitter-Simulation nutzt 60–100 ms Einweg-Verzögerung und 2 % zusätzliche 120-ms-Spitzen. Die Verlustprobe ließ einen Blast auf Anwendungsebene aus. Transportverlust durch einen externen Paket-Shaper und WAN-Messungen über getrennte Rechner bleiben offen. [Motion-Läufe](playtest/7-9e/motion.txt) · [Ereignisprobe](playtest/7-9e/forest-combined.json)

## 12. Performance

| Szenario | Reale aktive Gegner | Ø FPS / Frame P95 / P99 | Server-Schritt Ø / P95 / P99 | Beobachtung |
| --- | ---: | --- | --- | --- |
| Wald, vier native Browser, 15,03 s | 1.000 in jedem beobachteten Hordenframe | Alle ca. 60,0 / 16,7–16,8 / 16,8 ms | 1,052 / 1,399 / 1,584 ms, jüngstes Serverfenster | 40–99 Draw Calls, 57.887–161.509 Dreiecke, 3–5 Spitzenstimmen zu den Renderstichproben, 100,9 kB/s Hordenpayload je Empfänger, null verworfene Steps |
| Wald, Kampf und Missionsfortschritt, 35,03 s, ein nativer Browser und drei SDK-Peers | 995–1.000, davon 1.000 in 1.051/1.052 Ticks | 60,0 / 16,8 / 16,8 ms | 0,695 / 1,190 / 1,580 ms, gesamtes Simulationsfenster | 139 Draw Calls, 146.197 Dreiecke, Render-CPU/GPU-Stichprobe 1,3/0,1 ms, 16 Audio-Spitzenstimmen, 100,3 kB/s Hordenpayload pro Empfänger, null verworfene Steps |
| Bodenbruch AI, vier Operatoren, 1.800 Ticks | Exakt 1.000 pro gemessenem Schritt | NOT MEASURED | 0,306 / 0,361 / 0,482 ms | Headless, 60 s Simulationszeit, 101,7 kB/s Horden- und 7,7 kB/s Kampf-Nutzlast pro Sekunde aus der Serialisierung. |

Im kombinierten Waldlauf lag AI-Zeit P95/P99 bei 0,626/0,857 ms, Navigation bei 0,432/0,639 ms, Fixture-Ersatzspawns bei 0,160/0,283 ms und Zielupdates bei 0,005/0,013 ms. Das F2-HUD schätzte 213 kB/s Gesamtnutzlast. Die SDK-Messung zählt nur Hordenpayload. Der Node-Prozess verbrauchte während 35,03 s rund 2,62 CPU-Sekunden inklusive Harness und Preview. Browser-JS-Heap 19,3→31,3 MiB, Node-RSS 733,2→784,8 MiB. Die Renderstichprobe zeigte vier Tracer, sieben Hülsen und sechs Impact-Partikel. Der Blast-Peak lag bei zwei Explosionen und 8/8/16 Rauch-/Staub-/Splitterpartikeln. Server und Browser teilten dieselbe Hardware. [Kombinierte Rohdaten](playtest/7-9e/forest-combined.json) · [Vier-Browser-Daten](playtest/7-9e/forest-four-clients.txt)

Das bestehende 30-Hz-Schrittbudget beträgt 33,33 ms. VRAM in Bytes, Browser-Gesamt-RSS, drahtseitige IP/TCP/WebSocket-Overheads und isolierte Audio-Allokationsrate sind **NOT MEASURED**. Ein 60-Hz-Browser-Plateau misst die gezeigte Auflösung und Kamerasituation. Freigegebene Client-Budgets, Mindesthardware, Netzwerkbudgets und ein Produktionslastprofil für mehrere Räume fehlen. [Bestehendes Serverbudget](PERFORMANCE.md)

## 13. Nachweis der 1.000 aktiven Schaben

| Wald-Zielpopulation | Tatsächlicher Bereich in 450 Ticks | Bewegte IDs | Bestätigte Treffer an Operatoren | Tick P95 / P99 |
| ---: | ---: | ---: | ---: | ---: |
| 50 | 43–50 | 50 | 179 | 0,093 / 0,196 ms |
| 100 | 85–100 | 100 | 327 | 0,222 / 0,282 ms |
| 250 | 239–250 | 250 | 547 | 0,631 / 0,751 ms |
| 500 | 492–500 | 500 | 584 | 1,152 / 1,308 ms |
| 750 | 741–750 | 750 | 566 | 1,865 / 2,447 ms |
| 1.000 | 990–1.000 | 1.000 | 564 | 2,422 / 3,083 ms |

Headless-Wald, Welt `63`, Mission `0`, Seed der Simulation `421337`, FREEFALL, vier Operatoren. Die vorbereitete Population umfasst lebende ECS-Entities. Alle 1.000 IDs bewegten sich. Zehn starben in dieser Stufe. Angriffsauswahl und Pfadanfragen liefen nach den vorhandenen gestaffelten Arbeitsbudgets. Im Bodenbruchlauf prüfte die Fixture die Bestandszahl an jedem Tick und dekodierte replizierte Hordenframes gegen dieselbe Zahl. In der Vier-Browser-Waldprobe bewegten sich 953 gespeicherte Gegner und der Server registrierte 477 Angriffsstarts gegen Operatoren. Dort wurden Ausgangs-HP je Tick zurückgesetzt. Angriffsschutz war im Messfenster aus. [Wald-Lasttreppe](playtest/7-9e/enemy-pressure.json) · [Bodenbruch](playtest/7-9e/enemy-benchmark.txt)

**Kombinierte Waldprobe.** Welt `76`, Mission `0`, v1, Relay Defense, FREEFALL, Morgendämmerung mit Bodennebel. Anfangspopulation und Operatorpositionen sind Test-Fixtures. 115 Ersatzschaben wurden über die vorhandene Platzierungs- und Spawnvalidierung eingesetzt. Gemessen wurden 747 Schüsse einschließlich Convicts, zwei Explosionen, 334 Angriffsstarts und vier bestätigte Schabentreffer an Operatoren. Nachschubabschluss, regulärer Relaisabschluss und Ballonstart trafen bei je 1.000 aktiven Schaben ein. Der optionale Nesthinweis wurde per Debug ausgelöst. Waffen-/Gegneraudio, Wind, Vegetation, Terrain, HUD, Tracer, Impact-Effekte und Bodenhaltungen liefen im selben Fenster. Der Director arbeitete im beobachteten Fenster in CALM und pausierte Wellen nach den bestehenden Missionsregeln. Der Ballon war am Messende im Countdown. Die Abholung und das Ergebnis wurden in separaten vollständigen Läufen geprüft. [Kombinierte Rohdaten](playtest/7-9e/forest-combined.json)

## 14. Langzeit und Ressourcen

48 abgeschlossene Einsätze in derselben Missioninstanz, vier Operatoren, sechs Durchläufe der vier Planeten mit beiden Extraktionen. Nach 220.745 Ticks kumulierter Simulationszeit (122,6 Minuten) und 48 Rückkehrvorgängen waren Hordenpool, Granaten, Missionsplan, Ergebnis, Extraktion und Telemetrie bereinigt. Heap nach erzwungener GC 10,7 MiB vor dem ersten Einsatz, 14,3 MiB am Ende des ersten Acht-Missionen-Zyklus und 14,8 MiB nach Zyklus sechs. RSS stieg über drei Zyklen auf ca. 239 MiB und blieb dort bis zum letzten Zyklus. Diese kurze Speicherreihe nach GC weist keinen fortlaufenden Heap-Anstieg ähnlicher Größenordnung wie beim Aufwärmen aus. [Lifecycle-Daten](playtest/7-9e/lifecycle.json)

In einem zweiten Same-Room-Lauf folgten auf zwei normale Waldextraktionen jeweils FREEFALL-Teamverluste. Auch nach beiden verlorenen Einsätzen erreichte die bestehende Rückkehr den Carrier und bestand die Cleanup-Prüfung. Der Bodenbruchlauf hielt 1.000 aktive Schaben über 36.000 Messticks (20 virtuelle Minuten), Schritt-P95/P99 1,094/1,311 ms. Ein getrennter Fall im selben Benchmark prüfte die Ballonabholung und die Rückkehr. [Lifecycle mit Teamverlust](playtest/7-9e/lifecycle-failure.json) · [Server-Soak](playtest/7-9e/server-soak.txt)

Eine native Waldansicht lief 120,07 s mit Wetter und Audio bei null Schaben. Sie hielt 60,0 FPS, Frame-P95/P99 16,7/16,8 ms, drei Audiostimmen und 73,6 MiB Audio-PCM in beiden Stichproben. Der Browser-JS-Heap betrug nach 60/120 s 23,5/42,3 MiB. Die ungefilterten Heap-Punkte liefern keinen Lecknachweis. Residenter Browser-/GPU-Speicher über mehrere vollständige Kampfmissionen, mehrere Renderer in einer langen Session sowie Fehler- und Reconnect-Kombinationen unter fortlaufender Last sind offen. [Browser-Soak](playtest/7-9e/browser-soak.txt)

## 15. Menschliches Playtesting

**NOT TESTED.** Es liegen keine menschlichen Bewertungen zu Spielgefühl, Schwarmfairness, Audio, Missionspacing oder Koop vor. Der Durchführungsbogen enthält Sessions und ein Bewertungsraster für reproduzierbare Spiel- und Hörtests. [Playtestbogen](playtest/7-9e/HUMAN_PLAYTEST.md)

## 16. Regression und Testnachweise

| ID | Szenario und Erwartung | Tatsächliches Ergebnis | Status |
| --- | --- | --- | --- |
| REG | Typecheck, Test, Produktionsbuild, Registry, acht Gameplay-Traces und Schaben-Hashes | 357/357, übrige Prüfungen Exit 0. Bestehende Vite-Chunkwarnung. | PASS |
| MIS | 16 Planet-/Größenkombinationen, beide Extraktionen, zusätzlich Nest-Purge, langer Wald und FREEFALL-Kontrast | Alle 77 autoritativ abgewickelt. 73 extrahiert, vier Teamverluste. | PASS |
| DUR | Reguläre Einsatzrouten im 20–30-Minuten-Ziel | 0/72 im Zielkorridor. | FAIL |
| NET | Vierer-WebSocket, verzögerte oder doppelte Cues, Reconnect | Testmatrix, Browser-Drop und Reconnect-Prüfungen ausgeführt. | PASS |
| AUD | Beide Waffen, Klangquellen, Wiedergabe, Mix-Budgets und Cleanup | 26 Dateien verifiziert, vier Chromium-Profile, Sustain und Reconnect technisch bestätigt. | PASS |
| AUD-H | Qualität und räumlicher Mix im menschlichen Hörvergleich | Keine Teilnehmenden. | NOT TESTED |
| CAP | Lebende autoritative Gegner bis zum Cap, aktive Bewegung und Angriffe | 1.000 im Headless- und Waldtest nachgewiesen. | PASS |
| FOR | Kampf und Missionsfortschritt im selben 1.000er-Waldlauf | Nachschub, Relais und Ballonstart am Cap. 35,03 s; 1.051/1.052 Ticks am Cap. | PASS |
| LIFE | Erneute Auswahl und Rückkehr in derselben Instanz | 48 vollständige Abläufe, Speicherstichproben und Server-Cleanup. | PASS |
| TARGET | Offizielle Zielgeräte und Performancebudgets | Grenzwerte und Zielgeräteprofil ausstehend. | BLOCKED |
| HUMAN | Tatsächliche Spielrunden mit 1–4 Menschen | Keine Teilnehmenden. | NOT TESTED |

Befehle und Konsolenausgaben sind im Evidenzordner aufgeführt. Das optionale `assets:check` verlangt ein externes humanoides GLB. Der Build verwendet den vorhandenen Fallback. Gelieferte Schaben- und Waffen-Audio-Assets wurden mit ihren einschlägigen Prüfungen verifiziert. Der initiale Sandboxlauf scheiterte am Bind an `127.0.0.1`. Die Wiederholung mit Loopback und die Abschlussregression liefen erfolgreich. [Reproduktion](playtest/7-9e/README.md) · [Abschlussregression](playtest/7-9e/regression-final.txt)

## 17. Release-Gates

| Gate | Status | Nachweis oder fehlende Voraussetzung |
| --- | --- | --- |
| E-G1 Repository und Integration | PASS | Quell- und Berichtsaudit 7.6–7.9D, aktuelle Testwiederholung. |
| E-G2 Registry | PASS | Bytegleiche Snapshot-Reproduktion und acht Gameplay-Traces. |
| E-G3 Waffen und Kampf | PASS | Beide Operatorwaffen, Convict-Feuerpfad, serverseitige Treffer, Waffenwechsel, Reload, Ausrüstung und Feedback regressionsgeprüft. |
| E-G4 Premium-Audio | NOT TESTED | Technische Abdeckung und Herkunft sind belegt. Menschliche Hörabnahme offen. |
| E-G5 Kampfpräsentation | PASS | Bestätigte Treffer, Oberflächenimpacts, Blast, Nahkampf, Kamera und HUD in Regression und Browser. |
| E-G6 Gegner-KI | PASS | Ziele, Routen, Separation, Recovery, Spawn-Sicherheit und Angriffs-/Schadenspfade gemessen. |
| E-G7 Horde Director | PASS | Alle fünf Phasen, Zeitanteile, Wellenenden und Druckkurven technisch ausgewertet. Pacing-Befund unter E-G16. |
| E-G8 Taktische Bewegung | PASS | Sechs Zustände, Richtungen, Aktionen, Kamera und Multiplayer-Replay. |
| E-G9 Autoritative Hitboxen | PASS | Haltungsprofile und Treffer während Dive, Aufstehen und am Boden. |
| E-G10 Koop-Balance | PASS | 1–4 Operatoren im kontrollierten technischen Vergleich. Subjektive Abnahme unter E-G24. |
| E-G11 Missionsgenerator | PASS | Seeds, Versionen, DAG, Reachability und Determinismus geprüft. |
| E-G12 Missionsziele | PASS | Relais, Nest und Convict Defense bis zum Resultat. |
| E-G13 Albatross-Nachschub | PASS | Acht Normaltransaktionen, Stornierung, Reconnect und Nutzung am 1.000er-Cap. |
| E-G14 Albatross-Extraktion | PASS | 36 reguläre Erfolge, Berechtigung, Rückkehr und Fehlerpfade. |
| E-G15 Ballonextraktion | PASS | 36 reguläre Erfolge, Abholung, ausbleibender Pickup, Rückkehr und Reconnect-Pfade. |
| E-G16 Missionsdauer und Pacing | FAIL | Reguläre Missionen 58,2–223,3 s gegenüber 20–30 Minuten. |
| E-G17 Vier Planeten | PASS | Alle 16 Basiszellen und Planetpfade ausgeführt. |
| E-G18 Multiplayer-Autorität | PASS | Vier Verbindungen, Prediction/Reconciliation, Ergebnisübereinstimmung und Dedup. |
| E-G19 Reconnect | PASS | Autoritative Wiederherstellung in Kampf, Haltungen, Phase, Relais, Nachschub, Extraktion und Resultat geprüft. |
| E-G20 Technische Performance | BLOCKED | Zielgeräte- und Client-Budgets zur Freigabe fehlen. Technische Referenzmessungen liegen vor. |
| E-G21 1.000 aktive Gegner | PASS | Exakter Headless-Bestand und kombinierter Waldlauf mit gemessener AI, Bewegung, Angriffen und Despawn. |
| E-G22 Kombinierter Waldtest | PASS | 1.000 echte Gegner mit vier Operatoren, aktivem Kampf, Wetter, Audio, Rendering, Nachschub, Relais und Ballonbeginn. |
| E-G23 Langzeitstabilität | NOT TESTED | Server-Wiederholungsprofil liegt vor. Mehrere lange vollständige Kampfmissionen im selben Browser-Client mit Ressourcenprofil fehlen. |
| E-G24 Human Gameplay | NOT TESTED | Playtestbogen vorbereitet. Keine menschlichen Sessions. |
| E-G25 Abschlussregression | BLOCKED | Ausgeführte Regression grün. Das frühere offene P1 FF78E-6 benötigt Zielhardware und Leistungsbudgets. |
| E-G26 Abschlussevidenz | BLOCKED | Technische Rohdaten und Provenienz liegen vor. Hörprotokolle, menschliche Spielrunden und Zielgerätefreigabe fehlen. |

## 18. Offene Befunde

| Befund | Auswirkung und nächste Prüfung |
| --- | --- |
| FF79E-1 Missionspacing | Reguläre direkte Routen wiederholt unter vier Minuten. Menschliche Spielrunden mit passenden Routepaaren auswerten. Die 7.9D-Probe mit längerem Relais zeigt nur Sekunden zusätzlicher Dauer. |
| FF79E-2 Ressourcen und Schwierigkeit | Vier Wipes auf derselben FREEFALL-Nest-Route. Weitere Seeds und menschliche Wege zur Abholung prüfen. |
| FF78E-6 P1, Performancefreigabe | Native Radeon-Messung liegt vor. Client-Zielgeräte und Grenzwerte bestätigen, anschließend Last und Netzwerk auf diesen Geräten reproduzieren. |
| FF79E-3 Hör- und Spielabnahme | Subjektive Audioqualität, Rollenunterschiede, Fairness, Ressourcen und Wiederholungsmotivation bleiben offen. |
| FF79E-4 Ressourcengrenzen | Browser-Speicher über wiederholte vollständige Missionen sowie VRAM, Audio-Allokationen, Transportverlust und weitere Browser offen. |
| FF79E-5 Markerlesbarkeit | In der Waldansicht bei 800 × 450 überlappt die Beschriftung des optionalen Nests das Primärziel. Der vollständige Zielname bleibt im HUD sichtbar. [Aufnahme](playtest/7-9e/forest.png) |
| FF78E-8 P3, Bundle | Vite meldet den Haupt-Chunk über 500 kB. Build erfolgreich. |

## 19. Abnahmeentscheidung

**NOT ACCEPTED.** E-G16 hat das vorgegebene Missionsdauerziel in der ausgeführten Basisprüfung verfehlt. E-G4, E-G23 und E-G24 sind unvollständig getestet. E-G20, E-G25 und E-G26 warten auf Freigabekriterien oder ausstehende Abnahmebelege. Eine technische Teilabnahme des vorhandenen 1.000-Gegner-Simulationspfads und der bestandenen Integrationsgates liegt vor.

## 20. Vorschläge zur Freigabe

- Gegengewicht zu den direkten Controller-Routen schaffen, indem menschliche Testgruppen dieselben Seeds und beide Extraktionsarten spielen. Erst danach priorisieren, ob vorhandene Missionsvorlagen mehr relevante Arbeit benötigen.
- Zur Genehmigung für ein definiertes 60-Hz-Zielgerät bei 1080p Medium vorschlagen: Frame-P95 ≤ 17,5 ms, P99 ≤ 25 ms und null verworfene Server-Steps in einem mindestens 90-sekündigen Wald-Lastfenster bei vier Operatoren. Das bestehende Serverbudget 33,33 ms je Schritt gilt weiter. Diese Client-Werte sind Vorschläge ohne Abnahmewirkung.
- Eine wiederholte native Vierer-Session über mehrere vollständige Einsätze für Speicherplateaus, planetenübergreifende Soundscape-Bereinigung und Reconnect am Ergebnis aufzeichnen. Hörbewertung mit vier echten Perspektiven und ausgeglichenen Lautstärken durchführen.
