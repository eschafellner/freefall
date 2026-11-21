# Pressure und Encounter-Balancing

Der Director tastet die Lage alle 15 Ticks ab. Er nimmt die aktive Gegnerzahl aus dem ECS, die höchste Zahl naher Gegner bei einem lebenden Operator und die Zahl der Windup- und Active-Angriffe aus der Kampfkomponente. „Nah“ verwendet die effektive Patrouillensichtweite der Schwierigkeitsstufe. Konzentration und aktive Angriffe werden an den vorhandenen Patrouillengrößen normiert. Pro Tick beobachtete Netto-HP-Verluste und Todesfälle füllen zwei abklingende, auf eins begrenzte Gedächtniswerte. Der HP-Anteil des schwächsten aktiven Operators fließt in die Stichprobe ein. Ein Reconnect setzt die Vergleichsprobe für diesen Operator neu an.

| Pressure-Anteil | Standardgewicht |
| --- | ---: |
| Aktive Gegner relativ zum Cap | 0,25 |
| Höchste lokale Konzentration | 0,40 |
| Laufende Angriffe, pro Team skaliert | 0,15 |
| Fehlende HP des angeschlagensten Operators | 0,25 |
| Kürzliche HP-Verluste | 0,35 |
| Kürzliche Todesfälle | 0,35 |

Die Summe wird auf eins begrenzt. Jede neue Stichprobe verschiebt den geglätteten Wert um 25 % in Richtung dieser Summe. Ein höherer Wert kann den Wellenbeginn verschieben oder eine Welle unterbrechen. Die vorhandene Missions-Heat bleibt für Nestproduktion und bestehende Anzeige zuständig. Sie wird aus Nestern, Schwierigkeit, bekannten Alarmen und Missionslage berechnet.

Eine Welle startet mit der mittleren Patrouillengröße der gewählten Schwierigkeit. Der Seed variiert sie um bis zu 20 %. Pro zusätzlichem lebenden Operator kommen 24 % der Basisgröße dazu. Daraus ergeben sich Faktoren 1,00 / 1,24 / 1,48 / 1,72. Registry und momentan freie Plätze begrenzen das Ergebnis auf 4–42 geplante Gegner. Ein Teamverlust senkt die effektive Restmenge zum nächsten Spawn, mit Rückkehrern höchstens bis zum zu Wellenbeginn geplanten Budget. Bereits erzeugte Gegner bleiben in der Simulation.

Die Distanzen orientieren sich an den 27–125 m der vorhandenen Durchbruchsregeln auf der 420 × 420 m großen Karte. Gruppengröße und Spawnabstand verteilen den Anlauf auf die vorhandenen Regionen. 27–33 s Vorlauf plus ein begrenztes Recovery-Fenster lassen Raum für Bewegung, Missionsinteraktion und Nachladen. Die Spielabnahme muss zeigen, wie diese Werte über die vollständige Mission mit menschlichen Spielern wirken. [Zustände](HORDE_DIRECTOR_STATE_MACHINE.md) · [Spieltests](HORDE_DIRECTOR_PLAYTEST.md)

## 7.4E · Auswertung

Die Testmatrix prüft `CALM`, `BUILDUP`, `ASSAULT`, `PEAK` und `RECOVERY` sowie den Vorrang von Verteidigung, Nachschub, Extraktion und Nestereignissen. Der CPU-Harness gibt Angriffsstarts, bestätigte Treffer, Operator-Schaden und die maximale Zahl gleichzeitig angreifender Gegner aus. Die HP-Aufstockung isoliert die mechanische Trefferquote. Sie lässt keine Aussage über Überlebensdauer, subjektive Lesbarkeit oder die gewünschte Schwierigkeit im Koop zu. [Messungen](ENEMY_AI_PERFORMANCE.md) · [Spielabnahme](ENEMY_AI_PLAYTEST.md)
