# Spieltest · Milestone 7.8B

## Reproduktion

```bash
npm run typecheck
npm run build
npm run balance:check
node --conditions=development apps/server/test/support/balance-trace.ts --check
sha256sum -c docs/enemies/schabe/baseline.sha256
npm test
```

Die Browserharnesses starten Chromium, Vite und einen lokalen Colyseus-Server. Playwright kann extern vorhanden sein. Die Skripte verwenden am Beispiel des ersten Befehls ein Browserfenster und drei echte SDK-Clients. Der Spielserver berechnet die Treffer aus normalen Inputs. Der lokale Harness platziert Operatoren und Gegner für reproduzierbare Schusswinkel und schaltet die prozedurale Mission frei.

```bash
export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/pfad/zu/chromium

node --conditions=development scripts/playtest-impact-feedback.mjs /tmp/freefall-78b-world
FREEFALL_HIT_ACCEPTANCE=1 node --conditions=development scripts/playtest-weapon-vfx.mjs /tmp/freefall-78b-arena.json
```

## Geprüfte Szenarien

| Prüffall | Nachweis |
| --- | --- |
| Schnee, Eis, gefrorener Fels | Eiswelt mit `windy-snow`. Servermaterial, Normale, aktiver Points-Batch, räumliche Audiostimme und Cleanup. |
| Sand, harter Boden, Fels | Wüste mit `light-dust-gusts`. Kontrollierte Schusswinkel mit denselben Prüfungen. |
| Gras, Erde, Fels | Grüne Ebene bei klarem Wetter. Kontrollierte Terrain- und Objekttreffer. |
| Waldboden, Fels, Holz, Metall | Wald mit `ground-mist`, darunter Stamm-Collider und Albatross-Hülle. |
| Treffer, Tod, Fehlschuss | Arena-Browser mit realen lokalen Eingaben. Bestätigungs- und Kill-Marker, Zugehörigkeit zum Schützen und keine Marker bei Weltkontakten oder Reichweitenende. |
| Friendly Fire | Geschützter sowie ungeschützter Operator. Der geschützte Kontakt lässt HP und Marker unverändert. Beim beschädigten Operator stimmen Ziel-Leben, blauer Marker und Schaden. |
| PRONE und SUPINE | Browserlauf prüft beide Haltungen mit der Pistole. Die Serverregression prüft in beiden Haltungen Boden-Impact, Normale, Schabenkontakt und Nullstreckenabbruch an naher Deckung. |
| Mehrspieler und Wiederholung | Vier echte Verbindungen. Die vier Weltszenarien wiederholen je zwei echte, bereits empfangene Pakete. Partikel- und Audiozahl steigen dadurch nicht. Der Waldlauf unterbricht die Verbindung des Browser-Hosts, prüft den Reconnect und setzt danach die Impacts fort. |
| Latenz und Reihenfolge | Die Schabenbestätigung wurde nach dem autoritativen Treffer 175 ms zurückgehalten. Der Marker blieb bis zur Zustellung neutral. Ein Remote-Schuss mit Tick 833 wurde vor Tick 830 zugestellt. Beide Impacts erschienen je einmal. Die allgemeine Netzwerkregression simuliert 140 ms RTT mit vier Colyseus-Clients. |
| Hordenlast | 0, 100, 250, 500 und 1.000 aktive Gegner bei Waldboden und Bodennebel. Ab 250 Gegnern feuern vier Operatoren. |
| Missionen | Ein Browser-Einsatz im Wald (Seed 63, Low) lief bis zur Ballonextraktion mit Ergebnis nach 3.414 Simulations-Ticks. Bestehende End-to-End-Tests prüfen Operation Bodenbruch, beide Extraktionspfade, generierte Vier-Client-Aufträge, Reconnect und MissionResult. |

Der reproduzierte Browsertest misst den gestarteten Audio-Pfad und die vorhandene Distanzdämpfung. Der subjektive Hörvergleich auf Zielhardware, Paketverlust auf einem physischen Netz und der längere manuelle Playtest stehen aus. Die native Waldmatrix auf der Radeon RX 9070 XT erreichte bei 1.280 × 720 rund 60 FPS.

Der native 65-Sekunden-Test lässt sich mit demselben Testskript und den folgenden Einstellungen wiederholen.

```bash
FREEFALL_BROWSER_ANGLE=gl FREEFALL_IMPACT_PLANET=forest \
FREEFALL_BROWSER_WIDTH=1280 FREEFALL_BROWSER_HEIGHT=720 \
FREEFALL_IMPACT_QUALITY=high FREEFALL_IMPACT_LOAD=1000 FREEFALL_IMPACT_SAMPLE_MS=65000 \
node --conditions=development scripts/playtest-impact-feedback.mjs /tmp/freefall-78b-high
```

- [Rohdaten der vier Welten und der Hordenlast](playtest/7-8b/results.json) · [Native Waldmessung](playtest/7-8b/native/results.json) · [High-Dauerfeuer](playtest/7-8b/soak-high.json)
- [Arena-Rohdaten](playtest/7-8b/arena.json) · [Mission mit Extraktion und Audio-Pegel](playtest/7-8b/mission.log) · [Build und Tests](playtest/7-8b/verification.txt)
- [Schnee](playtest/7-8b/ice-snow.jpg) · [Wüste](playtest/7-8b/desert-sand.jpg) · [Grüne Ebene](playtest/7-8b/green-plains-grass.jpg) · [Wald](playtest/7-8b/forest-forest-floor.jpg) · [Waldlast](playtest/7-8b/forest-1000.jpg)
