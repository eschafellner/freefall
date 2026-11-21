# Spawn-Verwaltung für Bodenbruch

Alle Missionsgegner laufen durch `EncounterDirector` und `SpawnManager`. Die Reihenfolge im Tick ist Extraktionssignal und bestehende Patrouillenalarme, fällige Nester, Patrouillen-Seed und Director-Welle. Das Arena-Refill verwaltet die separate Boreal-Relay-Simulation.

- Der Cap ist das Minimum aus Schwierigkeits-Cap und ECS-Cap. Die sieben Stufen verwenden 120, 200, 320, 450, 600, 800 und 1.000 Gegner. Der bestehende Spawn-Tickcap beträgt je nach Stufe 8–24. Pro Tick validiert der Manager maximal 32 Kandidaten, davon bis zu vier für die Welle. Der Tickcap umfasst sämtliche erfolgreichen Initialisierungen dieses Missionsraums.
- Die Wellenwarteschlange enthält eine Gruppe mit maximal fünf Plätzen. `reserveWave` bucht die tatsächlich verfügbaren Plätze synchron; 24 freie Plätze bleiben regulären Produzenten vorbehalten. Droht ein regulärer Spawn nach erfolgreicher Prüfung das Limit aus aktiven und reservierten Plätzen zu überschreiten, beansprucht er einen reservierten Platz. Aktive Gegner zählen über die dichte ECS-Liste. Ein erfolgreicher Wellenspawn ersetzt genau einen reservierten Platz durch einen aktiven.
- Abgebrochene oder erschöpfte Gruppen geben ihre Reservierung sofort frei. Eine Welle hält keine Plätze über PEAK, RECOVERY oder Missionsende hinweg. Ein ECS-Tod gibt den aktiven Platz frei. Es gibt keinen zweiten Lebenszykluszähler im Manager.
- Wellen liefern höchstens einen erfolgreichen Spawn pro Tick und lassen mindestens sechs Ticks bis zum nächsten Gruppenmitglied sowie 60 Ticks zwischen Gruppen. Pro Gruppe sind 16 Ortsversuche zulässig. Das reguläre Patrouillen-Seeding hat ein 900-Tick-Fenster und bei ungültiger Position einen Retry im bestehenden Wahrnehmungstakt. Am Ende des Fensters werden verbleibende Plätze verworfen.
- Ein Nest hält wie bisher einen fälligen Spawn. Wenn sein normaler Ausgang blockiert ist, kann es die anderen registrierten Ausgänge nutzen. Ist das Prüf- oder Populationsbudget erschöpft, wartet es bis zum bestehenden Retry-Tick. Zerstörung entfernt den Auftrag mit dem Nest. Der bereits existierende Garnisonstrupp bleibt im ECS.
- Das Bewegungsgrid entsteht vor der Integration. Für den Spawn-Pass wird das gleiche Grid-Format erst bei der ersten nötigen Belegungsprüfung aus den aktuellen Positionen gefüllt. Neu erzeugte Slots werden direkt eingetragen. So erfassen Belegungsprüfungen auch zwei Produzenten im selben Tick.

Die Drosselung folgt festen Arbeitsbudgets in Simulationsticks. Sie ist unabhängig von Wandzeit und Last des Betriebssystems. F2 zeigt das letzte Zurückstellen durch Kandidatenlimit oder Kapazität, belegte Slots, offene Gruppenplätze und Kandidatenraten. [Prüfreihenfolge](HORDE_SPAWN_VALIDATION.md)

## 7.4E · Arena-Refill

`swarm.arena.maxSpawnsPerTick` begrenzt die Erzeugung im offenen Testspielmodus Boreal Relay auf 100 pro Tick. Der Tickablauf füllt beim nächsten Schritt weiter. Ein leerer Raum erreicht 1.000 Gegner in zehn Schritten, und der ECS-Hardcap gilt weiterhin. Bodenbruch verwendet die gemeinsamen Kapazitäts- und Prüfgrenzen oben. [Regressionen](MILESTONE_7_4_FINAL_ACCEPTANCE.md)
