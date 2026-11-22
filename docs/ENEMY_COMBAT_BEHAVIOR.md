# Gegnerkampf · 7.4C

Die Schabe verwendet ihren bestehenden Nahkampfangriff. Arena-Zielbindung und Bodenkontakt der Patrouillen wählen weiterhin die Ziele. Eine bestehende Priorität für Operatoren, Convicts und Albatross bestimmt, welche Ziele in Bodenbruch zuerst erreichbar sind.

| Zustand | Übergang und Verhalten |
| --- | --- |
| Approach | Zielwahl und Navigation führen zum Operator. Bewegung in Schlagdistanz bevorzugt Blickrichtung zum Ziel. |
| Position for Attack / Reposition | 7.4B wählt freie oder weniger belegte Anmarschpunkte. Blockierte Deckung oder ein verfehlter Schlag lösen eine neue Sektorwahl aus. |
| Windup | Ein lebender Gegner braucht ein gültiges Ziel, abgelaufenen Cooldown, aktuellen Kontakt und beim Operator einen freien Angriffssektor. Er bindet Zielobjekt und Lebens-ID, hält Position und Schlagrichtung und kündigt den Schlag 14 Ticks an. |
| Active | Drei Server-Ticks ab Windup-Ende. Ein Schabenangriff kann in diesem Fenster einmal Schaden an seinem gebundenen Ziel verursachen. |
| Recovery | Acht Ticks ab Trefferfenster-Ende. Der Angriffssektor wird freigegeben. Danach läuft die Gegnernavigation weiter und der Cooldown kann auslaufen. |
| Interrupted | Bestehender Nahkampf-Stagger oder Zielverlust brechen die Ausführung ab und geben den Sektor frei. Der Gegner kann danach wieder zum Ziel navigieren. Ein Kill oder die Wiederverwendung des Gegnerslots entfernt den Vorgang. |

Ein neuer Windup setzt `attackAt` auf seinen Start plus den effektiven Cooldown, mindestens bis zum regulären Ende der Phasen. Bei aufeinanderfolgenden Treffern gegen ein erreichbares Ziel liegen deshalb weiterhin 39 Ticks beziehungsweise 1,3 s zwischen Schlägen. Fehlschläge und Unterbrechungen verbrauchen den begonnenen Cooldown. Zuvor konnten Schaben beim ersten gültigen Kontakt sofort treffen. Die neue Reaktionszeit senkt die Trefferquote bei bewegten Zielen. [Vergleichswerte](ENEMY_AI_PERFORMANCE.md)

`swarm.meleeAttack` in der Balance Registry stellt Windup (14 Ticks), Active (3), Recovery (8), Halbwinkel (60°) und Entscheidungsraster (2 Ticks) bereit. Aktive Angriffe laufen tickgenau. Die bestehenden Daten liefern Reichweite 1,45 m, Basisschaden 8 HP, Schlagursprung 0,72 m, vertikale Halbhöhe 0,25 m und den Cooldown. Der Missions-Snapshot enthält dieselbe validierte Timing-Konfiguration und die aufgelösten Gegnerschadenswerte. Positionstoleranz und Routenverhalten nutzen die vorhandenen `hordeAi`-Werte. Die gebundene Schlagrichtung bleibt ab Windup-Start fixiert.

[Schwarmkoordinierung](ENEMY_SWARM_BEHAVIOR.md) · [Taktische Haltungen](ENEMY_TACTICAL_RESPONSES.md) · [Trefferprüfung](ENEMY_ATTACK_VALIDATION.md)

## 7.4E · Unterbrechung bei Verbindungsabbruch

Ein Disconnect markiert offene Angriffe gegen den Operator unmittelbar als `target-lost` und gibt deren Sektoren wieder frei. Der laufende Cooldown endet auf dem geplanten Tick. Ein bereits bestätigter Treffer bleibt in der autoritativen Lebenspunktbilanz. [Trefferprüfung](ENEMY_ATTACK_VALIDATION.md)
