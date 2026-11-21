# Missions- und Kampfmeldungen 7.8D

`PresentationNotices` hält einen sichtbaren Platz und insgesamt bis zu vier zeitlich begrenzte Meldungen. Die Reihenfolge lautet kritischer lokaler Schaden, Extraktion, Zielereignis, Nachschub und Information. Wichtige Meldungen können sofort übernehmen. Niedrigere Einträge bleiben bis zu ihrem Fristende verfügbar. Gleiche aktive Meldungen verlängern die Frist nicht. Deckung, Schussbestätigung, Zustand des Trupps, Ziele und Extraktionsstatus besitzen eigene UI-Flächen.

`MissionPresentation` verarbeitet ausschließlich autoritative Snapshots und Ereignisse. Snapshots liefern die persistente Anzeige für Zielstatus, verfügbare Container, Trupp und Extraktionsphase. Flüchtige Ereignisse liefern Zielabschluss, Verteidigungsbeginn, bestätigte Nestzerstörung, Aufsetzen, Verstärkungsruf und Unterbrechung. Lokale Nachschubmengen und verworfene Patronen stammen aus bestätigten Combat-Ereignissen. Ausfälle von Convicts werden aus dem replizierten HP-Übergang erkannt.

Neue Server stempeln Missionsereignisse mit Instanz-ID und monotoner Folge. Der Client prüft Missionsinstanz, ein Frischefenster von zwei Sekunden und einen begrenzten Verlauf, der frische umsortierte Ereignisse zulässt. Ältere Server verwenden Tick, Typ und fachliche ID. Reconnect und Missionswechsel initialisieren eine neue Anzeige mit dem aktuell empfangenen Snapshot. Ein beim Wiedereinstieg noch laufender Zustand bleibt als reguläres Missions-HUD sichtbar. Alte Einzelmeldungen vor diesem Snapshot werden verworfen.

Der priorisierte Meldungsplatz wird als Statusbereich vorgelesen. Bereits laufende Ziele, Durchbrüche, Extraktion und Lebenspunkte bleiben über ihre statischen HUD-Flächen verfügbar.
