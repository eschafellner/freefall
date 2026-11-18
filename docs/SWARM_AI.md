# Swarm AI

`PatrolManager` ordnet bestehende ECS-Slots einer Gruppen-ID zu. Die stabile Schaben-ID unterscheidet lebende Mitglieder von wiederverwendeten Slots. Der Manager führt Regionsroute, Gruppenposition, aktuellen Wegpunkt, letzte Beobachtung, Alarmgeber und Ruf-Cooldown. Nestnachschub bildet eigene kleine Gruppen oder schließt sich einer Gruppe am selben Nest an.

- `PATROLLING` und `RETURNING` steuern auf Wegpunkte zu. Leicht variierende Versätze und das vorhandene Separation-Grid lockern Gruppen auf.
- `SUSPICIOUS` reagiert kurz auf Geräusche. Anschließend steuert `INVESTIGATING` die Gruppe auf die Quelle zu.
- Sichtkontakt wechselt über `ALERTED` zu `CALLING_REINFORCEMENTS` oder unmittelbar zu `ENGAGING`, falls der Ruf-Cooldown oder das verfügbare Budget greift.
- `ENGAGING` verfolgt Sichtkontakte und zuletzt bekannte Positionen. Ohne neuen Kontakt folgt eine kurze Suchphase `SEARCHING` und die Rückkehr.
- `ELIMINATED` entfernt leere Gruppen, sobald deren geplante Anfangsmitglieder gesetzt sind.

Wahrnehmung läuft pro Gruppe gestaffelt alle sechs Ticks. Sicht basiert auf Distanz, Blickwinkel und Deckungsstrahlen. Einmal alarmierte Gruppen beobachten auch seitlich und rückwärts. Ein Schuss meldet eine Geräuschquelle bis 48 m, ein Explosions-Input an die Simulationsschnittstelle bis 82 m. Explosionswaffen sind für später vorgesehen. Die geschützte Landezone wird bei der Erkennung ausgeklammert.

Der Alarmgeber hält an und wird für drei Sekunden markiert. Seine stabile ID wird bis zum letzten Tick der Rufphase geprüft. Schüsse und Todesfälle werden vor deren Auflösung simuliert. Ein toter Alarmgeber unterbricht den Ruf. Ein abgeschlossener Ruf bleibt nach dem Tod erhalten. Gruppen-, Regions- und globale Sperrzeiten greifen unabhängig voneinander. Ein belegter oder ausgeschöpfter Kanal wird als Unterbrechung gemeldet.

Wegfindung nutzt direkte Sichtlinien und zwischengespeicherte Distanzfelder auf einem 5-m-Raster für verdeckte Ziele. Mehrere Gegner mit demselben Ziel teilen ein Feld. Das bestehende räumliche Separation-Grid und Bewegungssystem erledigen die lokale Steuerung. Die vereinfachte Gruppensicht kann an Felsengruppen Spieler übersehen, bis die Gruppenmitte freie Sicht erhält. [Encounter Director](ENCOUNTER_DIRECTOR.md)
