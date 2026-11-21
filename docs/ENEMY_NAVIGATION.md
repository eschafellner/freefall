# Boden-Navigation · 7.4B

Bodenbruch verwendet weiterhin direkte Segmente und geteilte Distanzfelder auf einem planaren Raster. Das Raster hat ein 5-m-Grundmaß und Zusatzachsen entlang der freien Hindernisflächen. Von jedem freien Knoten gehen nur geometrisch freie Kanten aus. Die einmal berechneten Zusammenhangskomponenten erlauben der Wahrnehmung und der Patrouillen-Wegpunktwahl eine Erreichbarkeitsprüfung ohne Distanzfeld. Direkte Korridore umgehen das Raster. Bei einem Hindernis verbindet der Server Start und Ziel mit sichtbaren Ankern und folgt absteigenden Distanzen. Bis zu drei sichtbare Schritte werden zu einem Wegpunkt zusammengefasst.

## Planung und Budgets

| Parameter | Standard | Wirkung |
| --- | ---: | --- |
| `gridCellSize`, `cornerClearance`, `anchorSearchCells` | 5 m, 0,12 m, ±2 | Grundraster, Abstand der Zusatzachsen zum Hindernis nach Abzug des Körperradius und Suchfenster in beiden Achsen. |
| `waypointLookahead` | 3 | Obergrenze für transparente Abkürzungen über benachbarte Rasterkanten. |
| `routeRequestsPerTick`, `fieldBuildsPerTick` | 144, 2 | Begrenzen Routenabfragen und neue Felder je Server-Tick. |
| `fieldCacheLimit` | 32 | Geteilte Felder je Zielanker. Schreibt bei Verdrängung in das frei gewordene Array. |
| `routeRefreshTicks`, `goalRefreshDistance` | 12, 0,70 m | Versetztes Aktualisierungsintervall aus 12 bis 23 Ticks und Schwelle für größere Zielverschiebungen. |
| `arrivalRadius` | 0,22 m | Toleranz am Endpunkt. Zwischenwegpunkte erhalten wegen enger Ecken die halbe `cornerClearance`. |

Ein erschöpftes Budget führt zu einem späteren Versuch. Ein zum aktuellen Ziel passender Wegpunkt oder ein noch brauchbares Zwischenziel kann weiterverwendet werden. Ohne geeigneten Wegpunkt wartet die Schabe für das laufende Lenkintervall. Ein Ziel- oder Lebenswechsel verwirft die gespeicherte Route sofort. Bei anhaltender Kollision erhält [Recovery](ENEMY_STUCK_RECOVERY.md) eine erneute Planungsgelegenheit im selben Budget. In der Arena reichen direkte Richtungen und die vorhandene Begrenzung.

## Geometrie

`WorldDefinition` beschreibt in Boreal Relay und Bodenbruch eine ebene Schaben-Lauffläche. Bodenbruch modelliert Felsen, Wände, Deckung und Albatross-Bodenhindernisse als planare Kollisionsflächen, unabhängig von der sichtbaren Oberkante. Hinzu kommen die Außenkanten und der Clearance-Radius von 0,37 m. Die Bewegung prüft jede Positionsänderung an der Geometrie. Die Laufwege unterstützen offene sowie geknickte Durchgänge und die Umfahrung niedriger Deckung. Höhenprofile, Steigungen, begehbare Oberseiten und bewegte Nav-Blocker wären zusätzliche Geometriedaten. Nester, Convicts und Missionsinteraktionen verändern in diesem Modell keine statischen Navigationskanten.

## 7.4E · Kontakt unter Last

Das Grid verwirft eine Kontaktprobe vor der quadratischen Prüfung, wenn der aktuelle Mittelpunkt entlang einer Achse außerhalb von Bewegungsstrecke plus Kontaktradius liegt. Die Kandidatenzellen, ihre Reihenfolge und die Kollisionsprüfung für verbleibende Kandidaten sind gleich. [A/B-Messung](ENEMY_AI_PERFORMANCE.md)
