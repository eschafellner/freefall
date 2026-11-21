# Weltnavigation

Die generierte Oberfläche wird in den vorhandenen GroundNavigation-Graphen eingespeist. Der Generator begrenzt die Steigung jedes Wanderdreiecks. Stämme, Felsen und Eisformationen blockieren dieselben X/Z-Flächen für Navigation und Bodenkollision. Der generierte Graph verwendet ein festes 5-m-Raster und die vorhandenen begrenzten Distanzfelder. Feste Karten verwenden weiterhin zusätzliche Achsen entlang ihrer Hinderniskanten.

Patrouillen, Zielwechsel, Anti-Clumping, Stuck Recovery, Attack Positioning und Windup bleiben in der vorhandenen KI. Die Spawnprüfung prüft Hindernisse, Mindestabstand, Auslastung, Erreichbarkeit und Sicht. Gelände blockiert Sichtlinien zwischen Kamera, Operator und Spawn. Auf Waldflächen bleiben reservierte Patrouillenpunkte und Missionslichtungen frei. Kollisions- und Sichttests laufen serverseitig und unabhängig von der Renderentfernung.

Der Collider ist ein Heightfield mit markierten Hindernissen. Er unterstützt begehbare Surface-Höhen und einen dekorativen Bogen mit erhöhtem Collider. Die bestehenden KI-Agenten nutzen eine einzige Oberfläche. Höhlen, mehrstöckige Wege und Steilwände mit Kletterpfaden bleiben außerhalb dieses Formats.
