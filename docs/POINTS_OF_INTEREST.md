# Points of Interest

Jede Karte hat acht Points of Interest (PoI). Dort liegen Vorräte, Proben, gelegentlich eine Einsatzmarke und auf einer Karte ab Stufe 6 die Artefakte. Vorbild ist Helldivers 2.

## Typen

Ein PoI besteht aus Bauteilen, die in jedes Biom passen (Wracks, Leichen, Kisten, Sandsäcke). Dazu kommen Felsen, die das Biom selbst rendert (`kind: 'rock'`, also Sandstein in der Wüste, Eis auf der Eiswelt, Moosfels im Wald). Metallische Teile sind unsichtbare Kollider (`kind: 'debris'`). Ihr Modell baut `PointsOfInterestView` im Client aus Grundkörpern.

| Typ | Name | Radius | Besonderheit |
| --- | --- | ---: | --- |
| `rock-operator` | Gefallener Operator am Felsen | 7 m | |
| `ruin` | Zerstörter Außenposten | 8 m | |
| `albatross-wreck` | Wrack eines Albatross 02 | 11 m | **prägnant** |
| `convict-remains` | Gefallene Convicts | 6 m | |
| `trench` | Schützengraben | 7 m | |
| `drop-pod` | Abgestürzte Abwurfkapsel | 6 m | |
| `field-camp` | Verlassenes Feldlager | 8 m | |
| `burnt-nest` | Ausgebranntes Nest | 8 m | |
| `survey-rig` | Vermessungsbohrung | 7 m | |
| `gun-emplacement` | Zerstörte Geschützstellung | 8 m | |
| `relay-debris` | Relaistrümmer | 7 m | |
| `monolith` | Fremdartiger Monolith | 9 m | **prägnant** |

Jede Karte hat genau einen prägnanten PoI (Wrack oder Monolith) und sieben verschiedene andere. Die Baupläne stehen in `POI_LAYOUTS` (`packages/shared/src/world/PointsOfInterest.ts`). Ein neuer Typ braucht dort einen Eintrag und in `PointsOfInterestView.ts` einen Fall in `buildPoi`.

## Platzierung

`placePointsOfInterest` läuft im Weltgenerator (**Version 3**). Ältere Pläne werden abgelehnt, und alle generierten Welten haben neue IDs. Die feste Welt von Operation Bodenbruch erhält ihre PoI aus einem festen Seed.

- **Abstand zu reservierten Flächen:** mindestens Radius der Fläche + PoI-Radius + 10 m. Reserviert sind Landezone, Relais, Ballonplätze, Startnest und Durchbruchsregionen, bei Bodenbruch zusätzlich die Ziele und die Servicefläche.
- **Abstand der PoI untereinander:** 60 m, nach 100 Fehlversuchen 38 m.
- **Freie Fläche:** Felsen und Bauwerke dürfen nicht im Fußabdruck liegen. Bäume werden entfernt, im Wald entsteht so eine Lichtung.
- **Gelände:** höchstens 3,2 m Höhenunterschied über den Radius.
- **Ausrichtung:** Vierteldrehungen, damit die Kollider achsparallel bleiben.
- **Determinismus:** Die Platzierung nutzt weder `Math.hypot`, `sin` noch `cos`. So bleibt die Welt-ID in jedem Browser gleich.
- **Bodendetails:** Der Client hält die Flächen frei von Gras, Kampfspuren und Mid-Props.

Getestet sind 40 Seeds je Planet: Jede Welt hat 8 PoI.

## Beute

Der Server erzeugt die Beute beim Einsatzstart mit `spawnPoiLoot` (Welt, Plan-Seed, Schwierigkeit). Jede Probe ist ein eigener Gegenstand am Boden, der Platz ist frei von Kollidern.

| Stufe | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gewebeproben gespawnt | 8 | 12 | 17 | 22 | 27 | 32 | 37 |
| Gewebeproben Truppenlimit | 6 | 10 | 14 | 18 | 22 | 26 | 30 |
| Gesteinsproben gespawnt | – | – | – | 8 | 12 | 15 | 18 |
| Gesteinsproben Truppenlimit | – | – | – | 6 | 9 | 12 | 15 |
| Artefakte | – | – | – | – | – | 2–3 | 2–3 |

- **Gewebe:** 2–7 je Fundort. **Gestein:** 3–6 je Fundort. Jeder PoI überspringt eine Probenart mit 20 % Wahrscheinlichkeit. Bleibt danach Budget übrig, wird es in einem zweiten Durchgang verteilt. Nicht jeder PoI hat also jede Probe.
- **Artefakte:** 2–3 Stück, nur am prägnanten PoI. Das Limit entspricht der gespawnten Menge.
- **Einsatzmarke:** 15 % je PoI.
- **Vorräte:** 2–4 je PoI, zufällig gemischt:

| Kiste | Wirkung |
| --- | --- |
| Munitionsbox | +2 Magazine für die Primärwaffe (VX-13: Gegenwert in Patronen) |
| Erste-Hilfe-Kasten | +2 Stims |
| Granatenkiste | bis zu +4 Granaten, gekappt an der Tragekapazität (heute 2); der Rest verfällt |

Ist ein Operator voll versorgt, bleibt die Kiste liegen („Vollständig versorgt“).

## Aufnehmen, Tragen, Extraktion

`PickupSystem` (`apps/server/src/mission/Pickups.ts`):

- **Aufnehmen:** `E` innerhalb von 1,8 m nimmt den nächsten Gegenstand sofort auf. Der Hinweis zeigt Art und Truppenstand („Gewebeprobe aufnehmen · 4/10“).
- **Truppenlimit:** Proben werden nicht aufgenommen, wenn der Trupp zusammen das Limit trägt („Probenlimit des Trupps erreicht“). Die Probe bleibt dann liegen.
- **Tod:** Fällt ein Operator, liegen seine Proben einzeln um seine Position (`drop/…`) und können wieder aufgenommen werden.
- **Extraktion:** Die Proben aller extrahierten Operator werden zusammengezählt, am Truppenlimit gekappt und jedem Teilnehmer gutgeschrieben ([Ressourcen](RESOURCES.md)).
- **Einsatzmarken vom Boden** zählen sofort für den ganzen Trupp, auch ohne Hauptziele und ohne Extraktion. Sie kommen zum Einsatzlohn hinzu und unterliegen nicht der Obergrenze von 11 Marken je Mission (`MissionResult.marksFound`).

## Anzeige

- **Snapshot:** `MissionSnapshot.pickups` (Gegenstände) und `samples` (Limit, Truppensumme, je Operator).
- **HUD unten rechts:** eigene Proben und Truppenstand, sobald der Trupp Proben trägt.
- **Karte und Kompass:** zeigen PoI nicht an. Man findet sie über die Landschaft.

| Gegenstand | Modell |
| --- | --- |
| Gewebeprobe | Glasröhre mit leuchtend rotem Kern |
| Gesteinsprobe | drei Bohrkerne auf einem Träger |
| Artefakt | schwebendes, violett leuchtendes Fragment mit Ring |
| Einsatzmarke | Medaille mit Lichtsäule |
| Vorräte | olivgrüne Munitionsbox, weißer Erste-Hilfe-Kasten mit rotem Kreuz, Granatenkiste mit orangefarbenem Band |

## Prüfung

- `apps/server/test/points-of-interest.test.ts`: Platzierung, Mengen je Stufe, Truppenlimit, Vorratskapazität, Fallenlassen beim Tod, Marken und Kappung.
- `scripts/playtest-pois.mjs [Ausgabe] [Planet] [Stufe]`: Browser-Aufnahmen aller PoI und Nahaufnahmen der Gegenstände.
- Die Referenz-Traces von Operation Bodenbruch sind neu gesetzt, weil die PoI-Kollider Wege und Kontakte ändern.
