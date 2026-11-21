# Welt und Missionsgenerator

Der Host wählt im Carrier Planet, optionalen Welt-Seed, Auftragsvorlage und Schwierigkeit. Der Server erzeugt zuerst die Oberfläche, bindet ihr Missionsprofil und erstellt den Missionsplan. Die Standardvorlagen sind Nestjagd, Relaisverteidigung und Relaisverbund. Die statische Operation Bodenbruch bleibt direkt auswählbar.

Das Weltprofil liefert einen Landepunkt, Albatross mit Nachschub, drei Relaisstandorte, ein Startnest, zwei Ballonzonen und 16 Durchbruchregionen. Ein Missionsplan wählt eine Teilmenge. Der bestehende Validator prüft Freiraum, Abstand, Route vom Landepunkt, Standorte der vier Operatoren und Planregeln. Der Director verwendet die ausgewählten Regionen mit dem bestehenden Spawn-Budget und der Sicht- und Abstandskontrolle.

Vom Boarding laufen Deployment, Objectives, Horde-Phasen, Nachschub, Albatross und Ballon sowie MissionResult durch die bestehenden Systeme. Server und Client nutzen aktive Weltkoordinaten. Der Result-Datensatz führt World Plan und Mission Plan mit ihren Seeds. Eine abgelehnte Generierung belässt die letzte gültige Auswahl.
