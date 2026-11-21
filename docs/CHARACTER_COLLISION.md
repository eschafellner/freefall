# Charakterkollision

Die horizontale Spielfigurposition verankert die Mitte des Fußabdrucks. Y ist der Abstand zur ebenen Simulationsoberfläche. Die Formen werden über [movement.json](../packages/shared/src/balance/data/movement.json) definiert.

| Haltung | Breite × Höhe × Länge in Metern |
| --- | ---: |
| STANDING | 0,84 × 1,78 × 0,84 |
| CROUCHING | 0,84 × 1,18 × 0,84 |
| DIVING | 0,84 × 0,72 × 1,88 |
| SLIDING | 0,84 × 0,90 × 1,44 |
| PRONE | 0,80 × 0,49 × 1,92 |
| SUPINE | 0,86 × 0,55 × 1,96 |
| GETTING_UP | Vom jeweiligen Bodenprofil zur Form von STANDING |

Stehen und Ducken nutzen einen achsorientierten Fußabdruck. Der bestehende Steh-Controller bleibt auf Karten mit bodenverankerten Hindernissen die Standardroute. Haltungen am Boden und im Flug nutzen um die Körperausrichtung gedrehte Boxen. Der Sweep schneidet die Zeitintervalle möglicher Überschneidungen auf den vier horizontalen Trennachsen und prüft die Höhenintervalle der Solids. Missionsgrenzen und Rettungsballon-Tether begrenzen den Weg zusätzlich. Im Flug berücksichtigt der Sweep die nötige Bodenfläche für die Landung.

Weltboxen reichen standardmäßig von Y = 0 bis `height`. Ein Hindernis mit `bottom` kann einen Überstand beschreiben. Die Freiraumtests prüfen solche Überstände. Ein niedriger Servicerahmen links auf dem Mannschaftsdeck des Skyfall Carrier ermöglicht den Test im Spiel. Automatisierte Tests prüfen zusätzlich eine synthetische Überdachung mit veränderlicher Höhe.

Beim Aufrichten muss die achsorientierte Standform von Beginn an Platz haben. Währenddessen prüft der Server pro Tick die interpolierte Form und den Standfreiraum. Im Abschlusstakt gilt genau die Form des stehenden Controllers. Wenn ein Solid nachträglich in den Freiraum ragt, fällt die Transition auf die Ausgangshaltung zurück. Operatoren können einander weiterhin passieren. Welt-Solids, einschließlich der registrierten Deckung und Schiffskollision, blockieren die Vergrößerung.

Für stehenden Friendly Fire gilt der etablierte Trefferzylinder. Geduckte, fliegende und aufstehende Operator verwenden die jeweilige Haltungsbox. Am Boden prüfen Schussstrahlen und gegnerische Nahkampfangriffe dieselben Teilvolumina für Kopf, Torso und Beine. In Rückenlage ist deren Ausrichtung entlang der Längsachse gespiegelt. Die bestehenden Schadenswerte gelten für alle getroffenen Körperteile. F2 zeichnet die autoritative Haltungsbox in Orange und die Trefferzonen in Gelb, Rosa und Grün. Der Kollisionscode nutzt gemeinsame Formdaten und analytische Abfragen des vorhandenen Controllers.

Die begehbaren Flächen von Boreal Relay, Skyfall Carrier und Operation Bodenbruch liegen auf der gemeinsamen Simulationsfläche bei Y = 0. Kriechen und Aufstehen erfordern Kontakt mit dieser Fläche. Überstände und Deckungsboxen sind Solids. Das modellierte Geländerelief liegt außerhalb der begehbaren Flächen. Begehbare Hänge und Oberseiten würden ein durchgängig höhenfähiges Weltmodell für Bewegung, Gegnernavigation und Treffer erfordern.

Die 7.3E-Suite prüft abgewiesene Flugbahnen unter Überhängen, eine dünne Wand, Tether-Grenzen, die Höhenstaffelung der Trefferflächen und einen während des Aufstehens hinzukommenden Solid. Der Autoritätstest vergleicht Schabe-Treffer mit und ohne räumliche Überlappung sowie mit Deckung. [Abnahmenachweis](MILESTONE_7_3_FINAL_ACCEPTANCE.md#integrationsaudit-73ad)
