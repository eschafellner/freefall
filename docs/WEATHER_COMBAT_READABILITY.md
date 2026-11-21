# Combat Readability · 7.7C

Der maximale Wert der Wetter-Fog-Dichte beträgt 0,0081 m⁻¹. Bei 40 m Sichttiefe bleiben damit etwa 90 % Kontrast gegenüber der Fog-Farbe, bei 60 m etwa 79 %. Beim Waldnebel läuft die zusätzliche Dichte mit der Höhe der Kamera über dem Terrain aus. Eine langsame seitliche Variation suggeriert Bewegung im Nebel. Die Fog-Mischung gilt in der bestehenden Tiefenberechnung einheitlich für die Szene. Sie ändert keine Server-Sichtprüfung.

Partikel schreiben nicht in den Depth Buffer, bleiben hinter den HUD-DOM-Elementen und blenden sich vor der Kamera aus. Die vorhandenen Reticle-, Schadens-, Munitions-, HP- und Objective-Anzeigen folgen weiterhin ihrer eigenen Aktualisierung. Die Lichtstufen erhalten das Hemisphären-Fülllicht auch bei tiefer Sonne. Die verifizierten Schabe-Prüfsummen stehen im Abnahmebericht.

Die Szenenprüfung deckt Licht- und Wetterkombinationen, Prone und Supine, Sicht zur Relaisanlage und Bodenkampf ab. Die ausgewerteten Frames und offenen manuellen Fälle sind im Spieltest erfasst. [Spieltest und Bildmaterial](MILESTONE_7_7C_PLAYTEST.md)
