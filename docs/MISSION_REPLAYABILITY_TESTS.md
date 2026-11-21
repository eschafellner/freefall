# Wiederholbarkeit und Spieltests

Messstand vom 20. November 2026 auf Ryzen 7 9700X, Node 24.18.0 und Radeon RX 9070 XT. Balance-Hash `01855759529dd588`. Generator, Format, Vorlagen und Dev’-Ault-Profil jeweils v1.

## Vollständige Durchläufe

Die Simulation erhielt reguläre Bewegungs-, Interaktions-, Waffen- und Extraktionseingaben. Es gab keine Debug-Freischaltung, Platzierung auf dem Feld oder HP-Manipulation in diesen drei Durchläufen. Nach der Rückkehr ans Terminal wurde derselbe Seed neu angefordert und der Plan als identischer JSON-Datensatz bestätigt.

| Seed | Normal | Besetzung | Verlauf | Ergebnis | Ticks ab Deployment | Gegner bei Ergebnis |
| ---: | --- | ---: | --- | --- | ---: | ---: |
| 4 | Nestjagd | 1 | Startnest im Westkrater mit 15 Treffern zerstört, nachgeladen, eine Albatross-Ladung für Nachschub verbraucht | Albatross, 1/1 extrahiert | 1.325 | 42 |
| 0 | Relaisverteidigung | 1 | Bravo acht Sekunden besetzt, optionales Startnest offen | Albatross, 1/1 extrahiert | 3.565 | 77 |
| 3 | Relaisverbund | 4 | Bravo verteidigt, Alpha aktiviert, Ballon außerhalb der Sammelzone abgelehnt und an der südlichen Ebene angenommen | Ballon, 4/4 extrahiert | 6.184 | 106 |

Der vierköpfige WebSocket-Test verwendet lokale Positions- und Deployment-Checkpoints. Er prüft Gastautorität, veraltete Plan-ID beim Start, Beitritt während der Auftragsplanung, denselben serialisierten Plan, zwei gleichzeitige Relaisaktionen, Reconnect mit unveränderter Einsatz-ID und Zielzeit sowie den identischen Ergebnisdatensatz mit vier extrahierten Operatoren. Die Ereignisse für Relay-Start und -Abschluss, Extraktion und Ergebnis erscheinen je Empfänger genau einmal. Der Teamwipe-Test prüft fehlgeschlagene Pflichtziele, den Abbruch optionaler Ziele und null Basis-EP vor Zielabschluss.

Das 1.000er-Chromium-Profil verwendet vier echte Browser-Clients, gestufte Positionen und eine feste Lastkohorte. Missionskonsole, Seed, Boarding-Freigabe, gemeinsames Briefing, Ziel-HUD, Relaisaktion, Albatross-Anforderung und Resultatanzeige wurden im Browser geprüft. Das begrenzte Browserprofil setzt Operator-Schutz und pausiert Convict-Feuer für reproduzierbare Last. Der Lastaufbau verwendet ein Director-Signal und füllt die künstliche Kohorte anschließend direkt. Ein koordinierter menschlicher Vierertrupp und menschliches Balancing stehen aus. In einem frühen Eingabelauf mit Seed 1 fiel der untätig am östlichen Vorfeld wartende Trupp unter Druck aus. Das östliche Vorfeld ist geometrisch validiert. Die Abwehr während des dortigen 90-Sekunden-Countdowns bleibt ein Spieltestpunkt.

Der zusätzliche Bodenbruch-Browserlauf mit Chromium und drei SDK-Peers prüfte die feste Auswahl, Boarding, Fallflug und Landung, Pistole, Nachladen, Stims, Granaten, kompakte HUDs, Ballonrettung und Carrier-Rückkehr. Der Harness nutzte Debug-Aktionen für den Relaisabschluss und den abgekürzten Rettungsanflug. Die regulären Bodenbruch-Testdurchläufe im Server decken Zielabschluss und beide Extraktionen ohne Debug-Aktionen ab.

## Seed-Matrix und Fehlerfälle

512 unterschiedliche Seeds von 0 bis 511 wurden durch die sieben Schwierigkeitsstufen rotiert und separat nachvalidiert. 512 gültige Pläne, 0 verworfene Kandidaten im produktiven Profil, 512 stabile IDs und 493 verschiedene Gameplay-Kombinationen aus Zielfolge, Sammelpunkt, Modifier und Regionsauswahl. Enthalten waren 170 Nestjagden, 157 Relaisverteidigungen und 185 Relaisverbünde. Beide Relais-Reihenfolgen und beide Ballonorte kamen vor.

Künstliche Fehlerprofile und manipulierte Pläne prüfen unbekannte Inhalte, fehlende Welt oder Vorlage, leere Standorte, zu wenige Relais, fehlende und physisch abgetrennte Extraktion, ungültige Balance, fehlende Region, zyklische und fehlende Abhängigkeiten, ungültige Modifier, manipulierte Plan-ID und Terminierung nach zwölf Fehlversuchen. Der Ersatzauftrag wird mit gesondertem Fehlerstatus zurückgegeben.

## Reproduktion

```sh
npm run typecheck
npm run build
npm run balance:check
npm test
sha256sum -c docs/enemies/schabe/baseline.sha256
node --conditions=development --test --test-isolation=none apps/server/test/procedural-mission.test.ts
node --conditions=development --test --test-isolation=none --test-name-pattern='measure a generated' apps/server/test/procedural-mission.test.ts
```

Mit lokal installiertem Playwright und Chromium auf einer verfügbaren GPU.

```sh
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chrome \
FREEFALL_GENERATED_SEED=0 FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ANGLE=gl \
FREEFALL_BROWSER_SAMPLE_MS=12000 node --conditions=development scripts/playtest-horde-director.mjs
```

Die ausgewiesene Netzwerkgröße zählt Colyseus-Nutzdaten am WebSocket pro Empfänger. TCP-, TLS- und WebSocket-Overhead werden getrennt betrachtet. RSS des Browser-Harness umfasst Vite, Harness und lokalen Server im selben Node-Prozess. Für den reinen Simulationsprozess dient die separate Cap-Messung. [Abnahme und Messwerte](MILESTONE_7_5_FINAL_ACCEPTANCE.md)
