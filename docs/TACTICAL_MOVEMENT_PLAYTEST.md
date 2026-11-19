# Milestone 7.3 Playtest

## Verifiziert

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
