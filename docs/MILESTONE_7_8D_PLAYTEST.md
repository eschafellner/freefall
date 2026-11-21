# FREEFALL 7.8D – Playtest

## Ausführung

```sh
npm run typecheck
npm run build
npm test
npm run balance:check
npm run balance:trace
sha256sum -c docs/enemies/schabe/baseline.sha256

# Vorhandenes Playwright und kompatibles Chromium angeben.
export PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs
export CHROMIUM_EXECUTABLE=/pfad/zu/chromium
node --conditions=development scripts/playtest-tactical-presentation.mjs docs/playtest/7-8d/mission
FREEFALL_COMBAT_DELAY_MS=160 FREEFALL_COMBAT_DROP=1 node --conditions=development scripts/playtest-combat-presentation.mjs docs/playtest/7-8d/load
FREEFALL_COMBAT_PLANET=forest FREEFALL_TACTICAL_STRESS=1 FREEFALL_COMBAT_LOAD=1000 FREEFALL_COMBAT_DELAY_MS=160 node --conditions=development scripts/playtest-combat-presentation.mjs docs/playtest/7-8d/combined
FREEFALL_COMBAT_PLANET=forest FREEFALL_COMBAT_SOLO=1 FREEFALL_COMBAT_LOAD=0,100 FREEFALL_COMBAT_QUALITY=low node --conditions=development scripts/playtest-combat-presentation.mjs docs/playtest/7-8d/solo
```

## Durchgeführt

| Prüfung | Ergebnis | Prüfweg |
| --- | --- | --- |
| Kamera und Haltung | PASS | Standing, Crouch und Aufstehen im Browser. Vorwärts-Dive bis Bauchlage und Rückwärts-Dive bis Rückenlage. Bestehende Tests decken seitliche und diagonale Dives sowie enge Hindernisse ab. Der neue Terrain-Test prüft alle sechs Haltungen und acht Blickrichtungen auf vier Planeten. |
| Rollen, Recoil und Mündung | PASS | Bestehende Tests für gültige Zielwinkel, niedrigen Waffenlauf, nahe Deckung, Waffen-FOV und Framerate. Neuer Test für Impulspriorität, Aim-Stabilität und Rücksetzen. |
| Treffer, Schaden und Ausrüstung | PASS | Server- und Client-Tests zu Miss, Schutz, Schaden, Lebens-ID, Trefferform, Kill, Granaten, Nahkampf und Stims. Im Browser bestätigter Eigenbeschuss von rechts, 15 HP Verlust, Nachladen mit sechs verworfenen Patronen und bestätigte Magazinauffüllung. |
| Deployment und beide Extraktionen | PASS | Browser zeigt Bremsschub und Aufsetzen. Grüner Planet über Albatross und Wüste über Ballon und Rettungsjäger. Je vier verbundene Operatoren mit identischem Ergebnis. Die Testsequenz verkürzt den Ballon-Countdown über die vorhandene Debug-Aktion. |
| Ergebnis bei Fehlschlag | PASS | Eisplanet mit im Test gesetztem Teamausfall. Der Server liefert `team-lost`, und der Browser zeigt das Ergebnis ohne Cockpit- oder Combat-HUD. |
| Missionsereignisse und Reconnect | PASS | Serverbestätigte Nestzerstörung, freie Operatorbewegung bei sichtbarer Meldung, um 450 ms verzögerte Kopie, echter Browser-Reconnect und anschließende Wiederholung desselben Events. Replizierter Zielzustand ist anschließend verfügbar. |
| Latenz und Eventverlust | PASS | 160 ms unmittelbar am Blast-Ereignis plus ein gezielt ausgelassenes Blast-Ereignis im Browser. Vier echte Colyseus-Verbindungen bei 140 ms simuliertem RTT. Ergänzende automatisierte Netztests mit Jitter, Reordering, Snapshots und 300-ms-Stall. |
| Vier Biome | PASS | Neun serverbestätigte Oberflächenkontakte auf Eis, Wüste, Grüner Ebene und Wald bei den jeweiligen Wetterlagen. Detailbilder im Lastreport. |
| 1.000 aktive Schaben | PASS | Walddurchlauf mit vier Operatoren und 1.000 Schaben zu Beginn. Bestätigte Explosionen, Schüsse, HUD-Schadenspfeil, Nestzerstörung und Convict-Ausfall bei aktivem Wetter und Audio. Null verworfene Server-Steps. |
| Native Grafik- und Langzeitlast | BLOCKED | Die verfügbare Umgebung stellt Software-Rendering bereit. Es fehlen Messungen auf Zielhardware und längere GPU-/Heap-Profile. |
| Manuelle Vollmissionen | NOT TESTED | Browser-Automation, vollständige Simulationsmissionen ohne Debug und gezielte Spielsequenzen wurden ausgeführt. Vier menschliche Operatoren und vollständige 20–30-Minuten-Missionen auf sämtlichen Planeten stehen zur Sicht-, Hör- und Komfortabnahme aus. |

[Testergebnisse im Wortlaut](playtest/7-8d/verification.txt) · [Ergebnis und Missionsereignisse](playtest/7-8d/mission/report.json) · [Lastmatrix und Reconnect](playtest/7-8d/load/report.json) · [Kamera- und HUD-Messwerte](CAMERA_HUD_PERFORMANCE.md)

## Browser-Bilder

- [Bremsschub](playtest/7-8d/mission/deployment.jpg) · [Aufsetzen](playtest/7-8d/mission/touchdown.jpg)
- [Bauchlage](playtest/7-8d/mission/prone.jpg) · [Rückenlage](playtest/7-8d/mission/supine.jpg) · [Schaden von rechts](playtest/7-8d/mission/damage.jpg) · [Nachschub](playtest/7-8d/mission/resupply.jpg)
- [Albatross-Ergebnis](playtest/7-8d/mission/albatross-result.jpg) · [Ballon-Ergebnis](playtest/7-8d/mission/balloon-result.jpg) · [Fehlschlag](playtest/7-8d/mission/failure-result.jpg)
- [Schnee](playtest/7-8d/load/ice-snow.jpg) · [Sand](playtest/7-8d/load/desert-sand.jpg) · [Gras](playtest/7-8d/load/green-plains-grass.jpg) · [Waldboden](playtest/7-8d/load/forest-forest-floor.jpg)
