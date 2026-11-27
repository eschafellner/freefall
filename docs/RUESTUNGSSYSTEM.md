# Rüstungssystem

Stand 27. November 2026, Balance-Release 8.3B. Teil 1 beschreibt Rüstungspunkte, Schadensaufnahme, Auswahl und Optik (8.3A), Teil 2 Laufgeschwindigkeit, Ausdauer, Hechtsprung und Rutschen je Rüstung sowie die überschwere Rüstung KR-12 Koloss (8.3B). Modell und Garderobe: [Operator-Modell](OPERATOR_MODELL.md).

## 1. Umgesetzt (8.3A)

| Rüstung | Klasse | Rüstungspunkte | Erlittener Schaden | Effektive Lebenspunkte | Optik |
| --- | --- | ---: | ---: | ---: | --- |
| SR-4 Späher | leicht | 50 | 125 % | 80 | `sr4`, Helm `sr4-haube` |
| FR-7 Feldpanzer (Standard) | mittel | 100 | 100 % | 100 | `fr7`, Helm `fr7-helm` |
| BW-9 Bollwerk | schwer | 150 | 75 % | 133 | `bw9`, Helm `bw9-helm` |
| KR-12 Koloss | überschwer | 200 | 50 % | 200 | `kr12`, Helm `kr12-helm` |

„Effektive Lebenspunkte“ sind die 100 HP des Operators geteilt durch den Schadensfaktor: So viel Rohschaden hält die Rüstung aus.

**Kurve statt Einzelwerte.** Jede Rüstung trägt nur ihre Rüstungspunkte. Der Schadensfaktor kommt aus der Kurve `equipment.json › armorEffects` mit den Stützpunkten 50 → 1,25, 100 → 1, 150 → 0,75 und 200 → 0,5. Zwischen zwei Punkten wird linear interpoliert, außerhalb gilt der nächste Punkt. Spätere Rüstungen mit Zwischenwerten brauchen deshalb keine eigene Schadensangabe: 75 Punkte ergeben 112,5 %, 125 Punkte 87,5 %. Die Kurve muss aufsteigend sortiert sein und darf mit mehr Rüstung nie mehr Schaden zulassen. Rüstungspunkte außerhalb der Kurve lehnt die Validierung ab.

**Wo sie wirkt.** Der zentrale Schadens-Resolver (`apps/server/src/systems/damage.ts`) multipliziert jeden Treffer auf einen Operator mit dem Faktor seiner Rüstung, und zwar nach dem Friendly-Fire-Faktor und vor dem Runden auf ganze Trefferpunkte. Das gilt für Nahkampf aller Schwarmkasten, den Ansturm des Assaultbreakers, Granaten (auch die eigene) und Eigenbeschuss durch Kugeln und Kolbenstoß. Convicts, Gegner und Strukturen bleiben unberührt, Respawn- und Landeschutz wirken wie bisher davor.

**Auswahl.** Die Rüstung ist Teil der Loadout-Auswahl (`LoadoutSelection.armorId`):

- *Ausrüstung* (Raum AUSRÜSTUNG): eigener Abschnitt „Rüstung“ mit Modell, Gewichtsklasse, Rüstungspunkten, erlittenem Schaden und effektiven Lebenspunkten.
- *Rüstkammer* (Raum RÜSTUNG, bisher „System noch nicht verfügbar“): alle Rüstungen nebeneinander mit drehbarer 3D-Vorschau in der Truppfarbe, Beschreibung und Werten. „Rüstung anlegen“ übernimmt das restliche Loadout unverändert.

Der Server prüft die Auswahl wie bei Waffen (bekannte ID, Freischaltung), speichert sie mit dem Loadout im Account und stellt sie beim nächsten Einsatz wieder her.

**Preise.** FR-7 gehört zur Grundausstattung. SR-4 Späher kostet 6.000 SKR (`upgrade.sr4-spaeher`), BW-9 Bollwerk 4.000 SKR (`upgrade.bw9-bollwerk`), KR-12 Koloss 8.000 SKR (`upgrade.kr12-koloss`), alle ohne Levelgrenze. Gekauft wird im **Arsenal** (Startbildschirm) oder direkt in der **Rüstkammer**: Gesperrte Rüstungen zeigen dort ihren Preis, der Hauptknopf heißt dann „Freischalten · 6.000 SKR“ und bucht über denselben Account-Endpunkt wie das Arsenal ab. Danach lässt sich die Rüstung sofort anlegen. Ohne Account (Gastraum) ist jede Rüstung verfügbar.

**Optik im Spiel.** Das Loadout bestimmt die Optik (`EffectiveLoadout.look` aus `armors[].visual` und `backpacks[].visual`). Die Spieler-Snapshots tragen `look` nur, wenn sie vom Standard abweichen; alle Clients ziehen dem Operator dann Rüstung und Helm an.

**Daten und Werkzeuge.** `equipment.json`: `armors[]` mit `weightClass`, `armorRating`, `visual` und `modifiers` sowie die Kurve `armorEffects`. Rüstungs-Modifikatoren können neben `operator.slide.*` jetzt auch `operator.armorRating` verändern, etwa für eine Variante mit +10 Punkten. Der Balance-Editor zeigt unter „Versorgung & Beute“ eine Karte „Rüstungen“ mit Punkten, Klasse, Kurve sowie abgeleitetem Schadensprozent und effektiven HP. Tests: `apps/server/test/armor.test.ts`, Optik-Zuordnung in `apps/client/test/operator-rig.test.ts`.

## 2. Laufgeschwindigkeit und Ausdauer (8.3B)

### Grundsätze

1. **Schutz gegen Beweglichkeit.** Leichte Rüstung ist die Wahl für Aufklärung, Ziele und Rückzug, schwere Rüstung für das Halten von Stellungen und das Abfangen des Schwarms. Keine Klasse ist in allem besser.
2. **Mittel ist die Referenz.** FR-7 bewegt sich wie vor 8.3B: 5,8 m/s Gehen, 9,2 m/s Sprint, Hechtsprung und Rutschen unverändert. Neu ist nur, dass auch der Sprint mit FR-7 Ausdauer kostet.
3. **Zwischenwerte ohne Sonderfälle.** Jede Wirkung hängt an den Rüstungspunkten und kommt aus derselben Kurve. Die Gewichtsklasse ist Bezeichnung, Optik und Animationsgewicht, erzeugt aber keine Sprünge in den Werten.

### Rüstungskurve

`equipment.json › armorEffects` hat je Stützpunkt diese Faktoren (relativ zu `operators.json` und `movement.json`):

| Rüstungspunkte | Schaden | Gehen | Sprint | Ausdauer | Sprintverbrauch | Erholung | Hechtsprung | Rutschen | Aufstehen |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 125 % | 106 % | 108 % | 120 | 90 % | 125 % | 110 % | 110 % | 100 % |
| 100 | 100 % | 100 % | 100 % | 100 | 100 % | 100 % | 100 % | 100 % | 100 % |
| 150 | 75 % | 92 % | 90 % | 85 | 115 % | 85 % | 85 % | 85 % | 100 % |
| 200 | 50 % | 82 % | 75 % | 70 | 135 % | 65 % | gesperrt | gesperrt | 140 % |

Zwischen den Punkten wird linear interpoliert. Liegt der Hechtsprung- oder Rutschfaktor unter 0,3, ist die Aktion gesperrt (`ARMOR_ACTION_CUTOFF`); zwischen 150 und 200 Punkten gilt das ab etwa 182 Punkten. Die Validierung verlangt, dass mehr Rüstung nie schneller, ausdauernder oder weiter springend macht und dass der Punkt bei 100 die Referenz mit allen Faktoren 1 ist. Der Balance-Editor zeigt die Kurve als Tabelle und rechnet je Rüstung Geh- und Sprinttempo, Ausdauer, Dauersprint und Hechtsprungweite aus.

### Laufgeschwindigkeit

| Rüstung | Gehen | Sprint | Gegenüber dem Schwarm |
| --- | ---: | ---: | --- |
| SR-4 (50) | 6,15 m/s | 9,94 m/s | läuft dem Jäger (5,8 m/s) auch ohne Sprint davon |
| FR-7 (100) | 5,80 m/s | 9,20 m/s | gleich schnell wie der Jäger, Sprint zum Lösen |
| BW-9 (150) | 5,34 m/s | 8,28 m/s | der Jäger holt im Gehen auf, Sprint reicht zum Lösen |
| KR-12 (200) | 4,76 m/s | 6,90 m/s | auch im Sprint nur knapp schneller als der Jäger, Schaben (3,55 m/s) bleiben zurück |

Hocke, Bauch- und Rückenlage behalten ihre Anteile (55 %, 25 %, 20 %) am Gehtempo der Rüstung. Zielen bremst wie bisher nicht.

### Ausdauer

Regeln in `movement.json › stamina` (Referenz FR-7):

| Regel | Wert | Rüstung |
| --- | --- | --- |
| Vorrat | 100 | Faktor `stamina` (120 / 100 / 85 / 70) |
| Sprint | 11 je Sekunde | × `sprintDrain` |
| Hechtsprung | 20, nur mit mindestens 20 Ausdauer | – |
| Rutschen | 15, nur mit mindestens 15 Ausdauer | – |
| Erholung | 18 je Sekunde, nach 1,2 s ohne Verbrauch | × `recovery`; geduckt und liegend × 1,25 |
| Erschöpft | bei 0 kein Sprint, bis wieder 30 % erreicht sind | Sprinttaste bleibt gedrückt: der Operator geht |
| Heilstim | füllt die Ausdauer vollständig und beendet die Erschöpfung | – |

| Rüstung | Dauersprint aus vollem Vorrat | Strecke | Voll erholt nach |
| --- | ---: | ---: | ---: |
| SR-4 | 12,1 s | 120 m | 1,2 s + 5,3 s |
| FR-7 | 9,1 s | 84 m | 1,2 s + 5,6 s |
| BW-9 | 6,7 s | 55 m | 1,2 s + 5,6 s |
| KR-12 | 4,7 s | 32 m | 1,2 s + 6,0 s |

Der Nahkampf kostet keine Ausdauer; das bleibt eine Option für später.

**Anzeige.** Unter der Lebensleiste im HUD liegt ein Ausdauerbalken. Bei vollem Vorrat ist er abgeblendet, bei Erschöpfung orange mit „Erschöpft“. Rüstkammer und Ausrüstungs-Terminal zeigen Gehen/Sprint, Ausdauer/Dauersprint und Hechtsprung/Rutschen je Rüstung, grün besser und orange schlechter als FR-7.

**Animation.** Die Gewichtsklasse steuert das Schrittgewicht: Schwere Rüstungen stehen tiefer, sinken stärker in jeden Schritt ein und rütteln Waffe und Rucksack stärker, leichte federn. Erschöpfte Operator atmen schnell und tief; Brust, Schultern und Kopf heben sich, im Stand sackt der Oberkörper nach vorn. Die Atmung folgt dem Snapshot und ist damit auch bei Mitspielern sichtbar.

### Überschwere Rüstung KR-12 Koloss

- **Rolle:** Anker des Trupps. Hält einen Assaultbreaker-Ansturm (45 Schaden → 23) und Nahkampf an der Front aus, erreicht aber Ziele und Extraktion langsamer.
- **Werte:** 200 Rüstungspunkte, 50 % Schaden (200 effektive HP), 82 % Gehen, 75 % Sprint, 70 Ausdauer, kein Hechtsprung und kein Rutschen, Aufstehen aus Bauch- und Rückenlage dauert 40 % länger. Preis 8.000 SKR.
- **Optik:** stahlblaue Platten mit orangen Kanten auf einem Stützexoskelett mit Streben an Armen und Beinen, Kürass mit hohem Kragen, dreiteilige Bauchschienen, Schulterschalen mit Nackenschutz, zwei Energiezellen am unteren Rücken, Helm mit glühendem Sehschlitz und Sensorpaar.

### Technik

- **Gemeinsame Simulation:** `packages/shared/src/config/stamina.ts`. Ausdauer zählt in ganzen Tausendstel Punkten und ändert sich genau einmal je Bewegungseingabe (1/30 s), auf dem Server wie in der Client-Vorhersage. `applyPostureInput` erhält dafür die Mobilität der Rüstung (`EffectiveLoadout.mobility`) und den laufenden Zustand.
- **Netz:** `PlayerState.stamina` (Wert, Pausenzähler, Erschöpfung) fehlt bei vollem, ausgeruhtem Vorrat. Die Vorhersage übernimmt den Zustand bei jedem Snapshot und rechnet offene Eingaben nach; Position und Ausdauer stimmen in allen vier Rüstungen ohne Korrektur überein (`apps/client/test/stamina-prediction.test.ts`). Das Sprint-Bit im Snapshot ist bei Erschöpfung aus.
- **Server:** `SimPlayer.staminaState`; Auffüllen bei Respawn, Loadout-Wechsel, Einsatzstart und Heilstim.
- **Prüfung:** `apps/server/test/stamina.test.ts` (Tempo, Sprintdauer je Rüstung, Erschöpfung, Erholung, Kosten, Sperren, Aufstehen, Stim, Snapshot). Die Golden Traces sind unverändert.

### Entscheidungen

- Ausdauer gilt für alle Klassen, auch für FR-7 (26.11.2026).
- Hechtsprung bei schwerer Rüstung (150) bleibt erlaubt, mit 85 % Weite (26.11.2026).
- Preise: SR-4 6.000 SKR, BW-9 4.000 SKR, KR-12 8.000 SKR, ohne Levelgrenze (26.11.2026).
