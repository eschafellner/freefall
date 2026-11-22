# Zustandsmaschine des Horde Directors

Alle Zeiten laufen im Server-Tick mit 30 Hz. Die Wellen-ID steigt innerhalb der Mission. Der Encounter-Pass verarbeitet jeden Tick einmal. Meldungen referenzieren den Lauf über den Missionssnapshot und die Wellen-ID.

| Phase | Verhalten mit Standardwerten | Übergang |
| --- | --- | --- |
| CALM | 27–33 s Vorlauf beim Einstieg oder nach Recovery. Reguläre Missionsspawns laufen. | BUILDUP bei freier Kapazität, mindestens einem lebenden Operator, Pressure ≤ 0,42 und freier Missionspriorität. |
| BUILDUP | 6 s. Plant und versucht genau eine Vorhutgruppe. | ASSAULT nach Ablauf. |
| ASSAULT | Mindestens 8 s, höchstens 20 s. Gestaffelte Gruppen bis zum gültigen Wellenbudget. | PEAK bei bereits erzeugten Wellenmitgliedern. Ohne erzeugtes Mitglied endet die Welle als `blocked`. |
| PEAK | 7–12 s. Bereits erzeugte Gruppen kommen an und kämpfen. | RECOVERY nach frühestens 7 s bei Pressure ≤ 0,42, spätestens nach 12 s. |
| RECOVERY | 16–30 s. Reguläre Missionsereignisse und lebende Gegner bleiben aktiv. | CALM nach 16 s bei niedriger Pressure und freier Missionspriorität oder spätestens nach 30 s. |

Nach Wellenbeginn kann Missionspriorität oder Pressure ≥ 0,68 direkt RECOVERY auslösen. Der Grund steht in `HordeWaveEnded`. Ein normaler Ablauf meldet `completed` bei ausgeschöpftem Budget, `partial` bei mindestens einem Spawn unter Budget und `blocked` bei dauerhaft fehlenden gültigen Positionen oder Slots. Gegner in abgelegenen Regionen oder ohne Kontakt können den Ablauf nicht festhalten. Eine Pause in CALM verschiebt den frühesten erneuten Start um mindestens ein Build-up-Fenster ab dem Ende der Pause. Beim Missionsende wird die Welle mit `mission-ended` abgerechnet und der Snapshot entfernt.

Der lokale Host kann in CALM den Vorlauf über **Welle anstoßen** verkürzen. Druck, Missionspriorität, Kapazität und Standortprüfung gelten dabei weiter. Der Klick kann für denselben Zustand mehrfach eintreffen. Nur der erste erfolgreiche Übergang vergibt eine Wellen-ID.
