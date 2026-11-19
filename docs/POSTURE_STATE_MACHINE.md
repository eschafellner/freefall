# Posture State Machine

Die gemeinsame Simulationslogik liegt in [posture.ts](../packages/shared/src/config/posture.ts). Waffe, Ausrüstung, Haltung und visuelle Animation haben jeweils eigene Zustände.

| Ausgang | Eingabe oder Ereignis | Ergebnis |
| --- | --- | --- |
| STANDING | Ducken | CROUCHING |
| CROUCHING | Ducken oder Aufstehen bei freiem Raum | STANDING |
| STANDING / CROUCHING | Gültiger Hechtsprung | DIVING |
| DIVING | Landung nach dem letzten Flugtick | PRONE oder SUPINE gemäß Startentscheidung |
| PRONE / SUPINE | Aufstehen bei freiem Raum | GETTING_UP |
| GETTING_UP | Raum bleibt bis zum Endtick frei | STANDING |
| GETTING_UP | Blockierung oder Bewegungsfreigabe entzogen | Ausgangs-Bodenhaltung |
| Jeder aktive Übergang | Tod | Übergang beendet und Ausrüstungsaktion abgebrochen |

Der Zustand enthält aktuelle und angeforderte Haltung, Ursprungshaltung, Start- und Endtick, Körper-Yaw und den letzten bestätigten Hechtsprung. Während eines Sprungs enthält er auch den normalisierten Weltvektor, die vorgesehene Landung und den Blockierstatus. Bodenfreiheit steht in einem separaten Y-Wert. Fortschritt, Bodenkontakt und erlaubte Aktionen lassen sich aus diesen Feldern und der Balance ableiten.

## Netzwerk

- `PlayerInput.posture` akzeptiert `crouch`, `dive` und `stand`. Ein Request ist an `seq` und `life` gebunden. Der Server verarbeitet ihn in der vorhandenen Bewegungswarteschlange. Pro Tick kann ein Operator höchstens einen Haltungswechsel starten.
- Sprung und Aufrichten laufen mit der Serveruhr weiter, auch wenn Bewegungspakete fehlen. Eingabebursts beschleunigen diese Übergänge daher nicht.
- `players` enthält den optionalen Haltungszustand und die optionale Y-Koordinate. Reguläres Stehen ohne Übergang oder Cooldown braucht keine Zusatzfelder. Die Snapshots übertragen wirksame Aim- und Sprint-Bits sowie vorhandene Waffen- und Reload-Daten. Alte Snapshots ohne Haltungsfeld werden als aufrecht gelesen.
- Der lokale Client übernimmt den bestätigten Snapshot und simuliert die noch offenen Eingaben erneut. Korrekturen werden auf allen drei Achsen visuell abgefedert. Die Darstellung anderer Operator nutzt den bestehenden Snapshot-Puffer und wechselt die Haltung am übertragenen Servertick. Der Übergang in die Bodenhaltung erreicht dort Y = 0.
- Ein Mission-Reconnect erhält den Simulationszustand derselben Lebens-ID. Ein laufender Hechtsprung kann während der Trennung landen. Lebenswechsel und Platzierung bei Szenenwechsel setzen die Haltung auf Stehen.

Die Abweichungsanzeige und der Kollider in F2 lesen den Snapshot und die lokale Vorhersage. Die Anzeige sendet keine Änderungen an den Server.
