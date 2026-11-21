# Horde Director · Verifikation für 7.4D

## Ausgeführt

| Szenario | Ergebnis |
| --- | --- |
| Normale Welle und Recovery | Seed 421337. Natürlicher Durchlauf durch alle fünf Zustände. Die Wiederholung erzeugte dieselbe Welle mit denselben Positionen. Getrennte Durchläufe verifizierten ein, zwei, drei und vier Operatoren. Die Gegner blieben während RECOVERY aktiv. |
| Validierung und verteilter Trupp | Kandidaten in Weltgeometrie, außerhalb der Ebene, in einem Operator, in einer bestehenden Schabe oder auf einer abgetrennten Navigationsseite wurden verworfen. Ein abgewandter Operator konnte einen Spawn gegenüber einem anderen Operator mit direkter Sicht nicht freigeben. Ein vollständig verdeckter Kandidat mit Umweg war zulässig. |
| Begrenzte Erzeugung | Gemeinsamer Cap, Vorrang regulärer Spawns, Freigabe nach Wellentimeout und Wiederverwendung eines ECS-Slots geprüft. Eine vollständig einsehbare Region endete als `blocked`. Ein Lebensverlust steigerte Pressure graduell. |
| Missionspriorität und Nester | Eine laufende Welle gab bei Zielverteidigung, Nestzerstörung und MissionResult ihre Reservierung sofort frei. Nesttod beendete die zugehörige reguläre Erzeugung. Bereits erzeugte Schaben blieben im ECS. Natürlicher FREEFALL-Lauf mit bis zu zehn aktiven Nestern und 1.000 Schaben. |
| Echtzeit-Multiplayer | Vier lokale Colyseus-Clients erhielten eine einzige serverseitige Welle und deren Mindestzustand. Ein wiederverbundener Client erhielt dieselbe Wellen-ID und vorhandene Gegner-IDs. Derselbe Lauf replizierte eine gültige Nachschubtransaktion an alle vier Clients. |
| Vollständiger Missionsabschluss | Automatisierte, reguläre Bodenbruch-Durchläufe ohne Debug-Eingriff nach dem Start über Albatross mit einem und vier Operatoren sowie Ballon mit zwei Operatoren. In allen Fällen waren Alpha, Bravo, MissionResult und Carrier-Rückkehr erfolgreich. |
| Ballon unter Spitzenlast | Vier Operatoren erfolgreich extrahiert. 1.000 aktive Schaben in 2.834 von 2.850 Ticks. Der Last-Harness beschleunigte Positionierung und Erzeugung. |
| Chromium-Stichprobe | Produktionsbuild, F2-Status einer gestarteten Welle und 1.000 aktive Gegner an einem gerenderten Client mit drei weiteren SDK-Verbindungen. Keine Browserfehler im Director-Harness. |
| Chromium-Missionsablauf | Das ältere `playtest-ms6.mjs stress` lief vom Carrier über Touchdown, Waffenwechsel, Nachladen, Stim und Grenaten bis zum Ballon, MissionResult und Carrier. Das Fixture setzte Relaisabschluss und Rettungsjäger per Debug und füllte die Horde vor der Abholung auf 1.000 Gegner. Beim gemessenen Checkpoint waren noch 997 Gegner aktiv. Keine Browserfehler. |
| Regressionssuite | 245 automatisierte Tests bestanden, darunter Schaben-Asset- und ECS-Prüfsummen, Missionspfade, Waffen, Bewegungszustände, Netzwerkkonsistenz und bestehende Angriffsreplikation. TypeScript-Prüfung, Build und Registry-Prüfung erfolgreich. Vite meldet die Größenwarnung für das Client-Hauptbundle. |

## Reproduktion

```sh
npm run typecheck
npm run build
npm run balance:check
npm test
npm run benchmark -- enemy-ai 1800 421337 matrix director
npm run benchmark -- mission 1800 421337 4 director
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
  node --conditions=development scripts/playtest-horde-director.mjs
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
  node --conditions=development scripts/playtest-ms6.mjs stress
```

Die Netzwerktests und der Browsertest benötigen einen lokalen Loopback-Port. Das Browserfixture stellt das Profil ausdrücklich auf SwiftShader. Im lokalen Spiel zeigt F2 die aktuellen Serverwerte. Im Debugraum kann der Host mit **Welle anstoßen** die Wartezeit auf die nächste zulässige Welle verkürzen. [Messwerte und Testbedingungen](ENEMY_AI_PERFORMANCE.md)

## Offene Spielabnahme für 7.4E

- **NOT TESTED** · Menschlicher Vierertrupp über vollständige Bodenbruch-Durchläufe mit natürlichen Wellen. Lesbarkeit des Anmarschs, Recovery-Länge und Frust bei versetzten Blickrichtungen über mehrere Läufe beurteilen.
- **NOT TESTED** · Vier gerenderte Clients mit Hardware-GPU, realer WAN-Latenz und 1.000 Schaben. Renderbudget, tatsächliche End-to-End-Bandbreite und Schwankungen im Client prüfen.
- **NOT TESTED** · Längerer manueller Mehrstundenlauf mit wiederholten Reconnects und mehreren Missionen im gleichen Raum. Entity- und Speicherentwicklung über mehrere Rückkehrzyklen messen.
