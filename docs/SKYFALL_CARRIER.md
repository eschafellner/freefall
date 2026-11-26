# Skyfall Carrier

Der Room für Operation Bodenbruch beginnt auf Deck 03 des Flottenträgers *Skyfall*. Bis zu vier Operator bewegen sich mit der vorhandenen XZ-Simulation über das Deck und sehen sich über die regulären Spieler-Snapshots. Alle begehbaren Flächen liegen auf Deckhöhe (y = 0); Galerien, Leitstand und Außenhülle sind Kulisse.

## Layout

Draufsicht: +x Steuerbord, +z Heck (zur Sonne), −z Bug (Hangar).

| Bereich | Lage (x / z) | Inhalt |
| --- | --- | --- |
| **Messe** | ±12 / −17…17, 9,8 m hoch | Zweistöckiges Atrium. Säulengang bei x = ±8,4 trägt die Galerien (Unterkante 4,6 m). Missionskonsole mit Hologramm und darüber der Ops-Ring. Esstische, Essensausgabe, Getränkeautomaten, Lounge vor dem Panoramafenster, Bereitschaftsbänke und Ausrüstungsregale am Bug. |
| **Seitenräume** | 12…29 / ±3…±15 | Ausrüstung, Waffenkammer, Rüstung, Forschung (je 17 × 12 m) mit Tür in der Messewand, Station am hinteren Ende, Wandreihe, Regal an der vorderen Wand und einem Zusatzobjekt. |
| **Krankenstation** | −12…−29 / ±3 | Vier Betten mit Vitalmonitoren und Vorhängen, Körperscanner, Medizinschränke. |
| **Mannschaftsquartier** | 12…29 / ±3 | Acht Dreifachkojen, Tisch mit Hockern, Fensterband zu Dev’ Ault. |
| **Druckschleuse** | ±3,1 / −17…−23 | Zwei Schotttürpaare, Gitterboden, Dekontaminationsdüsen, Scannerbogen (Personenkontrolle). |
| **Hangar** | ±17 / −23…−46, 12,5 m hoch | Albatross 02 auf seinem Startplatz (`CARRIER_SHIP`), Albatross 01 in Wartung mit Gerüst vor dem Steuerbordfenster, Container, Tankwagen, Kistenstapel, Laufstege, Portalkran, offenes Hangartor hinter einem Atmosphärenschild. |
| **Leitstand** | über der Schleuse | Hangarleitstand mit Crew an Konsolen, Fenster zur Messe und zum Hangar (Kulisse). |

Spieler starten unverändert bei `CARRIER_SPAWN` (0 / 12) mit Blick zum Bug. Die Missionskonsole (`CARRIER_CONSOLE`), die vier Stationen (`CARRIER_ROOMS`, **E** im Umkreis von 5 m um die Raummitte) und der Weg zum Albatross bleiben, wo sie waren.

## Layoutdaten und Kollision

`packages/shared/src/definitions/carrier.ts` beschreibt das Deck vollständig; Server und Client lesen dieselben Daten.

- `CARRIER_WORLD`: Welt `world.skyfall_carrier` (`half` 48) mit allen Kollidern.
- `CARRIER_HALLS`, `CARRIER_GALLERY`, `CARRIER_ROOM_CEILING`, `CARRIER_CABIN_CEILING`: Umrisse und Höhen.
- `CARRIER_WALLS` (Wände), `CARRIER_WINDOW_WALLS` (Hüllenwände mit Fensterband: Heck der Messe, Außenwände der Seitenräume und des Quartiers, Steuerbordwand des Hangars).
- `CARRIER_DOORS`: jede Türöffnung (Achse, Breite, Höhe). Die Kollision lässt die Öffnung frei; der Client setzt Rahmen und Schiebetüren hinein.
- `CARRIER_PROPS`: Möbel und Ausrüstung mit Kollider und Modellname (`prop`, `yaw`). Der Client zeichnet an genau dieser Stelle das passende Modell.
- `CARRIER_LOCKERS`: Wandreihe jedes Seitenraums (Spinde, Gewehrracks, Rüstungsalkoven, Probentanks).
- Der Wartungsrahmen in der Lounge (Unterkante 1,37 m) bleibt: stehend blockiert er, geduckt passt man darunter durch.

Tests: `apps/server/test/carrier-layout.test.ts` (Türen frei, Spawn, Konsolenring und Weg zum Albatross frei, Krankenstation und Quartier begehbar), `apps/server/test/mission.test.ts` (jeder Seitenraum ist durch seine Tür erreichbar) und `apps/client/test/carrier-alarm.test.ts`.

Im Golden-Trace für *Albtraum* (`apps/server/test/balance.test.ts`) kehrt der aufgeriebene Trupp kurz vor Ende zum Carrier zurück und läuft dort weiter. Eine Layoutänderung des Carriers ändert deshalb diesen einen Fingerabdruck, ohne dass sich am Kampf etwas ändert.

## Darstellung

`apps/client/src/rendering/mission/Carrier.ts` baut das Deck aus den Modulen in `mission/carrier/`:

| Modul | Aufgabe |
| --- | --- |
| `ShipKit` | Sammelt Quader, Zylinder, Streben und beliebige Geometrie je Zone und Material und verschmilzt sie zu einem Mesh. UVs werden aus Weltkoordinaten projiziert (Texturen laufen über Bauteilgrenzen), Vertexfarben tragen Farbvariante, leichte Streuung und eine Abdunklung zum Boden hin. `kit.detail()` markiert Kleinkram, der auf *Niedrig* ausgeblendet wird. |
| `ShipTextures` | Prozedurale Oberflächen (Canvas): Deckplatten mit Fugen, Bolzen, Riffelblech, Schleifspuren und Ölflecken; Wandpaneele mit Rahmen, Lüftungsgittern, Nieten und Schmutzfahnen; abgenutztes Metall, Gitterrost, Warnstreifen, Stoff. Je Oberfläche Farb-, Rauheits- und Normal-Map. |
| `CarrierPalette` | Materialfamilien (Deck, Paneele, lackiertes Metall, Stoff, matt, Lampen). Benannte Farben sind Varianten einer Familie und kosten keinen eigenen Draw Call. |
| `CarrierStructure` | Messe (Boden mit Konsolenintarsie, Wände, Galerien mit Geländer, Säulengang, Rippendecke mit Kniestreben, Fachwerk-Rückgrat, Lüftungskanal, Leuchten, Panoramafenster, Leitstand), Seitenräume, Krankenstation und Quartier, Druckschleuse. |
| `CarrierProps`, `CarrierRoomProps`, `CarrierHangarProps` | Modelle zu `CARRIER_PROPS`, Raumausstattung, Ops-Ring, Wartungsrahmen, Pflanzkästen, Banner, Präparate (Schabe aus `SchabeModel`, instanziert), Albatross 01 (aus `AlbatrossView` gebacken). |
| `CarrierHangar` | Hangarhalle, Startplatz, Laufstege, Kran, Tor, Atmosphärenschild (Shader mit Wabengitter, Wanderwelle und Randglühen), Lauflichter auf dem Flugdeck. |
| `CarrierDoors` | Türrahmen und Schiebetüren (instanziert). Raumtüren öffnen sich, sobald ein Operator näher als 4,4 m ist (`ArenaView` übergibt die eigene vorhergesagte Position und die der anderen). Das Schleusenpaar steht auf Deck offen und schließt beim Ausklinken. |
| `CarrierScreens` | Animierte Anzeigen (Schiffsstatus, Nahbereichsradar, Energiegrafik, Landezonenkarte, Einsatzbereitschaft, Vitalwerte, Probenscan, Rüstungskalibrierung, Waffenausgabe, Versorgung, Flottenverband). Eine Canvas je Art, mehrmals pro Sekunde neu gezeichnet, unter Rotalarm mit „ALARM“. Auf *Niedrig* stehen sie still. |
| `CarrierDecals` | Aufgemalte Markierungen mit Schablonenstegen und Abrieb: „DECK 03“, Boarding-Pfeil, „02 / STARTPLATZ“, Schildgrenze, „03“ an der Hangarwand, „SKYFALL“ über dem Leitstand. |
| `CarrierExterior` | Eigene Hülle hinter dem Panoramafenster (Achterdeck, Triebwerksgondeln mit Glühen), drei Begleitfregatten mit Fensterreihen und Positionslichtern, ein Shuttle auf langsamer Umlaufbahn. |
| `CarrierEffects` | Lichtkarten, Lichtschächte, Staub. |

Alle Elemente entstehen im Client aus Geometrie, Shadern und Canvas. Es gibt keine externen Modelle, Texturen oder Audiodateien und keine zusätzlichen Lizenzpflichten.

## Fenster und Weltraum

`CarrierSpace` erzeugt den Blick nach draußen: Sternenfeld mit galaktischem Band, Nebel, die Sonne tief über dem Heck (durch das Panoramafenster sichtbar), Dev’ Ault an Steuerbord unterhalb des Carriers (Quartier, Waffenkammer, Forschung und Hangarfenster) und der Mond vor dem Bug, sichtbar durch das offene Hangartor. Alles liegt innerhalb der Kamera-Fernebene (470 m) und ignoriert den Innenraumnebel.

## Licht

- Lichtprofil `carrier` in `Lighting.ts` (unverändert): wenig Umgebungslicht, kühler Planetenschein von Steuerbord, Hintergrund fast schwarz.
- Punktlichter: zwei warme Hauptlichter im Atrium, je ein Fülllicht unter den Galerien, je ein Arbeitslicht in Raumfarbe pro Seitenraum, Krankenstation (kühl) und Quartier (warm), zwei Hallenstrahler im Hangar, das Hologramm. Galerie-, Raum- und Kabinenlichter sind auf *Niedrig* aus.
- Leuchtkörper sind Emissiv-Flächen mit Lichtkarten an Decke und Boden; Lichtschächte der Sonne fallen durch die sechs Felder des Panoramafensters.
- Bloom nur im Carrier, auf *Mittel* und *Hoch* (`carrierBloom`).

## Missionskonsole und Ops-Ring

`CarrierHologram` (unverändert) projiziert Dev’ Ault über dem Tisch. Die Konsole trägt vier geneigte Bedienfelder mit Karte und Status. Darüber hängt in 7,2 m Höhe der Ops-Ring mit vier großen Taktikanzeigen (Landezone, Flottenverband, Radar, Schiffsstatus) und einem Lichtring.

## Alarmstatus

`carrierAlarm()` (`audio/CarrierAlarm.ts`) liefert die Stufe für Licht und Ton:

| Stufe | Zustand | Drehleuchten | Ton |
| --- | --- | --- | --- |
| 0 | Hub, Missionsauswahl | aus | – |
| 1 | `BOARDING`, Trupp noch nicht bereit | Amber, langsam | Bordgong (zwei Töne) alle 6,5 s |
| 2 | Boarding-Countdown, `DEPLOYMENT`/`LOCKED` | Rot, schnell | Klaxon alle 1,45 s |

`CarrierBeacons`: neun Drehleuchten – zwei auf dem Schleusenportal (mit echtem Spotlicht), eine in der Schleuse, zwei unter den Galerien am Bug, zwei unter den Hangarbindern und zwei über dem Hangartor. Lichtkegel und Blendlicht werden ausgeblendet, solange die Leuchten aus sind. Unter Rotalarm dimmen alle Arbeitslichter und kippen ins Rot, Lichtleisten pulsieren, die Anzeigen schalten auf „ALARM“.

**Derzeit deaktiviert** (`CARRIER_ALARM_SOUND` in `MissionAudio.ts`): Gong und Klaxon spielen nicht, die Drehleuchten laufen weiter.

## Prüfung

`scripts/playtest-carrier.mjs` baut den Client, meldet ein Testkonto an, betritt den Carrier und nimmt Messe, Panoramafenster, alle sechs Räume, Schleuse, Hangar, Hangartor, Leitstand, Albatross 01 sowie Bordruf und Rotalarm auf (`FREEFALL_QUALITY=low|medium|high`, Playwright über `PLAYWRIGHT_MODULE`). Vorher `npm run build -w @freefall/shared`.
