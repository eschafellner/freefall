# Schwarmverhalten · 7.4B

`steeringSystem` liest die autoritative Zielentscheidung und den aktuellen Wegpunkt. Es kombiniert den Zug zum Wegpunkt mit einer weichen Abstandslenkung und stärkerem Druck bei sich berührenden Körpern. Die Abstandslenkung fällt zum Rand ihres Radius ab. Bewegte Schaben halten im normalen Betrieb mindestens einen Vorwärtsanteil in Richtung ihres Wegpunkts. Am erreichten Angriffspunkt wirkt nur Kontaktdruck. Für exakt deckungsgleiche Ursprünge liefert ein Paar aus Gegner-IDs stabile entgegengesetzte Richtungen.

Der Server begrenzt und glättet die resultierende Geschwindigkeit. Vor einem seitlichen Schritt prüft Bodenbruch einen kurzen Korridor gegen die Welt. Droht eine Kollision, erhält die Wegpunktrichtung Vorrang. In der Integration passieren gültige Schritte die Bodenbewegung und eine lokale Kontaktprüfung. Seitliche Tangenten werden erneut gegen beide Bedingungen geprüft. Die gegnerische Treffergeometrie für Geschosse und Nahkampf hat ihre eigene Reichweite. Die Schabe dreht mit begrenzter Geschwindigkeit in Richtung der tatsächlich erreichten Bewegung oder im Stand zum verfolgten Operator.

## Angriffsräume

Nahe am Ziel wählt eine Schabe einen Punkt auf einem Ring von 78 % ihrer Nahkampfreichweite. Mit 1,45 m Reichweite sind das rund 1,13 m. Anmarschweg und aktuelle Belegung der Winkelsektoren fließen in die Auswahl ein. Der gewählte Sektor bleibt gültig, solange beide Korridore von der Schabe zum Ring und vom Ring zum Operator frei sind. In Deckung kann der Pfad weiter zur Zielposition führen. Das Sektorverfahren verwendet das zugewiesene Ziel aus 7.4A und arbeitet für jeden der vier Operatoren getrennt. Patrouillen und sekundäre Ziele verwenden ihre eigenen Wegpunkte. Die Haltungen des Operators ändern die Trefferprüfung in `meleeSystem`, ohne sein Gewicht in der Sektorwahl zu erhöhen.

Gemeinsame Wege und lokale Warteschlangen erzeugen die Ausrichtung des Schwarms. Patrouillen behalten ihre individuellen Wegpunktversätze. Separate Kohäsions- und Alignment-Kräfte würden dichte Gruppen zusätzlich zusammenziehen und wurden für diesen Archetyp bewusst ausgelassen.

## Balancewerte

Alle Werte stehen unter `swarm.hordeAi` in `packages/shared/src/balance/data/swarm.json`. Der Missions-Snapshot enthält die validierte Konfiguration.

| Parameter | Startwert | Wirkung |
| --- | ---: | --- |
| `separationRadius` | 1,65 m | Bisheriger Radius der weichen Abstandslenkung. |
| `neighborsPerCell`, `maxNeighbors` | 8, 8 | Begrenzen Besuch und nächste relevante Kontakte pro Lenkung. |
| `separationStrength`, `contactStrength` | 0,95, 1,35 | Relative Gewichte in Einheiten der Wegpunktlenkung. |
| `contactDiameterFraction`, `contactCandidatesPerCell` | 0,80, 32 | Im Normalfall 0,592 m Kontaktabstand bei 0,74 m Bodendurchmesser. Höheres Stichprobenlimit für die Kontaktintegration. |
| `forwardFloor` | 0,22 | Untergrenze für den Vorwärtsanteil der normalen Wegpunktlenkung. |
| `steeringResponse`, `turnRate` | 14/s, 10 rad/s | Exponentielle Geschwindigkeitsantwort über das Lenkintervall und maximale Drehung pro Sekunde. |
| `attackRingFraction`, `attackSpacing`, `approachRange` | 0,78, 0,74 m, 6 m | Radialer Abstand, Sektorabstand von etwa einem Bodendurchmesser und Nahannäherung ab rund vier Nahkampfreichweiten. |

[Navigation](ENEMY_NAVIGATION.md) · [Grid](ENEMY_SPATIAL_PARTITIONING.md) · [Recovery](ENEMY_STUCK_RECOVERY.md)

## 7.4C · Angriffe im Ring

Ein windup-bereiter Gegner reserviert seinen aktuellen Winkelsektor um den gebundenen Operator. Die Anzahl der Sektoren entsteht weiterhin aus Ringradius und `attackSpacing`. Jede der vier Operatorpositionen hat eine eigene Belegung. Unterschiedliche Sektoren können gleichzeitig angreifen. Bei Konkurrenz rotiert die bevorzugte Entscheidungsreihenfolge. Das Steering gewichtet den belegten Sektor ab und prüft alternative Anmarschpunkte mit den bestehenden Korridor- und Kontaktregeln. Ein Angriff bindet Position und Schlagrichtung bis zur Recovery. Die Reservierung selbst endet mit dem Trefferfenster oder früher bei Unterbrechung und Tod.

Bei einem Fehlschlag oder verdecktem Kontakt prüft die bestehende Navigation die Angriffsposition neu. Die vorherige Position wird in dieser Wahl abgewertet. Freie Ziele bleiben auch im Cooldown in Verfolgung. Convicts und Schiffsteile behalten ihre vorhandene sekundäre Zielwahl. Die Koordination ist auf die Sektoren pro Operator begrenzt. Die Lastmatrix enthält sowohl hohe Parallelität als auch eine weiterhin gebremste Zuführung durch einen einzelnen engen Durchlass. [Messungen](ENEMY_AI_PERFORMANCE.md)

## 7.4E · Slotrecycling

Der Wahrnehmungstakt entfernt tote Mitglieder aus der Gruppe und der Slot-Zuordnung. Wenn ein neuer Gegner denselben Slot bereits beansprucht, bleibt seine neue Gruppenzuordnung gültig. Der Regressionstest prüft beide Fälle in einem Aktualisierungsschritt. [Integrationsaudit](MILESTONE_7_4_FINAL_ACCEPTANCE.md)
