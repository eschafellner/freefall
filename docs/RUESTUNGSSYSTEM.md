# Rüstungssystem

Stand 26. November 2026, Balance-Release 8.3A. Teil 1 beschreibt, was im Spiel ist: Rüstungspunkte, Schadensaufnahme, Auswahl und Optik. Teil 2 ist das Konzept für Laufgeschwindigkeit und Ausdauer in Abhängigkeit von der Rüstung, einschließlich der überschweren Klasse mit 200 Rüstungspunkten. Modell und Garderobe: [Operator-Modell](OPERATOR_MODELL.md).

## 1. Umgesetzt (8.3A)

| Rüstung | Klasse | Rüstungspunkte | Erlittener Schaden | Effektive Lebenspunkte | Optik |
| --- | --- | ---: | ---: | ---: | --- |
| SR-4 Späher | leicht | 50 | 125 % | 80 | `sr4`, Helm `sr4-haube` |
| FR-7 Feldpanzer (Standard) | mittel | 100 | 100 % | 100 | `fr7`, Helm `fr7-helm` |
| BW-9 Bollwerk | schwer | 150 | 75 % | 133 | `bw9`, Helm `bw9-helm` |
| *überschwer (Konzept)* | überschwer | 200 | 50 % | 200 | – |

„Effektive Lebenspunkte“ sind die 100 HP des Operators geteilt durch den Schadensfaktor: So viel Rohschaden hält die Rüstung aus.

**Kurve statt Einzelwerte.** Jede Rüstung trägt nur ihre Rüstungspunkte. Der Schadensfaktor kommt aus der Kurve `equipment.json › armorEffects` mit den Stützpunkten 50 → 1,25, 100 → 1, 150 → 0,75 und 200 → 0,5. Zwischen zwei Punkten wird linear interpoliert, außerhalb gilt der nächste Punkt. Spätere Rüstungen mit Zwischenwerten brauchen deshalb keine eigene Schadensangabe: 75 Punkte ergeben 112,5 %, 125 Punkte 87,5 %. Die Kurve muss aufsteigend sortiert sein und darf mit mehr Rüstung nie mehr Schaden zulassen. Rüstungspunkte außerhalb der Kurve lehnt die Validierung ab.

**Wo sie wirkt.** Der zentrale Schadens-Resolver (`apps/server/src/systems/damage.ts`) multipliziert jeden Treffer auf einen Operator mit dem Faktor seiner Rüstung, und zwar nach dem Friendly-Fire-Faktor und vor dem Runden auf ganze Trefferpunkte. Das gilt für Nahkampf aller Schwarmkasten, den Ansturm des Assaultbreakers, Granaten (auch die eigene) und Eigenbeschuss durch Kugeln und Kolbenstoß. Convicts, Gegner und Strukturen bleiben unberührt, Respawn- und Landeschutz wirken wie bisher davor.

**Auswahl.** Die Rüstung ist Teil der Loadout-Auswahl (`LoadoutSelection.armorId`):

- *Ausrüstung* (Raum AUSRÜSTUNG): eigener Abschnitt „Rüstung“ mit Modell, Gewichtsklasse, Rüstungspunkten, erlittenem Schaden und effektiven Lebenspunkten.
- *Rüstkammer* (Raum RÜSTUNG, bisher „System noch nicht verfügbar“): alle Rüstungen nebeneinander mit drehbarer 3D-Vorschau in der Truppfarbe, Beschreibung und Werten. „Rüstung anlegen“ übernimmt das restliche Loadout unverändert.

Der Server prüft die Auswahl wie bei Waffen (bekannte ID, Freischaltung), speichert sie mit dem Loadout im Account und stellt sie beim nächsten Einsatz wieder her.

**Preise.** FR-7 gehört zur Grundausstattung. SR-4 Späher kostet 6.000 SKR (`upgrade.sr4-spaeher`), BW-9 Bollwerk 4.000 SKR (`upgrade.bw9-bollwerk`), beide ohne Levelgrenze. Gekauft wird im **Arsenal** (Startbildschirm) oder direkt in der **Rüstkammer**: Gesperrte Rüstungen zeigen dort ihren Preis, der Hauptknopf heißt dann „Freischalten · 6.000 SKR“ und bucht über denselben Account-Endpunkt wie das Arsenal ab. Danach lässt sich die Rüstung sofort anlegen. Ohne Account (Gastraum) ist jede Rüstung verfügbar.

**Optik im Spiel.** Das Loadout bestimmt die Optik (`EffectiveLoadout.look` aus `armors[].visual` und `backpacks[].visual`). Die Spieler-Snapshots tragen `look` nur, wenn sie vom Standard abweichen; alle Clients ziehen dem Operator dann Rüstung und Helm an.

**Daten und Werkzeuge.** `equipment.json`: `armors[]` mit `weightClass`, `armorRating`, `visual` und `modifiers` sowie die Kurve `armorEffects`. Rüstungs-Modifikatoren können neben `operator.slide.*` jetzt auch `operator.armorRating` verändern, etwa für eine Variante mit +10 Punkten. Der Balance-Editor zeigt unter „Versorgung & Beute“ eine Karte „Rüstungen“ mit Punkten, Klasse, Kurve sowie abgeleitetem Schadensprozent und effektiven HP. Tests: `apps/server/test/armor.test.ts`, Optik-Zuordnung in `apps/client/test/operator-rig.test.ts`.

## 2. Konzept: Laufgeschwindigkeit und Ausdauer

### Ziele

1. **Schutz gegen Beweglichkeit.** Leichte Rüstung ist die Wahl für Aufklärung, Ziele und Rückzug, schwere Rüstung für das Halten von Stellungen und das Abfangen des Schwarms. Keine Klasse ist in allem besser.
2. **Mittel bleibt die Referenz.** Mit FR-7 ändert sich nichts gegenüber heute: 5,8 m/s Gehen, 9,2 m/s Sprint, Hechtsprung und Rutschen wie bisher.
3. **Zwischenwerte ohne Sonderfälle.** Wie beim Schaden hängt jede Wirkung an den Rüstungspunkten und kommt aus derselben Kurve. Die Gewichtsklasse ist nur Bezeichnung, Optik und Animationsgewicht und erzeugt keine Sprünge.
4. **Spürbar, aber nicht zäh.** Unterschiede von 6–25 % je Stufe, sichtbar auch in der Animation (Schrittgewicht, Beckenabsenkung, Atmen).

### Datenmodell

Die Stützpunkte von `armorEffects` bekommen weitere Spalten. Nur `damageTaken` ist heute verdrahtet, die anderen Spalten sind der Vorschlag:

| Rüstungspunkte | Schaden | Gehen | Sprint | Ausdauer max. | Sprintverbrauch | Erholung | Hechtsprung-Weite | Rutschweite |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 125 % | 106 % | 108 % | 120 | 90 % | 125 % | 110 % | 110 % |
| 100 | 100 % | 100 % | 100 % | 100 | 100 % | 100 % | 100 % | 100 % |
| 150 | 75 % | 92 % | 90 % | 85 | 115 % | 85 % | 85 % | 85 % |
| 200 | 50 % | 82 % | 75 % | 70 | 135 % | 65 % | kein Hechtsprung | kein Rutschen |

```json
"armorEffects": [
  { "rating": 50,  "damageTaken": 1.25, "walk": 1.06, "sprint": 1.08, "stamina": 120, "sprintDrain": 0.9,  "recovery": 1.25, "dive": 1.1,  "slide": 1.1 },
  { "rating": 100, "damageTaken": 1,    "walk": 1,    "sprint": 1,    "stamina": 100, "sprintDrain": 1,    "recovery": 1,    "dive": 1,    "slide": 1 },
  { "rating": 150, "damageTaken": 0.75, "walk": 0.92, "sprint": 0.9,  "stamina": 85,  "sprintDrain": 1.15, "recovery": 0.85, "dive": 0.85, "slide": 0.85 },
  { "rating": 200, "damageTaken": 0.5,  "walk": 0.82, "sprint": 0.75, "stamina": 70,  "sprintDrain": 1.35, "recovery": 0.65, "dive": 0,    "slide": 0 }
]
```

Ein Wert von 0 bei `dive` oder `slide` sperrt die Aktion. Linear interpoliert sinkt die Weite zwischen 150 und 200 Punkten von 85 % auf 0. Damit eine Rüstung mit 190 Punkten keinen Hechtsprung von wenigen Zentimetern bekommt, sperrt eine Schwelle die Aktion unter 30 % Restweite, also ab etwa 182 Punkten.

### Laufgeschwindigkeit

| Klasse | Gehen | Sprint | Gegenüber dem Schwarm |
| --- | ---: | ---: | --- |
| leicht (50) | 6,15 m/s | 9,94 m/s | läuft dem Jäger (5,8 m/s) auch ohne Sprint davon |
| mittel (100) | 5,80 m/s | 9,20 m/s | gleich schnell wie der Jäger, Sprint zum Lösen |
| schwer (150) | 5,34 m/s | 8,28 m/s | der Jäger holt im Gehen auf, Sprint reicht zum Lösen |
| überschwer (200) | 4,76 m/s | 6,90 m/s | auch im Sprint nur knapp schneller als der Jäger, Schaben (3,55 m/s) bleiben zurück |

Die Werte gelten im Stand. Hocke, Bauch- und Rückenlage behalten ihre Anteile (55 %, 25 %, 20 %) relativ zum neuen Gehtempo. Zielen bremst wie bisher nicht.

### Ausdauer

Heute ist der Sprint unbegrenzt. Das Konzept führt Ausdauer als neue, serverautoritative Ressource ein:

| Regel | Mittel (Referenz) | Hinweis |
| --- | --- | --- |
| Vorrat | 100 | Rüstung skaliert über `stamina` |
| Sprint | 11 je Sekunde | × `sprintDrain` |
| Hechtsprung | 20 einmalig | nur mit mindestens 20 Ausdauer |
| Rutschen | 15 einmalig | nur mit mindestens 15 Ausdauer |
| Nahkampf | 8 einmalig | optional, bremst Kolbenstoß-Spam |
| Erholung | 18 je Sekunde, ab 1,2 s nach dem letzten Verbrauch | × `recovery`; in Hocke und Liegend × 1,25 |
| Erschöpft | bei 0 kein Sprint, bis wieder 30 % erreicht sind | schweres Atmen, mehr Waffenschwanken beim Zielen |
| Heilstim | füllt die Ausdauer sofort auf | gibt dem Stim eine zweite Aufgabe |

Daraus ergeben sich je Klasse:

| Klasse | Dauersprint aus vollem Vorrat | Strecke | Voll erholt nach |
| --- | ---: | ---: | ---: |
| leicht | 12,1 s | 120 m | 1,2 s + 5,3 s |
| mittel | 9,1 s | 84 m | 1,2 s + 5,6 s |
| schwer | 6,7 s | 55 m | 1,2 s + 5,6 s |
| überschwer | 4,7 s | 32 m | 1,2 s + 6,0 s |

Damit bleibt der Sprint für alle ein Werkzeug zum Lösen aus dem Schwarm. Bei leichter Rüstung trägt er über die halbe Karte, bei überschwerer reicht er nur bis zur nächsten Deckung.

### Überschwere Rüstung (200 Rüstungspunkte)

- **Rolle:** Anker des Trupps. Hält einen Assaultbreaker-Ansturm (45 Schaden → 23) und Nahkampf an der Front aus, erreicht aber Ziele und Extraktion langsamer.
- **Werte:** 50 % Schaden (200 effektive HP), 82 % Gehen, 75 % Sprint, 70 Ausdauer, kein Hechtsprung und kein Rutschen. Hocke und Bauchlage bleiben möglich; das Aufstehen aus der Bauchlage dauert 40 % länger.
- **Optionen für später:** Immunität gegen das Umwerfen durch den Ansturm, falls Operator einmal zu Boden gehen können; eigener Rucksack-Slot für schwere Waffen.
- **Optik:** eigener Satz mit Exoskelett-Streben, durchgehenden Platten und Sehschlitz-Helm. Das Rig erhält die Gewichtsklasse bereits (`CompiledLook.weight`) und kann Schritt, Beckenabsenkung und Armpendeln schwerer zeigen.
- **Freischaltung:** 8.000 SKR (entschieden am 26.11.2026). Eine Levelgrenze ist offen.

### Zwischenwerte und eigene Rüstungen

Neue Rüstungen setzen nur Rüstungspunkte und Klasse. Beispiele:

| Rüstungspunkte | Schaden | Gehen | Sprint | Ausdauer | Sprintverbrauch | Erholung |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 75 (leicht-mittel) | 112,5 % | 103 % | 104 % | 110 | 95 % | 112,5 % |
| 125 (mittel-schwer) | 87,5 % | 96 % | 95 % | 92,5 | 107,5 % | 92,5 % |
| 175 (schwer+) | 62,5 % | 87 % | 82,5 % | 77,5 | 125 % | 75 % |

Einzelne Rüstungen mit Eigenheiten, etwa „Läufer“ mit 100 Punkten und +15 Ausdauer, nutzen die vorhandenen Rüstungs-Modifikatoren auf neue Stat-Schlüssel (`operator.stamina.max`, `operator.speed.walk` …). Die Kurve bleibt dabei für alle gleich.

### Technische Umsetzung (Vorschlag)

1. **Daten:** `armorEffects` um die Spalten erweitern, Schema, Validierung (jede Spalte monoton in die richtige Richtung) und Editorkarte ergänzen.
2. **Effektive Werte:** `EffectiveLoadout.mobility` mit Geh- und Sprinttempo, Ausdauerwerten, Hechtsprung- und Rutschfaktor. `movePlayer` nimmt die Tempi heute schon als Parameter (`speeds`, `sprintAllowed`), Server und Client-Prediction lesen sie aus dem eigenen Loadout.
3. **Ausdauer deterministisch:** Zustand in der gemeinsamen Bewegungssimulation (shared), damit Prediction und Server gleich rechnen. Im Snapshot reicht ein Byte (0–255), Korrekturen laufen wie bei der Position über die Reconciliation.
4. **Haltungen:** Hechtsprung und Rutschen prüfen Ausdauer und Sperre, Weite über die Faktoren; das Aufstehen nutzt den Faktor der Klasse.
5. **HUD und Audio:** Ausdauerbalken unter den HP, Atemgeräusch bei Erschöpfung, kurzer Hinweis „Erschöpft“.
6. **Animation:** Gewichtsklasse an das Rig (Kadenz, Beckenhub, Federn), Atemanimation bei Erschöpfung.
7. **Prüfung:** Für Mittel bleiben alle Golden Traces gleich. Neue Tests je Klasse: Tempo, Sprintdauer, Erholung, Sperren, Prediction ohne Korrektur.

### Entscheidungen (26.11.2026)

- **Ausdauer gilt für alle Klassen,** auch für die Standardrüstung. Der Sprint ist damit nicht mehr unbegrenzt.
- **Hechtsprung bei schwerer Rüstung (150) bleibt erlaubt,** mit 85 % Weite. Gesperrt ist er erst bei überschwerer Rüstung.
- **Preise:** SR-4 Späher 6.000 SKR, BW-9 Bollwerk 4.000 SKR, überschwere Rüstung 8.000 SKR. Levelgrenzen sind nicht festgelegt.

Offen bleibt nur die Levelgrenze für die überschwere Rüstung.
