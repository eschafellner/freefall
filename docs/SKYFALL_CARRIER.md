# Skyfall Carrier

Der Room für Operation Bodenbruch beginnt auf Deck 03. Die zentrale Messe verbindet vier begehbare Seitenräume mit der Luftschleuse zum Albatross 02. Auf dem Deck bewegen sich bis zu vier Operator mit der vorhandenen XZ-Simulation und sehen sich über die regulären Spieler-Snapshots.

- **Messe.** Missionskonsole mit Hologramm von Dev’ Ault, Tischen, Anzeigen und Bodenmarkierungen. In der Nähe des Tisches öffnet **E** die Einsatzplanung. Die Heckwand ist ein Panoramafenster zur Sonne des Systems.
- **Seitenräume.** Zwei Räume liegen an jeder Seite der Messe, jeweils 17 × 12 m (x 12–29, `CARRIER_ROOM_SIZE`). Sie sind für Ausrüstung, Waffen, Rüstung und Forschung vorgesehen und haben je eine Spindreihe (`CARRIER_LOCKERS`), einen Stationstisch, ein Wanddisplay, ein Fensterband in der Außenhülle und ein eigenes Arbeitslicht in der Raumfarbe. **E** an einer Station zeigt „System noch nicht verfügbar“. Raumpositionen, Bezeichnungen und Kollision liegen in `CARRIER_ROOMS` und `CARRIER_WORLD`.
- **Luftschleuse und Hangar.** Der markierte Durchgang am vorderen Ende führt ins Boarding-Deck. Beide Hangarwände haben Fenster ins All, Leitlichter am Boden führen zum Albatross. Die Kabine ist über die offene Heckrampe erreichbar.

## Fenster und Weltraum

`CARRIER_WINDOW_WALLS` markiert die Hüllenwände mit Fensterband (Heckwand der Messe, Außenwände der Seitenräume, Hangarwände). Die Kollision bleibt eine geschlossene Wand; der Client zeichnet Brüstung, Sturz, Pfosten, Glas und außen einen Hüllensims mit Positionslichtern.

`CarrierSpace` erzeugt den Blick nach draußen: Sternenfeld mit galaktischem Band, Nebel, die Sonne, Dev’ Ault an Steuerbord unterhalb des Carriers (prozeduraler Shader mit Ozeanen, Wolken, Polkappen, Terminator, Sonnenglanz, Stadtlichtern auf der Nachtseite und Atmosphärensaum) sowie einen Mond an Backbord und blinkende Begleitschiffe. Alles liegt innerhalb der Kamera-Fernebene (470 m) und ignoriert den Innenraumnebel.

## Licht

- Eigenes Lichtprofil `carrier` in `Lighting.ts`: wenig Umgebungslicht, die gerichtete Lichtquelle ist der kühle Planetenschein von Steuerbord. Hintergrund fast schwarz.
- Punktlichter: zwei warme Deckenleuchten in der Messe, Flutlicht im Hangar, je ein farbiges Arbeitslicht pro Seitenraum (auf Low aus) und das Licht des Hologramms.
- Additive Lichtkarten unter den Deckenleuchten, Lichtpfützen auf dem Deck, Lichtschächte der Sonne durch das Heckfenster und Planetenlicht vor den Steuerbordfenstern.
- Bloom (`UnrealBloomPass`) läuft nur im Carrier, auf Medium und High (`carrierBloom` in `GraphicsQuality`). Medium nutzt dafür den Composer ohne FXAA; auf der Oberfläche rendert Medium weiter direkt.

## Missionskonsole

`CarrierHologram`: abgetasteter Globus mit Küstenlinien, Höhenlinien, Gitter, Scanlinien und Abtaststreifen, Halo, pulsierende Landezone, drei Orbitbahnen mit Carrier und Begleitern, schwebende Datentafeln, Projektorkegel mit aufsteigenden Partikeln und Projektorringen im Tisch. Ein Punktlicht strahlt die Umgebung in Projektionsfarbe an. Während des Drop-Alarms wechselt die Projektion auf Orange.

## Alarmstatus

`carrierAlarm()` (`audio/CarrierAlarm.ts`) liefert die Stufe für Licht und Ton:

| Stufe | Zustand | Drehleuchten | Ton |
| --- | --- | --- | --- |
| 0 | Hub, Missionsauswahl | aus | – |
| 1 | `BOARDING`, Trupp noch nicht bereit | Amber, langsam | Bordgong (zwei Töne) alle 6,5 s |
| 2 | Boarding-Countdown, `DEPLOYMENT`/`LOCKED` | Rot, schnell | Klaxon alle 1,45 s |

`CarrierBeacons`: sechs Drehleuchten (zwei an der Luftschleuse mit echtem Spotlicht, zwei im Hangar, zwei in der Messe) mit Kuppel, Spiegel, zwei gegenläufigen Lichtkegeln und Lichtblitz. Unter Rotalarm dimmen die Arbeitslichter und kippen ins Rot, die Lichtleisten pulsieren.

Der Klaxon ist synthetisiert: verstimmte Sägezahn- und Rechteckoszillatoren mit ansteigender Tonhöhe, weiche Sättigung, Hornfilter mit Formant, Membranschnarren und ein tiefer Rumpfimpuls nach jedem Stoß. Er läuft über den Environment-Bus mit dem Carrier-Hall. Die alte Sinus-Sirene in `FlightAudio` entfällt.

## Prüfung

`scripts/playtest-carrier.mjs` baut den Client, betritt den Carrier und nimmt Messe, Hologramm, beide Seitenräume, Heckfenster, Luftschleuse sowie Amber- und Rotalarm auf (`FREEFALL_QUALITY=low|medium|high`, Playwright über `PLAYWRIGHT_MODULE`). Vorher `npm run build -w @freefall/shared`.

Alle Elemente entstehen im Client aus Geometrie, Shadern, Canvas und Web Audio. Es gibt keine externen Modelle, Texturen oder Audiodateien und keine zusätzlichen Lizenzpflichten.
