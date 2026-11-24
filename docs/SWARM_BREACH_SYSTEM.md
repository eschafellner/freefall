# Schwarmdurchbrüche

Der Encounter Director sucht in freigegebenen `SwarmBreachRegion`-Kreisen nahe des Alarmfokus. Die Suche prüft eine feste Zahl von Positionen pro Region. Die Nestfläche samt Austrittsraum muss freie, begehbare Fläche sein. Die Regeln berücksichtigen unter anderem 27 m Abstand zu lebenden Spielern, 18 m zu bestehenden aktiven Nestern sowie Puffer um Landezone, Relais und Abholzone. Regions-Cooldowns verhindern wiederholte Ausbrüche an derselben Stelle.

Ein akzeptierter Durchbruch erzeugt genau eine Nest-ID und sendet `SwarmBreachStarted` mit Position und Öffnungstick. Der Nest-Snapshot führt Beginn, Öffnung und Durchbruch-ID auch für später beitretende Spieler. Nach rund 6,4 Sekunden meldet der Server `SwarmNestCreated` und lässt das Nest mit der Produktion beginnen. Ein zusätzlicher Server-Terrainzustand ist dafür nicht erforderlich.

`SwarmBreachController` zeichnet zuerst einen niedrigen Staubausstoß und Bodenrisse. Darauf folgen Geröll, eine dunkle Öffnung und ein anwachsender organischer Hügel. Der aktive Hügel pulsiert leicht und zeigt drei Austrittsöffnungen mit fleischigen Lippen. Seit dem Detailpass 2026-11-23 hat er ein eigenes Gewebematerial mit knolligen Wucherungen, feuchtem Glanz und Adern, die im Herzschlag rot aufglimmen ([Umgebungsmaterialien](ENVIRONMENT_MATERIALS.md#detailpass-2026-11-23)). Die Darstellung basiert auf Server-Ticks. Gemeinsame Instanced Meshes und ein fest dimensionierter Partikelpuffer fassen die Effekte aller nahen Nester zusammen. Fern und in der niedrigen Qualitätsstufe sinkt die Effektlast.

Die Oberflächenanimation basiert auf Geometrie über dem Boden. Die Landschaft erhält dabei keine Höhenänderung. [Permanente Schwarmnester](SWARM_NEST_SYSTEM.md)
