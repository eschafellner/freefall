# Audio der Schabe

Das Spiel benutzt die bereits replizierten Attack-Alterswerte der Horde-Frames. `HordeAudio` leitet daraus Windup und aktive Phase auf dem Client-Render-Tick ab. Das Signal erklingt in den ersten Ticks der gültigen Phase. Die Attack-Startzeit und eine Phasenmaske pro Gegner verhindern Wiederholungen. Der erste Frame nach Reconnect dient zur Baseline. Audio beeinflusst weder Schaden noch Kollisionsvalidierung.

- Nahe Annäherung nutzt kurze, variierte Chitter-Takes. Entfernte Gruppen nutzen einen tieferen einzelnen Klang am Gruppenmittelpunkt.
- Windup nutzt eine aggressive Atem-/Kratzvariante. Eine eigene kurze Variante markiert die aktive Phase. Treffer und durch Geschoss oder Nahkampf bestätigte Kills nutzen unterschiedliche Pegel und Pitch.
- `enemy-hit` verwendet die bestätigte Attack-ID, Ziel-ID und das Leben des Ziels. Treffer-Foley wird räumlich am Treffer beziehungsweise am betroffenen Operator abgespielt.
- Nest- und Alarm-Geräusche greifen über vorhandene Missionsevents und Nest-Snapshots. Das Nest prüft Aktivität, Entfernung und einen lokalen Cooldown.
- Die Audio-Integration greift auf die vorhandenen Horde-Frames und Positionsdaten der Schabe zu.

## Prüfung 7.7E

Der neuere Horde-Frame bestimmt, ob ein Angriff aus der interpolierten Präsentationszeit noch vertont werden darf. Stagger, Zielverlust und Despawn können dadurch bereits vor der nächsten lokalen Scan-Ausgabe berücksichtigt werden. Beim Raumaustritt und Reconnect werden aktive Angriffsquellen abgeräumt. [Koop-Abnahme](MILESTONE_7_7_MULTIPLAYER_ACCEPTANCE.md)
