# Weather Multiplayer Sync · 7.7C

`MissionAtmosphere` ist Teil von `MissionInstance`. Der Server verschickt `atmosphere-state` bei Initialisierung, Übergangsbeginn, Abschluss und Missionsende. Der Client erkennt die Atmosphärenversion im Missionssnapshot und fragt beim Verbinden und Wiederverbinden den aktuellen Stand ab. Zustandswechsel und Antworten enthalten Instanz-ID, Welt- und Planeten-ID, Lichtprofil, Konfigurationsversion, Seed, Tageszeit, Ursprungstick, Revision, Wetter- und Wind-Endpunkte sowie Starttick und Dauer. Ein Null-Paket beendet den Wetterzustand.

Der Client validiert das Paket und verwendet es zusammen mit der vom Missionsplan wiederhergestellten Welt. Er berechnet den Fortschritt aus der bestehenden Spielertick-Schätzung und derselben Server-Startzeit. Nach Reconnect beschreibt das Paket weiterhin dieselbe Transition, falls ihr Endtick noch in der Zukunft liegt. Ein späterer Reconnect übernimmt den aktuellen stabilen Zustand. Die Renderer-Instanz und ihr Partikelbatch bleiben während der kurzen Transportunterbrechung an denselben Einsatz gebunden.

Aktive Einsätze sind für zusätzliche Operatoren geschlossen. Der erlaubte Beitritt findet im Carrier-Briefing statt. Die neue Verbindung erhält dort zuerst den bereits gewählten Plan und beim Deployment den gleichen finalen Atmosphärenzustand wie der Rest des Trupps.

Wetter trägt keine einzelnen Partikel, Wind-Uniform-Abtastungen oder Vegetationsdaten über das Netz. Im Verlauf ohne Zustandsänderung fällt kein zusätzlicher Wetterbroadcast an. Der Schreibpfad für Testwetter ist Host-geschützt und gehört zum Debug-Raum, der nur außerhalb von Produktion auf Loopback registriert wird.

[Nachweise und Wire-Größe](WEATHER_PERFORMANCE.md)

Schließt eine Verbindung während des SDK-Handshakes, kann Colyseus die Reservierung ablehnen. Der Raum überlässt die Sitzbereinigung in diesem Fall dem normalen Leave-Pfad.
