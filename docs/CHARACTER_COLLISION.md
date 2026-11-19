# Charakterkollision

Die horizontale Spielfigurposition verankert die Mitte des Fußabdrucks. Y ist der Abstand zur ebenen Simulationsoberfläche. Die Formen werden über [movement.json](../packages/shared/src/balance/data/movement.json) definiert.

| Haltung | Breite × Höhe × Länge in Metern |
| --- | ---: |
| STANDING | 0,84 × 1,78 × 0,84 |
| CROUCHING | 0,84 × 1,18 × 0,84 |
| DIVING | 0,84 × 0,72 × 1,88 |
| PRONE | 0,80 × 0,49 × 1,92 |
| SUPINE | 0,86 × 0,55 × 1,96 |

Stehen und Ducken nutzen einen achsorientierten Fußabdruck. Der bestehende Steh-Controller bleibt auf Karten mit bodenverankerten Hindernissen die Standardroute. Haltungen am Boden und im Flug nutzen um die Körperausrichtung gedrehte Boxen. Der Sweep schneidet die Zeitintervalle möglicher Überschneidungen auf den vier horizontalen Trennachsen und prüft die Höhenintervalle der Solids. Missionsgrenzen und Rettungsballon-Tether begrenzen den Weg zusätzlich. Im Flug berücksichtigt der Sweep die nötige Bodenfläche für die Landung.

Weltboxen reichen standardmäßig von Y = 0 bis `height`. Ein Hindernis mit `bottom` kann einen Überstand beschreiben. Die Freiraumtests prüfen solche Überstände. Ein niedriger Servicerahmen links auf dem Mannschaftsdeck des Skyfall Carrier ermöglicht den Test im Spiel. Automatisierte Tests prüfen zusätzlich eine synthetische Überdachung mit veränderlicher Höhe.

Beim Aufrichten muss die Zielform von Beginn an Platz haben. Die Form wächst im Übergang und wird pro Tick erneut geprüft. Bei neu auftretender Blockierung bleibt der Operator in seiner jeweiligen Bodenhaltung.

Für stehenden Friendly Fire gilt der etablierte Trefferzylinder. Geduckte, fliegende und aufstehende Operator verwenden die jeweilige Haltungsbox. Der Trefferstrahl prüft am Boden die niedrigeren Teilvolumina für Kopf, Torso und Beine. In Rückenlage ist deren Ausrichtung entlang der Längsachse gespiegelt. Die Zonen beeinflussen, ob der Strahl trifft. Die bestehenden Schadenswerte gelten für alle getroffenen Körperteile. Der Kollisionscode nutzt gemeinsame Formdaten und analytische Abfragen des vorhandenen Controllers.

Die Bodenhöhe im Simulationsmodell ist konstant. Hanglagen, dynamische Ragdolls und Landungen auf Hindernissen sind nicht Teil dieses Controllers.
