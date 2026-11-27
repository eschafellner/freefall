# Ressourcen

Operator verdienen in Einsätzen fünf Ressourcen. Mit ihnen werden im **Arsenal** (Raum auf Deck 03 des Skyfall Carriers) Waffen, Waffenaufsätze und Ausrüstung freigeschaltet, in der **Forschung** ([FORSCHUNG](FORSCHUNG.md)) die Forschungsstufen. Das Vorbild ist Helldivers 2: Lohn für den Missionsabschluss, Proben nur bei Extraktion, Verfall an der Obergrenze.

Das Register liegt in `packages/shared/src/definitions/resources.ts` (`RESOURCES`, `MISSION_RESOURCE_REWARDS`). Die IDs stehen in der Datenbank und werden nie umbenannt.

| ID | Ressource | Kurz | Quelle | Verwendung | Start | Maximum |
| --- | --- | --- | --- | --- | ---: | ---: |
| `credits` | Sektor-Kredits | SKR | Missionsabschluss | Waffen und Waffenaufsätze | 5.000 | 50.000 |
| `marks` | Einsatzmarken | Marken | Missionsabschluss | Ausrüstung | 0 | 250 |
| `tissue` | Gewebeproben | Gewebe | im Einsatz gefunden | Ausrüstung und Forschung | 0 | 300 |
| `rock` | Gesteinsproben | Gestein | im Einsatz gefunden | Ausrüstung und Forschung | 0 | 150 |
| `artifact` | Artefakte | Artefakte | im Einsatz gefunden | Ausrüstung und Forschung | 0 | 100 |

## Einsatzlohn

SKR und Einsatzmarken gibt es, sobald der Trupp die Hauptziele erfüllt hat. Ob jemand extrahiert wird, spielt keine Rolle. Ohne erfüllte Hauptziele gibt es keinen Lohn. Wie bei den EP gilt die beim Abflug verriegelte Teilnehmerliste: Auch wer gefallen ist oder die Verbindung verloren hat, erhält den vollen Lohn.

| Stufe | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SKR | 250 | 500 | 800 | 1.200 | 1.600 | 2.000 | 2.500 |
| Einsatzmarken | 2 | 3 | 4 | 6 | 7 | 9 | 11 |

**Einsatzmarken vom Boden** (15 % je PoI) zählen zusätzlich, auch ohne Hauptziele, und unterliegen nicht der Obergrenze je Mission.

**Optionale Ziele.** Jedes erfüllte optionale Ziel (heute die Nestaufgabe) bringt zusätzlich 20 % der Basis-SKR und 1 Einsatzmarke. Eine Mission bringt höchstens 11 Einsatzmarken. Auf Stufe 7 erhöht ein optionales Ziel deshalb nur die SKR (2.500 → 3.000).

## Proben und Artefakte

Jeder Operator trägt die Proben, die er aufgenommen hat. Bei der Extraktion werden die Proben aller extrahierten Operator zusammengezählt (`MissionResult.samples`). Jeder Teilnehmer der verriegelten Liste erhält die volle Menge, auch wer gefallen ist. Scheitert die Extraktion, sind alle Proben verloren. Proben brauchen keine erfüllten Hauptziele.

Proben liegen einzeln an den [Points of Interest](POINTS_OF_INTEREST.md). Fällt ein Operator, liegen seine Proben einzeln am Boden und können wieder aufgenommen werden. Der Trupp darf je Stufe nur eine begrenzte Menge tragen und extrahieren (Truppenlimit). Der Debugbefehl `sample:tissue`, `sample:rock` oder `sample:artifact` (`mission-debug`, nur in Debug-Räumen) legt dem Host eine Probe in den Rucksack. Debug-Räume schreiben nichts gut.

## Obergrenze

Was über dem Maximum liegt, verfällt. Ergebnisbildschirm und Dienstakte zeigen den verfallenen Teil an, z. B. „Maximum erreicht, verfallen: 300 SKR“.

## Kosten und Kauf

Eine Freischaltung mit `acquisition: 'choice'` kann einen Preis haben: `cost: { credits: 2500 }` oder `cost: { marks: 20, tissue: 5 }`. Level und Voraussetzungen gelten weiter. Eine Waffe ab Level 5 lässt sich also erst ab Level 5 kaufen. `createUnlockRegistry` prüft: Preise gibt es nur bei `choice`, nur für bekannte Ressourcen, als ganze Zahl von 1 bis zum Maximum der Ressource.

Der Kauf läuft in einer Transaktion: Besitz prüfen, Guthaben prüfen, Preis abbuchen, Freischaltung schreiben. Es gibt keine Rückerstattung. Das Arsenal zeigt das Guthaben, den Preis jedes Eintrags und bei zu wenig Guthaben, was fehlt. Preise:

| Freischaltung | Level | Preis |
| --- | ---: | ---: |
| VX-13 Cerberus (Schrotflinte) | 2 | 3.000 SKR |
| MP-99 (Maschinenpistole, 10 mm) | 5 | 4.500 SKR |
| Viktor 55 (Maschinenpistole, .55) | 7 | 6.000 SKR |
| Kaibal 50 (Doppellauf, 7,77 × 50 mm) | 8 | 3.000 SKR |
| SR-4 Späher (leichte Rüstung) | 1 | 6.000 SKR |
| BW-9 Bollwerk (schwere Rüstung) | 1 | 4.000 SKR |
| KR-12 Koloss (überschwere Rüstung) | 1 | 8.000 SKR |

Die übrige Grundausstattung bleibt kostenlos. Migration 5 hat die VX-13 allen Accounts entzogen, die sie als Grundausstattung besaßen. Wer sie im Loadout wählt, ohne sie zu besitzen, erhält „Nicht freigeschaltet: VX-13 Cerberus. Freischalten im Arsenal.“

Vorgesehene Zuordnung: Waffen und Waffenaufsätze kosten SKR. Ausrüstung kostet Einsatzmarken und eventuell Proben. Forschung kostet Proben und Artefakte.

## Datenbank

Migration 4 (`AccountStore.ts`):

| Tabelle | Inhalt |
| --- | --- |
| `resource_ledger` | Jede Buchung mit Account, Ressource, Betrag (Gutschrift positiv, Kauf negativ), Grund und Quelle. Eindeutig je Account, Ressource, Grund und Quelle. |
| `account_resources` | Guthaben je Account und Ressource, ein Cache des Buchs (`CHECK amount >= 0`). |
| `mission_participants.resources` | JSON mit gutgeschriebenem und verfallenem Teil je Einsatz für die Dienstakte. |

| Grund | Quelle | Bedeutung |
| --- | --- | --- |
| `start` | `start` | Startguthaben. Die Migration schreibt bestehenden Accounts einmalig 5.000 SKR gut. |
| `mission` | Ergebnis-ID | Einsatzlohn und Proben, gekappt an der Obergrenze |
| `unlock` | Freischaltungs-ID | Kauf (negativ) |
| `admin` | zufällige ID | `grant-resource` |

Die Einsatzabrechnung schreibt EP und Ressourcen in derselben Transaktion. Die Ergebnis-ID verhindert doppelte Gutschriften. `admin.js reconcile` berechnet neben den EP auch die Ressourcen aus dem Buch neu. Datenexport und Kontolöschung umfassen das Ressourcenbuch.

```bash
docker compose exec game node apps/server/dist/accounts/admin.js grant-resource "Name#1234" credits 2000
```

## Verträge und Anzeige

- `AccountProfile.resources`: Guthaben aller fünf Ressourcen.
- `MissionResult.rewards[].resources`: Lohn je Teilnehmer vor den Obergrenzen. `MissionResult.samples`: extrahierte Proben.
- `AccountProgress.resources`: `credited`, `forfeited` und das neue Guthaben (`balance`).
- `MissionHistoryEntry.resources` und `forfeited` für die Dienstakte.
- `POST /api/account/unlocks` liefert zusätzlich das aktualisierte Profil.

| Ort | Anzeige |
| --- | --- |
| Startbildschirm oben rechts | SKR und Einsatzmarken neben dem Level |
| Arsenal (Carrier), Dienstakte | alle fünf Ressourcen mit Maximum; im Arsenal Preise |
| Ergebnisbildschirm | Einsatzlohn, extrahierte Proben, Gutschrift mit verfallenem Teil, neues Guthaben |
| Dienstakte je Einsatz | gutgeschriebene und verfallene Ressourcen |
| HUD im Einsatz | getragene Proben und Truppenstand |
