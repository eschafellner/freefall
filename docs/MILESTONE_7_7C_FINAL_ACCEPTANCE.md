# FREEFALL · Abnahme 7.7C

7.7C erweitert die bestehende Darstellung der vier prozeduralen Planeten. Die Wetterwahl und ihre Zeitpunkte sind serverautoritativ. Schnee, Staub, Nebel, Vegetationsbewegung und Licht sind kosmetisch. Sämtliche neuen Ressourcen entstehen aus vorhandenen Daten oder lokalem Shadercode. Die zusätzlichen Assetkosten betragen 0 €. Die drei freigegebenen Schabe-Dateien stimmen mit ihren Prüfsummen überein.

## Implementierung und geänderte Dateien

| Bereich | Dateien und Verhalten |
| --- | --- |
| Daten und Verträge | `packages/shared/src/world/PlanetWeather.ts`, `packages/shared/src/contracts/mission.ts`, `packages/shared/src/contracts/missionPlan.ts`, `packages/shared/src/index.ts`. Vier Profile pro Planet, validierte Wind- und Dunstparameter, Wetterversion, sichere statische Darstellung bei inkompatiblen Daten. |
| Server | `apps/server/src/mission/MissionAtmosphere.ts`, `MissionGenerator.ts`, `MissionInstance.ts`, `apps/server/src/rooms/FreefallRoom.ts`. Seed-basierter Zeitplan, gültige Endpunkte, monotone Einsatzzeit, optionales Tagespreset, Start/Ende und Host-geschützte Entwicklungssteuerung. |
| Licht und Renderer | `apps/client/src/rendering/ArenaView.ts`, `environment/Lighting.ts`, `environment/AtmosphereController.ts`, `environment/WeatherParticles.ts`. Gemeinsamer Render-Update, dynamischer Fog, Sky-Blend und unveränderte Szenensteuerung für Abstieg und historische Welten. Wetterwechsel sind Smoothstep-Überblendungen. |
| Vegetation | `apps/client/src/rendering/environment/VegetationWind.ts`, `apps/client/src/rendering/mission/GeneratedTerrain.ts`, `PlanetGroundDetails.ts`, `MissionEnvironment.ts`. Gemeinsame Winduniforms, versetzte Phasen, lokale Höhengewichte, bestehende Instanzen und LOD. |
| UI und Netzwerk | `apps/client/src/game/Game.ts`, `networking/Match.ts`, `rendering/GraphicsQuality.ts`, `ui/App.tsx`, `ui/CarrierConsole.tsx`. Reconnect-Abfrage, F2-Wetteranzeige, Zeitwahl im Plan, Qualitätsgrenzen 64/176/320 und Reduzierte Bewegung. |
| Tests | `apps/client/test/weather-rendering.test.ts`, `apps/server/test/planet-weather.test.ts`, `apps/server/test/multiplayer.test.ts`, `scripts/playtest-horde-director.mjs`, `scripts/playtest-planet-atmosphere.mjs`. |
| Dokumentation | Profilergänzung, Wetterarchitektur, Wind, Partikel, Pflanzen-Shader, Tageszeit, Multiplayer, Lesbarkeit, Performance, Spieltest und dieser Bericht. Bild- und Messnachweise liegen in `docs/playtest/7-7c/`. |

## Nachweise und offene Prüfpunkte

Die dokumentierten Browsermissionen verwenden echte Spielzustände und Eingaben mit gezielt platzierten Testoperatoren. Sie prüfen die prozeduralen Relaisziele, Bodenkampf, Albatross, Ballon und MissionResult. Für Audio in 7.7D stehen Wetter-Cue-IDs, der versionierte Zustandswechsel und der gemeinsame Windvektor bereit. [Wetter und Audit](PLANET_WEATHER_SYSTEM.md) · [Spieltest](MILESTONE_7_7C_PLAYTEST.md)

Die Hardware-GPU- und Produktionsabnahme bleibt offen. SwiftShader erlaubt vergleichende Softwaremessungen. Native Kosten pro Shader, Schattenpass und Transparenz, belegter VRAM und Langzeitleaks bleiben gesonderte offene Messungen. [Performance](WEATHER_PERFORMANCE.md)

## Release Gates

| Gate | Status | Ergebnis |
| --- | --- | --- |
| A · Weather Profiles | PASS | 16 validierte Zustände. Wiederholbarer Zeitplan. Fehlerhafte Profile, falsche Biome und inkompatible Wire-Daten sind abgedeckt. |
| B · Wind & Vegetation | PASS | Gemeinsamer Wind, kürzester Richtungsbogen, instanzierte Höhengewichtung und LOD-Varianten. Gras, Kräuter, Farne und Kronen laufen im Produktionsclient. |
| C · Planetary Effects | PASS | Eis und Wüste mit GPU-Partikeln, Grüne Ebene mit Pflanzenbewegung, Wald mit kontrolliertem Bodendunst. Qualitäts- und Reduced-Motion-Pfad geprüft. |
| D · Lighting & Readability | NOT TESTED | Vier repräsentative GUI-Kombinationen, alle 16 Kombinationen im automatisierten Lichttest und Eis unter 1.000er-Last geprüft. Die manuelle Vollmatrix für Gegenlicht mit Gegnern in allen Bodenlagen bleibt offen. |
| E · Multiplayer | PASS | Vier WebSocket- und Browser-Operatoren. Gemeinsame Werte und Reconnect während derselben Transition. Der unterstützte Beitritt zum Carrier-Briefing ist abgedeckt. |
| F · Performance | BLOCKED | Auf der RX 9070 XT hält der getestete Client 60 Hz in der Waldmatrix und auf High im Eis-Stresstest. Die Server-Ticks liegen im bestehenden Budget. Freigegebene Produktionsbudgets und repräsentative Zielgeräte fehlen. |
| G · Gameplay Regression | PASS | Finale Testsuite mit 295 erfolgreichen Tests. Vier Browser-Missionsresultate sowie Albatross und Ballon. TypeScript, Build, Balanceprüfung und drei Schabe-Prüfsummen erfolgreich. |
| H · Documentation | PASS | Architektur, Ausgangszustand, Effekte, Reproduktion, Messwerte, Grenzen und Audio-Anschlüsse dokumentiert. |

## Befunde aus den Tests

- Beim erzwungenen Verbindungsabbruch während eines SDK-Handshakes konnte Colyseus die Sitzreservierung ablehnen. Die Room-Behandlung fängt die Ablehnung jetzt ab und überlässt die Sitzbereinigung dem bestehenden Leave-Pfad. Im nativen Vier-Browser-Lauf durchlief der Gast den Reconnect, und der Harness beendete den Raum erfolgreich.
- Die getrennten Draw-Call-Stichproben unterschieden sich. Im direkten An-Aus-An-Vergleich mit derselben Waldkamera lagen alle Stichproben bei 274–276 Draw Calls. Die GPU-Zeit der ganzen Szene lag dort bei 0,2–0,3 ms.
- Die erste parallel zum Software-Rendering gestartete Testsuite hatte einen Timeout im vorhandenen Hordentest. Im isolierten Abschlusslauf waren 295 von 295 Tests erfolgreich, einschließlich des Hordentests.
- In der ausgeführten Prüfung bleibt kein P0- oder P1-Fehler offen. Vite meldet die bestehende Warnung zur Hauptbundlegröße. Manuelle komplette 20–30-Minuten-Partien, eine Zielgerätematrix, Pass-spezifische GPU-Zeiten und Langzeitspeicher bleiben offen.

**Gesamtabnahme offen.** Die Umsetzung liegt im Repository. Die ausstehenden Prüfungen stehen in den Gates D und F. [Performance](WEATHER_PERFORMANCE.md) · [Visueller Spieltest](MILESTONE_7_7C_PLAYTEST.md) · [Multiplayer und Reconnect](WEATHER_MULTIPLAYER_SYNC.md)
