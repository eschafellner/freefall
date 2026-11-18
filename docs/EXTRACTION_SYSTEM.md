# Extraktionssystem

Ein `ExtractionSystem` je Einsatz führt zwei Strategien über einen gemeinsamen aktiven Extraktionszustand. Die Missionsmaschine schaltet sie nach den Hauptzielen frei. Der Server prüft den Einsatzstatus, die Lebenspunkte, den verbundenen Operator und die autoritative Position. Alle Wege führen zum gleichen `MissionResult`.

| Methode | Anforderung | Erfolgsregel |
| --- | --- | --- |
| Albatross | **E** in der flugfähigen Kabine. Vier Sekunden Vorlauf. Weitere Operator sichern sich mit **E**. | Beim Abheben werden die lebenden, verbundenen, gesicherten Personen innerhalb der Kabinenfläche übernommen. Zwei zerstörte Düsen oder ein zerstörter Rumpf brechen einen laufenden Start vor dem Abheben ab. |
| Extraktionsballon | **B** auf freiem, offenem Untergrund. Weitere Operator sichern sich mit **E** innerhalb von 25 m. | Nach 90 Sekunden und drei Sekunden Anflug übernimmt der Jäger die lebenden, gesicherten Personen. |

Teilweise Extraktion ist zulässig. Ein einzelner Operator kann einen Start anfordern. Die Personenanzahl und das Extraktionsfenster werden im Trupp-HUD angezeigt. Weitere Operator müssen sich aktiv sichern. Bei Verlust der Flugfähigkeit während des Albatross-Countdowns ist die Wahl wieder offen. Der Ballon ist auch bei flugfähigem Albatross verfügbar.

Während eines ausstehenden Countdowns hält der Encounter Director die bestehenden Nester, Durchbrüche und Verstärkungsbudgets ein. Der Druck reagiert auf die Schwierigkeitsparameter. Die Positionsvalidierung und der 1.000-Gegner-Cap bleiben auch während des Rettungsvorgangs aktiv.

Ab Milestone 6 endet der Einsatz ausschließlich mit mindestens einer erfolgreich extrahierten Person oder einem vollständigen Teamwipe. Ein leerer Albatross bricht den Start ab und kann erneut angefordert werden. Verpasst der Jäger alle Operatoren, bleibt derselbe Ballon aktiv und signalisiert den nächsten Anflug. Andere Überlebende können sich an diesem Seil sichern. Ein vor dem Fang getrennter Operator zählt beim Reconnect zunächst als ungesichert.
