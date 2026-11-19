# Waffenpräsentation

Die **Kestrel AR-01** ist die bisherige Testwaffe mit einem neuen prozeduralen Ersatzmodell. Sie zeigt Gehäuse, Lauf, Handschutz, Schaft, Magazin und ein kompaktes Optik-Modul. Gehäuse und Magazin verwenden pro Teil eingefärbte Geometrie und ein geteiltes PBR-Material. Das Modell ist projektinterner Code. Es wurden keine Drittanbieter-Ressourcen oder geschützten Spieldesigns übernommen.

Die Definition in `packages/shared/src/balance/data/weapons.json` verbindet ID, Namen, Kategorie, Werte und visuelle Asset-ID ([Balance-Workflow](BALANCE_WORKFLOW.md)). Schussfolge (10/s), Schaden (24) und Reichweite (72 m) sind die vorhandenen Werte. Seit 7.2B: 45 Schuss pro Magazin, acht Reservemagazine und 2,1 Sekunden Nachladedauer mit Server-Timeline (Magazin raus bei 20 %, sitzt bei 72 %). Die Autorität über Verbrauch, Schüsse, Treffer, Recoil und Nachladen liegt beim Server ([Taktisches Nachladen](TACTICAL_RELOADING.md)). `R` startet manuelles Nachladen, bei leerem Magazin und gedrücktem Abzug lädt die Waffe ebenfalls nach. Die Magazinanimation (`WeaponVisualController.reload`) nutzt dieselben Bruchteile `reloadTimeline` wie der Server. Die P-01 hat einen eigenen Schlitten, der bei jedem Schuss zurückfährt und während des Nachladens offen steht. Tod bricht das Nachladen ab, Respawn startet mit vollem Magazin.

Der `WeaponVisualController` positioniert das Magazin anhand des autoritativen Fortschritts und liefert Griff- und Mündungstransforms. Das Fallback-Rig bewegt die Stützhand beim Magazinwechsel. Das bestehende VFX-Pooling erzeugt Mündungsblitz und Tracer ab der gerenderten Mündung, wenn der passende Spieler sichtbar ist und der Abstand zum Serverursprung im plausiblen Bereich liegt. Die autoritative Trefferposition ist der Tracer-Endpunkt. Waffen- und Kamerarecoil beeinflussen die Pose und das Sichtfeld. Streuung und Trefferstrahl werden wie bisher berechnet.

## Sockets des Fallbacks

Die Angaben beziehen sich auf das Weapon-Rig, in Metern. Ursprung ist der Griff der rechten Hand. +Y zeigt nach oben, −Z entlang des Laufs nach vorn und +X nach rechts. Am Standardmodell beträgt die Länge etwa 0,88 m.

| Name | Lokales X, Y, Z | Verwendung |
| --- | --- | --- |
| `Grip` | 0, 0, 0 | Haltepunkt der Schusshand |
| `SupportHand` | −0,020, 0,049, −0,292 | Stützhand am Handschutz |
| `Muzzle` | 0, 0,101, −0,597 | Blitz, Tracer-Start und Mündungs-Attachments |
| `Barrel` | 0, 0,101, −0,433 | Laufansatz |
| `Optic` | 0, 0,141, −0,134 | Visier-Mount, belegt mit einem prozeduralen Modul |
| `Underbarrel` | 0, 0,036, −0,348 | Untere Montageschiene |
| `Magazine` | 0, 0,036, −0,182 | Schacht und Animation des Magazins |
| `Stock` | 0, 0,080, 0,062 | Schaftaufnahme |

`setAttachment(slot, visual)` bindet ein Objekt relativ zum vorhandenen Mount ein. Das Magazin hängt an einem animierten Kind des Schachts. Die Geometrie des Fallbacks enthält sichtbare Teile von Lauf und Schaft, die Mounts sind für ergänzende Teile und spätere modulare Modelle vorbereitet. Ein Ersatz für eine eingebrannte Komponente benötigt ein getrennt geliefertes Basismodell oder eine separat benannte Baugruppe. Attachment-Werte und Freischaltungen folgen in einem späteren System.

## Assetvertrag

Registrierte Waffen-GLBs werden einmal pro Pfad geladen und je Figur als starre Knoten geklont. Normalisierte Koordinaten und identische Socket-Namen erlauben das Wiederverwenden der vorhandenen Logik. Benannte Marker im Modell ersetzen die lokalen Standardtransforms. Für ein austauschbares Magazin liefert der Export ein separates `MagazineMesh`, das in den animierten Knoten übernommen wird. Ein Modell mit vorinstalliertem festem Magazin oder Optik sollte diese Teile vor dem Export in separate Baugruppen aufteilen, damit die prozeduralen Module nicht überlagert werden. Visuelle Attachments liefern ihren eigenen Ursprung am Mount. Die Rig-Anbindung des Produktionsmodells erfordert Clip- und Socket-QA mit beiden Händen. [Charakter-Assetvertrag](CHARACTER_SYSTEM.md) · [Performance](PERFORMANCE.md#milestone-3)

## P-01 und Wechsel

Die P-01 hat ein separates prozedurales Gehäuse, Visier und bewegliches Magazin. Dieselbe Controllerklasse nutzt dafür ein eigenes Socket-Layout. Beim Wechsel senkt sich die aktive Waffe. Zur Mitte der Ziehbewegung wechseln Sichtbarkeit und Handziele. Das Holstermodell sitzt am rechten Becken, die Handmodelle behalten ihre Elternknoten. Die Bilddarstellung verwendet -Z als Laufrichtung, +Y nach oben. Der Server gibt die neue Waffe am Ende der Wechselzeit frei. [Ausrüstungsregeln](EQUIPMENT_SYSTEM.md)
