# Kurze Kameraimpulse · 7.8C

Der bestätigte Blast speist die vorhandene `ThirdPersonCamera` mit `(1 - dist / 22)²` im Nahbereich bis 22 m. Schwung und bestätigter Nahkampftreffer des eigenen Operators verwenden 0,14 beziehungsweise 0,24 auf derselben Skala. Mehrere Ereignisse verwenden den höheren Impuls und addieren keine Verschiebung. Die Dämpfung entfernt den Effekt in wenigen Zehntelsekunden.

Maximale horizontale Ausschlagsamplitude 6 cm, vertikal rund 4,2 cm. Die Bodenverankerung reduziert die Amplitude je nach Haltung. Der Impuls liegt vor dem bestehenden Terrain- und Hindernis-Test der Kamera. Waffenrecoil und FOV-Kick stammen aus ihrem eigenen bestehenden Waffenpfad. Controller-Ausrichtung und Server-Input bleiben unabhängig von der Kameraverschiebung.

Der Regler **Wackeln** deckt normal, reduziert und aus ab. **Reduzierte Bewegung** setzt die Impulsamplitude auf null. Der gemeinsame Blitzregler kann den sichtbaren Kern und Lichtstoß bis auf null senken. Rauch und Fragmente markieren weiterhin die Detonation. Tests vergleichen Stand, Hocke, PRONE, SUPINE und Aufstehen mit identischem Waffen-FOV-Kick und vielen Impulsen im selben Frame.

## 7.8D

Die vorhandene Hüllkurve für Positionsimpulse priorisiert bestätigten lokalen Schaden, Explosion, bestätigten eigenen Nahkampftreffer und nahe Nestzerstörung. Die stärkste zulässige Amplitude gewinnt. Die Verschiebung ist auf 6 cm begrenzt, nimmt in tiefer Haltung ab und wird im Aim-Modus ausgesetzt. Explosion und Nestzerstörung fallen mit Distanz ab. Grafikeinstellung LOW setzt den Nestimpuls aus. Der vorhandene Waffenimpuls wirkt über das FOV. Vorhersage und bestätigtes Echo teilen sich weiter denselben Auslösepfad. Yaw, Pitch und Gameplay-Recoil bleiben über die bestehenden Eingaben und Recoil-Zustände definiert.

Wackeln 100 % entspricht normal, Zwischenwerte entsprechen reduzierter Intensität und 0 % deaktiviert die Impulse. Reduzierte Bewegung deaktiviert zusätzlich Sprint-FOV, Flugturbulenz, die Treffer-Vignette und die Einblendung des Resultats. Tod, Wechsel der Kameraszene und Netzwerkabbruch setzen flüchtige Kamerareaktionen zurück.
