# Encounter Director

Der Director verbindet Patrouillen, Verstärkungen und Nestproduktion mit dem vorhandenen Horde-ECS. Die gewählte Schwierigkeit legt Startpatrouillen, Spawnraten, aktive Gegner und Nester, parallele Durchbrüche sowie akzeptierte Verstärkungseffekte pro Mission fest. Initiale Gruppen erscheinen gestaffelt. Freigewordene Slots gehen an wartende nest- oder gruppengebundene Spawns.

Das Bedrohungsniveau ist serverseitig auf 100 gedeckelt. Es kombiniert einen Stufensockel, fünf Punkte je aktivem Nest, abklingende Alarmwärme, Relais-Verbindungsaufbau und Extraktionsdruck. Erfolgreiche Rufe erhöhen die Wärme um zwölf bis zu einem Maximum von 42. Der Director passt die Produktion an die Bedrohung an. Die Zerstörung eines Nests entzieht dem Schwarm Produktion und seinen Threat-Beitrag.

Ein erfolgreicher Ruf reserviert eine gültige Region für einen Durchbruch. Wenn ein neuer Durchbruch durch Kapazität oder Regionenauswahl blockiert ist, kann der Ruf ein geeignetes bestehendes Nest in Reichweite 18 Sekunden lang beschleunigen. Beide Effekte verbrauchen dasselbe Lebenszeitbudget. Existiert keine gültige Option, endet der Ruf ohne Verstärkung. Der Director begrenzt die Zahl paralleler Rufversuche sowie die Häufigkeit akzeptierter Effekte.

Der Extraktionscountdown aktiviert zeitlich und räumlich begrenzte Verstärkungsversuche im Umkreis der Abholzone. Die Intervalle und der Produktionsdruck folgen der Schwierigkeit. Die gleichen Abstände, Budgets und Vorwarnzeiten gelten während der Extraktion. Wachsamkeit, frühe Nestzerstörung und das Unterbrechen von Alarmgebern halten die Zahl gleichzeitig aktiver Gefahren niedrig.

Die Performance-Regression misst fünf Missionsprofile. Schwierigkeits- und Threatwerte sind erste Spieltestspezifikationen, deren Feinabstimmung gemeinsame Testeinsätze erfordert. [Leistungsprotokoll](PERFORMANCE.md)
