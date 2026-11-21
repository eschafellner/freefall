# Serverseitige Trefferprüfung · 7.4C

Vor Windup und im aktiven Fenster prüft der Server lebenden Gegner, gültiges und angreifbares Ziel und dessen aktuelle Position. Der Start braucht einen verfügbaren Cooldown. Ein gebundener Angriff behält Gegner-ID, Zielobjekt und Operator-Lebens-ID. Flucht, Deckung, Tod, Zielwechsel im Sekundärpfad und Operatorwechsel können den Treffer verhindern. Der bestehende Landing- und Respawn-Schutz gilt weiterhin.

1. Stehende Operatoren behalten die bisherige 1,45-m-Mittelpunktgrenze. Für andere Haltungen begrenzt die aktuelle Kollisionsbox die erforderliche Entfernungsprüfung. Außerhalb dieser Grenze endet die Prüfung vor jeder Geometrieabfrage.
2. Der horizontale Schlagsektor prüft den nächsten erreichbaren Punkt der aktuellen orientierten Haltungsbox. Schneidet die Box nur den Rand des Sektors, prüft der Server die beiden Kantenstrahlen bis zur tatsächlichen Reichweite. Bei PRONE und SUPINE sind die Kopf-, Torso- und Beinzonen dieselben wie bei Projektiltreffern.
3. Das Körpervolumen muss den Höhenbereich des Schlags überlappen. Der Server prüft das Segment vom Schlagursprung zum ausgewählten Kontaktpunkt gegen die statische Welt. Ein verdeckter Kontaktpunkt sperrt den Treffer. Prüfung pro Zone und verfügbare Kantenstrahlen sind begrenzt. Teilverdeckung kann deshalb zu einem konservativen Fehlschlag führen.
4. Convicts und Albatross verwenden die Mittelpunkt-Reichweite und einen Deckungsstrahl auf Schlaghöhe. Dieselbe Vorbereitungs-, Winkel- und Cooldownregel bindet die jeweilige Entität.
5. Beim ersten gültigen Kontakt verbraucht der Server die Attack-ID `Gegner-ID:Starttick` vor der Schadensbuchung. Der zentrale Damage Resolver bestimmt den Fraktionsschaden. `damagePlayer` führt HP, Tod, Ausrüstungsabbruch und Respawn weiter. Für Sekundärziele ruft der Server die vorhandene Schadensmethode auf.

Die Entscheidung startet Angriffe nur aus gültigem Kontakt. Geprüft wird wieder am ersten aktiven Tick und an den übrigen aktiven Ticks, solange der Angriff unverbraucht ist. Verlässt das Ziel das Volumen während des Windups, kann derselbe Angriff erst bei erneutem Kontakt im aktiven Fenster treffen. Nach der Recovery kann die Zielwahl und Navigation einen neuen Angriff ermöglichen. Operatorwaffen und Granaten laufen vor gegnerischem Nahkampf. Convict-Feuer läuft im anschließenden Missionstick. Ein später getöteter Gegner verliert seinen Angriff vor der nächsten Replikation.

[Haltungsdetails](ENEMY_TACTICAL_RESPONSES.md) · [Tests](ENEMY_AI_PLAYTEST.md)

## 7.4E · Deckung bei Sekundärzielen

Der Schabenangriff gegen Convicts und Albatross-Bauteile prüft die Deckung auf der registrierten Schlaghöhe von 0,72 m. Die bisherige Sichtlinie auf 1 m konnte über eine 0,85 m hohe Barriere hinweg einen Treffer zulassen. Die Regression platziert diese Barriere nach Angriffsbeginn und prüft die HP in allen aktiven Ticks. [Combat-Integration](MILESTONE_7_4_FINAL_ACCEPTANCE.md)
