# 7.7A · Playtest

Chromium 153.0.8010.12 mit ANGLE/OpenGL, 1280 × 720. Die Browserläufe starten einen lokalen Colyseus-Raum und einen Produktionsbuild. Der Host wählt auf dem Carrier einen generierten Relaisverteidigungsauftrag mit Missions-Seed 0. Für die visuelle Prüfung stellt die Testfixture den Operator bei einer Landmarke und dann außerhalb der Flugzeugkollision in der Landezone auf.

| Planet | Welt-Seed | Sichtprobe | Browserprüfung |
| --- | ---: | --- | --- |
| Grüne Ebene | 17 | Felsblock und aufgelockerte Wolken | Medium, HUD, Fadenkreuz, PRONE, SUPINE, Schussabgabe, Aufstehen |
| Wüste | 31 | Sandsteinbogen vor der warmen, leicht staubfarbenen Ferne | Medium, HUD, Fadenkreuz, PRONE, SUPINE, Schussabgabe, Aufstehen |
| Eiswelt | 48 | Kalte Wolkendecke und gedämpftes Licht auf den Eisformationen | Low, Medium, High, HUD, Fadenkreuz, PRONE, SUPINE, Schussabgabe, Aufstehen |
| Wald | 63 | Gestaffelte Kronen und lesbare Bodenflächen im Schatten | Deployment bis zur Landung, Low, Medium, High, HUD, Fadenkreuz, PRONE, SUPINE, Schussabgabe, Aufstehen |

Die Schussabgabe wurde in beiden Bodenhaltungen am autoritativen Munitionsverbrauch geprüft. Die Platzierung enthält eine einzelne Schabe. In den Aufnahmen waren Eiswelt, Wüste und Grüne Ebene in stehender Position und in Bauchlage visuell beurteilbar. Je nach Bewegung verließ die Schabe den Bildausschnitt. Ein gezielter Treffer- und Gegenlichtvergleich in beiden Haltungen steht aus. Im Wald wurden Bodendetails und Silhouetten in der Lichtung sowie Gegnergruppen im separaten Lasttest geprüft.

[Vorher/Nachher an den Landmarken](visual-style/planet-atmosphere-7-7a.jpg)

## Reproduktion

```sh
npm run build -w @freefall/shared
env PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_EXECUTABLE=/path/to/chromium \
  FREEFALL_BROWSER_ANGLE=gl node --conditions=development scripts/playtest-planet-atmosphere.mjs
```

Ohne explizites ANGLE-Backend verwendet der Harness SwiftShader. Er gibt den lokalen Pfad zu den PNG-Aufnahmen aus und prüft Browser- und Rendererfehler.

## Mission und Koop

- **PASS · Automatisierte Regression.** 283 Tests. Darin vollständige Eingabeläufe für alle vier Planeten in der Serversimulation, beide Extraktionsarten, Teamwipe, 400 generierte Welten, Bewegung und Kollision, Koop-Plan und Reconnect, Spawn-Validierung, 1.000-Gegner-Netzwerktests und Schabe-Prüfsummen.
- **PASS · Gerenderter Vierertrupp im Wald.** Vier Chromium-Clients im selben Raum, 1.000 aktive Gegner während des Messfensters. Danach Relaisinteraktionen und Ballon-Extraktion bis zum Resultat mit einem extrahierten Operator. Der Test nutzt kontrollierte Aufstellung und eine Lastfixture. [Messprotokoll](ENVIRONMENT_PERFORMANCE.md)
- **PASS · Lokale Atmosphärenauflösung.** Drei Tests prüfen Gültigkeitsgrenzen, vier bekannte 7.6-Welt-Hashes, Profilauflösung aus wiederhergestellter Weltidentität, Szenenwechsel, HDR/LDR und das Freigeben von Sky-Texturen.
- **NOT TESTED.** Menschlicher Vierertrupp, vollständige gerenderte 20–30-Minuten-Einsätze pro Planet, akustische Abnahme, separater Mündungsfeuer- und Gegenlichtvergleich, browserbasierter visueller Reconnect-Vergleich und breite Hardwarematrix.
