# Forschung

Stand 27.11.2026. Der Raum **FORSCHUNG** auf Deck 03 des Skyfall Carriers (Steuerbord, zum Bug hin) ist die Forschungsstation. Mit `E` an der Station öffnet sich das Terminal `ui/ResearchPanel.tsx`. Waffen und Rüstungen gibt es im [Arsenal](ACCOUNTS.md), Forschung nur hier.

## Forschungsgebiete

Ein Gebiet ist eine Kette von Stufen. Jede Stufe setzt die vorige voraus und kostet Proben und Sektor-Kredits ([Ressourcen](RESOURCES.md)). Daten: `packages/shared/src/definitions/research.ts` (`RESEARCH_FIELDS`). Jede Stufe ist eine Freischaltung der Art `research` im Register (`unlocks.ts`) mit `requires` auf die vorige Stufe; die IDs stehen dauerhaft in der Account-Datenbank.

### Taktische Stoffwechselmodulation

| Stufe | ID | Auswirkung | Kosten |
|---|---|---|---|
| Genetische Überlegenheit I | `research.genetik-1` | +30 Lebenspunkte | 50 Gewebe, 2.000 SKR |
| Erweitertes Training I | `research.training-1` | Ausdauer +10 % | 60 Gewebe, 10 Gestein, 3.000 SKR |
| Genetische Überlegenheit II | `research.genetik-2` | +20 Lebenspunkte | 70 Gewebe, 25 Gestein, 4.000 SKR |
| Erweitertes Training II | `research.training-2` | Ausdauer weitere +10 % | 70 Gewebe, 35 Gestein, 5 Artefakte, 5.000 SKR |
| Leistungssteigernde Einsatzversorgung I | `research.einsatzversorgung-1` | Hechtsprungweite +35 % | 70 Gewebe, 45 Gestein, 15 Artefakte, 6.000 SKR |

Alle fünf Stufen zusammen: 150 Lebenspunkte statt 100, Ausdauer +20 %, Hechtsprung +35 %. Kosten gesamt 320 Gewebe, 115 Gestein, 20 Artefakte und 20.000 SKR. Weil Gewebeproben höchstens 300 betragen, braucht die letzte Stufe neue Proben aus Einsätzen.

Auslegung der Vorgabe:

- „70 Proben“ sind Gewebeproben.
- **Ausdauer** ist der Ausdauervorrat der Rüstung. +10 % heißt 10 % länger sprinten. Die Stufen addieren sich (zweimal +10 % = +20 %). Verbrauch und Erholung je Sekunde bleiben gleich.
- **Sprungreichweite** ist die Weite des Hechtsprungs, denn einen anderen Sprung gibt es nicht. Wer in KR-12 Koloss keinen Hechtsprung hat, bekommt auch durch Forschung keinen.
- Lebenspunkte gelten in jeder Rüstung. Die Rüstung skaliert den Schaden, also steigen die effektiven Lebenspunkte mit (z. B. BW-9 mit 150 LP: 200 effektiv). Der Heilstim heilt denselben Anteil der maximalen Lebenspunkte wie bisher.
- Es gibt keine Levelgrenzen.

## Wirkung im Spiel

- Die Wirkung läuft als Modifikator-Ebene `research` durch den Stat-Resolver (`researchModifiers` → `resolveSelection`). Die Werte sind `operator.maxHealth` (+ LP), `operator.staminaFactor` und `operator.diveFactor` (Grundwert 1 + Anteil). Ohne Forschung bleiben alle Werte exakt gleich, die Golden Traces auch.
- **Server:** Die Forschung des Accounts wird beim Raumbeitritt und mit jeder Loadout-Anfrage gelesen (`AccountService.research`, `Battlefield.setResearch`). Ein unverletzter Operator bleibt voll, ein verwundeter behält seine Lebenspunkte. Spieler mit mehr als 100 LP melden `maxHp` im Snapshot, damit Truppanzeige und Lebensbalken stimmen.
- **Client:** `LoadoutReply.research` nennt die abgeschlossenen Stufen. Der Client löst sein Loadout damit auf, deshalb rechnet die Vorhersage für Ausdauer und Hechtsprung genau wie der Server. Nach einem Kauf fordert das Terminal das aktuelle Loadout erneut an (`Game.refreshResearch`), damit die Wirkung sofort gilt.
- Gastoperatoren ohne Konto forschen nicht.
- Rüstkammer, Arsenal und Ausrüstungs-Terminal zeigen Lebenspunkte, Ausdauer und Hechtsprung schon mit der eigenen Forschung.

## Terminal

Links stehen die Ressourcen, die Forschungsgebiete mit Fortschritt und die Stufenkette (erforscht, verfügbar, gesperrt). Rechts stehen Beschreibung, Auswirkung, Status, die Kosten je Ressource mit Bestand und die Wirkung auf den eigenen Operator (jetzt → nach dieser Stufe). Geforscht wird in zwei Schritten: erst „Erforschen · Preis“, dann „Forschung bestätigen“. Es gibt keine Rückerstattung. Fehlen Ressourcen oder die vorige Stufe, sagt der Knopf, was fehlt.

Prüfung: `apps/server/test/research.test.ts`, Browser-Playtest `scripts/playtest-research.mjs`.
