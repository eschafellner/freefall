# Posture State Machine

Die gemeinsame Simulationslogik liegt in [posture.ts](../packages/shared/src/config/posture.ts). Waffe, Ausrüstung, Haltung und visuelle Animation haben jeweils eigene Zustände.

| Ausgang | Eingabe oder Ereignis | Ergebnis |
| --- | --- | --- |
| STANDING | Ducken bei gehaltenem Sprint, ausreichendem Anlauftempo, freiem Rutschkollider und abgelaufenem Cooldown | SLIDING |
| STANDING | Sonstiges Ducken bei freiem Platz | CROUCHING |
| CROUCHING | Ducken oder Aufstehen bei freiem Raum | STANDING |
| SLIDING | Letzter Bahntick, Kollision oder entzogene Bewegungsfreigabe | CROUCHING |
| STANDING / CROUCHING | Gültiger Hechtsprung | DIVING |
| DIVING | Bestätigter Landetick, auch bei verkürzter Flugstrecke | PRONE oder SUPINE gemäß Startentscheidung |
| PRONE / SUPINE | Aufstehen bei freiem Raum | GETTING_UP |
| GETTING_UP | Raum bleibt bis zum Endtick frei | STANDING |
| GETTING_UP | Blockierung oder Bewegungsfreigabe entzogen | Ausgangs-Bodenhaltung |
| Jeder aktive Übergang | Tod | Übergang beendet und Ausrüstungsaktion abgebrochen |

Die zentrale Freigabematrix enthält neben Waffen-, Ausrüstungs- und Sprintrechten auch `dive`, `groundMove` und `standUp`. Während `GETTING_UP` sind alle Aktionen aus der Matrix gesperrt. Bewegung und Körperdrehung stehen still. Die Kamera bleibt frei und Treffer verursachen regulären Schaden. Das Aufstehen dauert 24 Ticks aus Bauchlage und 30 Ticks aus Rückenlage. Ein blockierter Start hat keine Transition. Eine Blockierung während des Aufstehens setzt die Figur am selben Ort in die Ausgangshaltung zurück. Ein neuer Versuch erfordert einen neuen Tastendruck.

Der Zustand enthält aktuelle und angeforderte Haltung, Ursprungshaltung, Start- und Endtick, Körper-Yaw und den letzten bestätigten Hechtsprung. Ein aktiver Dive speichert die Eingabesequenz als Transition-ID, Richtung, Ausgangs- und Zielhaltung, Start-, Absprung- und Landetick sowie die bestätigten Bahnparameter. Ein Blockierkontakt ergänzt Tick, Weg und Höhe. Vorbereitung, Flug und Landung verwenden jeweils das entsprechende Kollisions- und Trefferprofil. Die Zielhaltung wird anhand der ursprünglichen Körperausrichtung gewählt. Details stehen in [Directional Dive](DIRECTIONAL_DIVE.md).

Der Rutschstart verwendet den letzten tatsächlich ausgeführten Sprintschritt desselben oder des vorigen Ticks. Der Duckbefehl muss mit gehaltenem Sprint und einer Bewegungsachse eintreffen. `slideRunUp` hält die Richtung eines Schritts, der das Mindesttempo erreicht hat. Beim Start friert `slide` diese Weltrichtung sowie Strecke und Abklingfaktor ein. `slideCooldownUntil` zählt ab dem Starttick. Die Figur bleibt auf `y = 0`. Pro Tick prüfen Sweeps den orientierten Rutschkollider und den geduckten Kollider, damit der Wechsel nach `CROUCHING` am Kontaktpunkt möglich ist. Am letzten Bahntick oder beim Abbruch endet der Vortrieb. Anschließend prüft `fitsPosture` das Aufstehen wie beim normalen Ducken.

## Netzwerk

- `PlayerInput.posture` akzeptiert `crouch`, `dive` und `stand`. Ein Request ist an `seq` und `life` gebunden. Bei einem Dive kann `diveIntent` die Kamera und Achsen zum Tastendruck enthalten. Der Server verarbeitet den ursprünglichen Request in der vorhandenen Bewegungswarteschlange. Pro Tick kann ein Operator höchstens einen Haltungswechsel starten.
- Sprung, Rutschen und Aufrichten laufen mit der Serveruhr weiter, auch wenn Bewegungspakete fehlen. Eingabebursts beschleunigen diese Übergänge daher nicht.
- `GETTING_UP` überträgt `getUpId` aus der bestätigten Eingabesequenz zusammen mit Ursprungs-, Zielhaltung sowie Start- und Endtick. Ein zweiter Befehl verlängert den Vorgang nicht. Die Bewegungsdaten `groundMotion` enthalten die zuletzt akzeptierte Weltgeschwindigkeit für Prediction und Replay. Die Remote-Darstellung interpoliert Körper- und Blickwinkel unabhängig und hält die Aufstehposition zwischen den Übergangsticks fest.
- `players` enthält den optionalen Haltungszustand und die optionale Y-Koordinate. Stehen ohne Übergang, aktiven Cooldown oder gültigen Rutschanlauf braucht keine Zusatzfelder. Die Snapshots übertragen wirksame Aim- und Sprint-Bits sowie vorhandene Waffen- und Reload-Daten. Alte Snapshots ohne Haltungsfeld werden als aufrecht gelesen.
- Der lokale Client übernimmt den bestätigten Snapshot und simuliert die noch offenen Eingaben erneut. Während des Dives folgt die sichtbare Höhe der bestätigten oder erneut simulierten Bahn. Die Darstellung anderer Operator rekonstruiert die Dive-Schritte im bestehenden Snapshot-Puffer, aus `dive` im Flug und kurzzeitig aus `landedDive` nach der Landung. Die Bodenhaltung und Y = 0 beginnen am übertragenen Landetick.
- Bei einem Snapshot-Abstand über Landung und Aufstehen endet die Remote-Bewegung am Starttick von `GETTING_UP`. Bei Tod endet die laufende Transition. Ein Disconnect lässt bestätigte Übergänge im Serverzustand weiterlaufen. [Reconciliation](NETWORK_RECONCILIATION.md)
- 7.3D verwendet die ersten fünf Ticks ab `landedDive.until` für den sichtbaren Kontakt. Die Bodenhaltung und ihre Aktionsfreigaben gelten ab dem autoritativen Landetick. Ein Get-Up ersetzt die Landepose und verwendet seinen eigenen Fortschritt. Der Remote-Rückstoß verwendet `tick` und `life` aus dem bestehenden `shot`-Ereignis. [Charakteranimation](CHARACTER_ANIMATION.md)
- Ein Mission-Reconnect erhält den Simulationszustand derselben Lebens-ID. Während der Trennung können Hechtsprung, Rutschen und Aufstehen nach ihren üblichen Regeln enden. Der Client übernimmt den aktuellen Zustand und die ursprünglichen Tickgrenzen im nächsten Snapshot. Der Verbindungsabbruch verwirft ausstehende Eingaben und Kriechgeschwindigkeit. Lebenswechsel und Szenenwechsel setzen die Haltung auf Stehen. Reconnect steht in Missionsräumen zur Verfügung.

Die Abweichungsanzeige und der Kollider in F2 lesen den Snapshot und die lokale Vorhersage. Die Anzeige sendet keine Änderungen an den Server.
