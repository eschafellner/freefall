# Playtest · Milestone 7.8A

## Wiederholung

```bash
npm run typecheck
npm test
npm run build
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256
```

Der Browser-Playtest startet einen lokalen Colyseus-Server, eine Vite-Preview, Chromium und bis zu drei zusätzliche SDK-Operatoren. Die Pfade zu Playwright und gegebenenfalls Chromium beziehen sich auf die jeweilige Testmaschine.

```bash
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs \
CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
node --conditions=development scripts/playtest-weapon-vfx.mjs /tmp/freefall-78a.json
```

## Prüffälle

| Test | Verfahren |
| --- | --- |
| Gewehr und Pistole | Browser-Operator feuert mit der Primärwaffe im Stand und kniend. Nach Waffenwechsel feuert er mit der Pistole im Stand, in Bauchlage und in Rückenlage. Der Test prüft Waffen-Slot, Tick und Leben auf den live replizierten Schüssen. |
| Animation und Laufposition | Gezielte Tests prüfen doppelte Cues, verspätete Render-Ticks, die Waffenwahl, DIVING, GETTING_UP, Respawn sowie den Welttransform eines importierten Muzzle-Markers. |
| Deckung und Effektlebensdauer | Gezielte Tests prüfen den autoritativen Schulterstrahl, blockierte Nullstrecken, Deckungsbegrenzung, Kamera-Nahbereich, Licht, Caps, Reuse, Cleanup und Dispose. |
| Browser-Präsentation | F2 prüft sichtbare Laufblitze und Hülsen. Der Test sendet einen bereits empfangenen Fehlschuss zweimal erneut und prüft den Dedup-Zähler. Ein zweiter Operator löst sichtbare Remote-Hülsen aus. |
| Grafikoptionen | Der Browser prüft auf High einen lokalen Lauflichtimpuls und bei deaktiviertem Mündungsfeuer weiterhin den Hülsenauswurf. |
| Hordenlast | Vier aktive Verbindungen feuern in der Arena auf Medium bei bis zu 1.000 Schaben. Der Test prüft, dass die Schusseffekte nach Ende des Feuerns vollständig ablaufen und kein Browserfehler anfällt. |

Der Browserlauf zeichnet einen kurzen Stichprobentest auf. Ein manueller Vergleich von Waffenklang und Kamera auf Zielhardware, ein langer Ressourcen-Soak, ein vollständiger 20–30-Minuten-Einsatz sowie der kombinierte Waldtest mit Wetter und mehreren Explosionen stehen aus. Die automatisierten Missions-, Latenz- und Reconnect-Regressionen laufen über die vorhandene Testsuite.

- [Messwerte und Grenzen](COMBAT_VFX_PERFORMANCE.md)
- [Abnahmestand](MILESTONE_7_8_FINAL_ACCEPTANCE.md)
