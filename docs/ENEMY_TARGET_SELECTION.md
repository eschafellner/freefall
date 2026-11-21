# Zielauswahl der Schabe

## Gültigkeit und Auswahl

- Ein Operatorziel braucht positive HP, endliche Koordinaten und einen zugeordneten Slot. Ein gespeichertes Ziel muss zusätzlich dieselbe Operatorinstanz und Lebens-ID haben. Recycelte Gegnerslots bekommen frischen Zielzustand.
- In Bodenbruch muss der Operator zum Einsatz gehören, verbunden sein und sich außerhalb einer gesicherten Lift-Phase befinden. Beim Disconnect bleibt sein Simulationszustand für Reconnect erhalten. Die KI schließt ihn ab dem nächsten Kampftick aus. Er wird nach Reconnect bei der nächsten gültigen Wahrnehmungsprobe wieder berücksichtigt.
- Die Arena wählt lokal nach Entfernung und prüft Ziele versetzt gemäß `hordeAi.targetTicks`. Der offene Ring benötigt keinen Sicht- oder Pfadtest. Tod, neuer Lebensabschnitt oder Slotwechsel lösen eine erneute Auswahl aus.
- Bodenbruch prüft alle vier Plätze in versetzten Gruppenproben. Radius, Blickkegel für ruhige Gruppen, Nahwahrnehmung, Deckung und Aufsetzschutz bleiben an die Mission gebunden. Die Sichtlinie endet höchstens auf Y=1 und folgt bei niedriger Haltung dem aktuellen Collider. Die Bodennavigation prüft anschließend, ob ein Weg zum sichtbaren Kontakt vorliegt.
- Wo die Mission es erlaubt, können Gruppen ohne gültigen Operator Convicts und Oberflächenpunkte des Albatross verfolgen. Schiffsnähe, Infantry-Priorität, Unterbrechung während Lift und die Freigabe des Rufers bleiben Missionsregeln. Die Sekundärsuche kann im selben Tick von Steering und Nahkampf gemeinsam verwendet werden.

## Zielbindung

Eine Auswahl bindet das Ziel für 30 Ticks, solange es die geltenden Kriterien erfüllt. Danach muss ein Kandidat mindestens 2 m und 20 % näher liegen. Ein ungültiges Ziel löst eine Neuwahl bei der nächsten vorgesehenen Probe aus. Bodenbruch stellt den Angriff auf einen ungültigen Operator bereits vor dieser Probe ein. Bei gleichwertigen Kandidaten zählt die feste Slotreihenfolge. Die bestehende Bedrohungsgröße ist die lokale Entfernung. Liegen, Waffenfeuer und erlittene Treffer erhalten keine künstlichen Punktmultiplikatoren. Schüsse und andere Geräusche können in Bodenbruch weiterhin Aufmerksamkeit auslösen.

Vier lokal verteilte Operatoren können gleichzeitig verfolgt werden. Konzentriert sich der Trupp an einem Ort, können Gruppen denselben Operator bevorzugen. Die Sektorwahl verteilt die Anmarschpunkte rund um das gewählte Ziel. [Schwarmverhalten](ENEMY_SWARM_BEHAVIOR.md)

## 7.4E · Registry und Reconnect

Arena und Patrouillen lesen `commitmentTicks`, `switchMeters` und `switchRatio` aus `swarm.hordeAi.targeting`. Bestehende Balance-Dateien ohne diesen Abschnitt erhalten dieselben Standardwerte von 30 Ticks, 2 m und 0,8. Ein Disconnect unterbricht einen ausstehenden Angriff auch dann, wenn die Wiederverbindung zwischen denselben zwei Simulationsticks erfolgt. Danach kann der reguläre Wahrnehmungstakt wieder ein Ziel erfassen. [Regressionen](MILESTONE_7_4_FINAL_ACCEPTANCE.md)
