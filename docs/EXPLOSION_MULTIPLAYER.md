# Explosions- und Nahkampf-Replikation · 7.8C

| Ereignis | Deduplizierung innerhalb der Raumverbindung | Wiedergabe |
| --- | --- | --- |
| Release | `grenade-release:id` | Spielersnapshot-Zeit |
| Detonation | `blast:id` | Beim Eingang der Serverbestätigung |
| Kolbenstoß | `melee:tick:attacker` | Spielersnapshot-Zeit mit 320 ms Warteobergrenze |

`CombatPresentation` nutzt den tick-basierten `EventHistory` aus dem bestehenden Feedback. Bis zu 512 frische Schlüssel werden gespeichert. Unbekannte Ereignisse mit einem Abstand von mehr als einer Sekunde zum aktuellen Serverkopf verfallen. Innerhalb des Fensters kann ein eindeutiges später zugestelltes Ereignis erscheinen. Transport ist WebSocket. Snapshotverlust oder ein Disconnect können eine kurzlebige Kosmetik auslassen, während Gesundheit, Gegner, Spieler und Ziele über den nächsten relevanten Snapshot aufholen.

Beim Disconnect werden Cue-Warteschlange, Spielwelt-Effekte und kurzlebige Audio-Voices geleert. Der nächste gültige Spielersnapshot baut die Empfangsuntergrenze wieder auf. Ein vor der Trennung verarbeitetes Event behält seinen Schlüssel bei. Bei Verbindungswechsel in einen anderen Raum darf der neue Battlefield-Serial wieder bei eins anfangen. Beim Missions- und Szenenwechsel gilt ein aktueller Tick-Fence. Über die Flug-Snapshots wird keine Explosion erzeugt. Laufende Projektile können nach dem Einstieg wieder aus aktuellen Daten erscheinen.

Der Browserharness verwendet einen Browser und drei reale WebSocket-Peers, simuliert auf Wunsch zusätzliche Zustellzeit für reguläre Blast-Pakete und injiziert Echo-Pakete zur Prüfung des gemeinsamen Filters. Der Test benutzt lokale serverseitige Platzierungen. Im regulären Multiplayer bleiben alle Eingänge auf den vorhandenen Equipment- und Movement-Handlern.

[Browser und Latenznachweis](MILESTONE_7_8C_PLAYTEST.md)
