# Welt-Seed und Versionsbindung

Welt- und Missions-Seeds sind separate vorzeichenlose 32-Bit-Werte. Der Host kann für generierte Planeten einen Welt-Seed eingeben. Ein leeres Feld verwendet eine Serverziehung. Der bestehende Missions-Seed ist im Debug-Modus für exakte Wiederholungen direkt auswählbar. Beide Seeds stehen im Briefing.

Generator, Planformat, Planetprofil und Assetkatalog stehen bei Version 1. Das vorzeichenlose Integer-Hashing treibt das Rauschen und die Platzierung. Höhen werden auf Zentimeter gerundet. Die Welt-ID bindet Seed, Versionen, quantisierte Höhen, Standorte, Regionen und Kollisionsproxies. Der Client rekonstruiert die Welt aus der Identität und prüft den berechneten Hash gegen den Serverwert. Eine Versions- oder Hashabweichung blockiert die lokale Vorhersage und meldet den Konflikt.

Der Missionsgenerator erhält eine Welt mit nutzbaren Standorten. Der Missions-Seed bestimmt die Auswahl aus diesen Standorten, Vorlagen, optionalen Zielen, Durchbruchregionen und zulässigen Modifiern. Die World Plan ID steht im MissionPlan und in den Ergebnisdaten. Geometrieänderungen nach Veröffentlichung brauchen einen Versionssprung, wenn derselbe Seed andere Spielflächen ergibt.
