# Skyfall Carrier

Der Room für Operation Bodenbruch beginnt auf Deck 03. Die zentrale Messe verbindet vier begehbare Seitenräume mit der Luftschleuse zum Albatross 02. Auf dem Deck bewegen sich bis zu vier Operator mit der vorhandenen XZ-Simulation und sehen sich über die regulären Spieler-Snapshots.

- **Messe.** Missionskonsole mit rotierender Projektion von Dev’ Ault, Tischen, Anzeigen und Bodenmarkierungen. In der Nähe des Tisches öffnet **E** die Einsatzplanung.
- **Seitenräume.** Zwei Räume liegen an jeder Seite der Messe. Sie sind für Ausrüstung, Waffen, Rüstung und Forschung vorgesehen. **E** an einer Station zeigt „System noch nicht verfügbar“. Raumpositionen, Bezeichnungen und Kollision liegen in `CARRIER_ROOMS` und `CARRIER_WORLD`.
- **Luftschleuse.** Der markierte Durchgang am vorderen Ende führt ins Boarding-Deck. Die Kabine ist über die offene Heckrampe erreichbar.

Das Modul `Carrier` erzeugt eine gepoolte Umgebung aus instanzierten Metallplatten, Stützen und technischen Details. Schilder und Planetentextur entstehen im Client mit Canvas. Auf Low entfallen optionale Geometriebatches. Die Arbeit nutzt vorhandene Three.js-Materialien und Beleuchtung. Die neu erstellten Fallbacks verwenden keine externen Modelle, Texturen oder Audiodateien und bringen keine zusätzlichen Lizenzpflichten mit.

Der endgültige Schiffsgrundriss, die Funktionsverteilung der Räume und ein erweiterter Light-/Material-Pass stehen zur Designfreigabe aus.
