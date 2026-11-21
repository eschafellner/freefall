# Prediction und Reconciliation in 7.3E

Der Server simuliert bei 30 Hz. Er liefert `players` regulär bei 20 Hz und die binäre Horde bei 10 Hz. Der Client sendet eine nummerierte Eingabe pro Simulationsschritt. `life` identifiziert das Leben beziehungsweise die Platzierung. Frühere Clients können einfache Bewegung ohne `life` senden. Posture- und Equipment-Befehle benötigen eine Lebensnummer. Details zu Eingabekredit, adaptivem Puffer und Wiedergabezeit stehen in [Netzwerkinterpolation](NETWORK_INTERPOLATION.md).

## Eingabe und Haltungswechsel

- `Battlefield.receiveInput()` trennt die höchste beobachtete Sequenz von der zuletzt gültigen aktiven Eingabe. Doppelte und niedrigere Sequenzen werden verworfen. Ein Paket eines alten Lebens kann die Sequenzbestätigung voranbringen. Bewegungsachsen, Blick, Aim, Feuer, Nachladen, Haltung und Ausrüstung bleiben für dieses Paket wirkungslos.
- Respawn, Platzierung, Disconnect und Beginn des Extraktions-Lifts leeren den Eingabepuffer und löschen die zuletzt gehaltenen Eingaben. Das verhindert einen Schuss im Respawntick durch einen gehaltenen Abzug des vorherigen Lebens.
- `Game` aktualisiert lokale Position, `ack`, Leben, Haltung und HUD aus einem `players`-Snapshot erst nach dessen Annahme durch `Timeline.push()`. Die Tickprüfung gilt auch für Missions-Snapshots, die Welt, Freeze und Tether für Prediction wählen.
- `Prediction` setzt den lokalen Simulationszustand auf den Serverstand, entfernt bestätigte Eingaben und simuliert die offenen Schritte nach. Die Sichtposition blendet kleine Korrekturen aus, bei großen Sprüngen, Tod oder Platzierung erfolgt ein Snap. Haltung und Treffer werden auf dem Server bestimmt.
- `remotePose()` nutzt `dive` und die kurz replizierte `landedDive`-Bahn. Bei einem Snapshot-Abstand über Landung und Aufstehen endet der nach der Landung mögliche Kriechweg am `started`-Tick von `GETTING_UP`. Der Operator bleibt während des Aufstehens stehen.

## Disconnect und Wiedereinstieg

Operation Bodenbruch reserviert die Session für 12 Sekunden. Der Client verwirft offene Eingaben und wartet beim Wiedereinstieg auf den nächsten Spielerzustand. Das SDK sammelt während der Trennung keine Eingaben zum späteren Versand. Der Server behält Körper und Lebensnummer in der laufenden Mission. Dive, Landung und Aufstehen folgen ihren ursprünglichen Ticks, können durch Weltkollision beziehungsweise Tod enden und werden aus dem laufenden Snapshot rekonstruiert. Der Körper bleibt im Gefecht angreifbar. Ein laufender Reload folgt seiner Serverphase. Ein noch laufender Stim oder Nachschubvorgang bricht bei Disconnect ab. Bereits ausgeführte Transaktionen bleiben erhalten. Nach Ablauf der Reservierung wird der Operator entfernt.

Frischer Beitritt ist auf dem Carrier bis zum Boarding möglich. Ab Deployment ist die laufende Mission für neue Sessions gesperrt. Die Arena entfernt verlassene Slots und unterstützt frische Beitritte.

Prüfläufe, Profile und Grenzen stehen im [Multiplayer-Stresstest](MULTIPLAYER_STRESS_TEST.md).
