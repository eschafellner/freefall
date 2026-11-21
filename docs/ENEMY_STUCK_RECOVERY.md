# Stuck Detection und Recovery · 7.4B

Der Server summiert den **gerichteten** Fortschritt zum aktuellen Wegpunkt über ein Fenster von 18 Ticks (0,6 s). Als Erwartung dienen Bewegungstempo, Tickdauer und die verbleibende Distanz. Weniger als 15 % Fortschritt lösen Recovery aus. Gegenläufige Schritte verrechnen sich. Absichtliches Halten, Stagger und ein erreichter Wegpunkt setzen das Fenster zurück. Fehlende Routen und ungültige Spawnursprünge haben eigene Zähler.

1. Der erste Versuch wechselt auf eine für die Gegner-ID feste Ausweichseite. In einem lokalen Kontakt kann eine Schabe zur Seite zurücksetzen und so Platz machen.
2. Der zweite Versuch wechselt die Seite und aktualisiert den Wegpunkt im regulären Routenbudget. An einem Zwischenwegpunkt in dichtem Gedränge kann sich der Gegnerkörper im Kontakt auf 58 % seines normalen Kontaktabstands annähern. Die solide Welt verwendet weiterhin 0,37 m Radius.
3. Der dritte Versuch berücksichtigt einen neuen Angriffspunkt und gibt der Wegpunktrichtung Vorrang.
4. Nach ausgeschöpften Versuchen kann die Schabe mit gültigem Ziel anhalten. Sie prüft nach 45 Ticks und anschließend versetzt, ob die Nachbarschaft freier oder ein Vorwärtsschritt möglich geworden ist. Unveränderte Nachbardichte erlaubt höchstens drei erneute Anläufe pro Episode. Ein materiell versetztes Ziel oder ein neuer Zieloperator kann die Wartephase auflösen. Eine ohne Pfad bestätigte statische Route erhält bis zu drei versetzte Wiederholungen im Abstand von 12 Ticks.

Ein Gegner mit gültigem Ausgangspunkt bleibt während Recovery auf der regulär integrierten Position. Bei ungültiger Startposition gilt die Reparatur aus 7.4A auf einen freien Punkt an der Kante oder einer benachbarten Hindernisfläche. Ohne reparierbare Position pausiert der Gegner. Nach Slotrecycling verwirft der Server Routen, Zielidentität und Recovery-Zustände der früheren Gegner-ID.

| Parameter | Standard |
| --- | ---: |
| `stuckTicks` / `stuckProgressRatio` | 18 / 0,15 |
| `recoveryRetries` / `recoveryCooldownTicks` | 3 / 45 |
| `recoveryContactScale` | 0,58 |
| `unreachableRetryTicks` | 12 |

F2 im lokalen Missions-Debugroom zeigt Episoden, Versuche, erfolgreiche Rückkehr zur Bewegung, Warteübergänge sowie Positionsreparaturen. Ein Warteübergang kann bei derselben Schabe mehrfach auftreten.
