# Seeds und Versionen

Der Produktionsserver zieht bei einer neuen Auswahl einen unsigned 32-Bit-Seed mit dem Node-Zufallsgenerator. Der Server akzeptiert feste Seed-Eingaben nur im lokalen Missions-Debugroom. Starte dafür den Server auf Loopback mit `FREEFALL_MISSION_DEBUG=1 npm run dev:server` und den Client mit `npm run dev:client`. Wähle an der Missionskonsole dieselbe Schwierigkeit und Vorlagenauswahl und trage den angezeigten Seed unter **Seed für Wiederholung** ein. Der Plan hält auch fest, ob eine bestimmte Vorlage angefordert wurde.

Die Komposition mischt den Seed mit Planet-ID, Profilversion, Generatorversion, Balance-Hash und Schwierigkeit. Ein 32-Bit-Mischer verteilt benachbarte Seeds, danach liefert der vorhandene 32-Bit-LCG die Ziehungen. Die kanonische JSON-Darstellung des Planinhalts erhält eine stabile `generated.*`-ID. Standort- und Ziel-IDs referenzieren Inhalte. Jeder Start erhält zusätzlich eine unabhängige Einsatz-UUID.

| Version | Aktueller Wert | Bei Änderung |
| --- | --- | --- |
| Generator | 1 | Ziehungslogik, Kandidatenreihenfolge oder Bedeutung von Regeln versionieren. |
| Planformat | 1 | Wire- oder Serialisierungsänderungen versionieren und Leser gezielt migrieren. |
| Dev’-Ault-Profil | 1 | Geografie, Location-IDs, Regionsauswahl oder Kompatibilität versionieren. |
| Vorlagen | je 1 | Zielstruktur und Vorlagenregeln versionieren. |
| Balance | Hash und Release der Registry | Vergleich und Replay mit denselben Datendateien. |

Der Room simuliert den bereits bestätigten und eingefrorenen Plan. Ein Reconnect liest dieselbe Instanz. Der Plan kann als JSON serialisiert und unter den passenden Versionen wieder validiert werden. Der Generator weist unpassende Format- oder Inhaltsversionen ab. Ein späterer Persistenzleser benötigt die passende historische Plan- und Content-Version oder eine explizite Migration. Kampfsimulation, Operatorentscheidungen und Angriffspacing folgen dem laufenden Einsatz.
