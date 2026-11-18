# Gegnerfraktionen

| Fraktions-ID | Anzeigename | Registrierte Archetypen |
| --- | --- | --- |
| `swarm` | Der Schwarm | `swarm.schabe` |

Die **Schabe ist das freigegebene Basisdesign** der Fraktion „Der Schwarm“. Silhouette, Geometrie, Maßstab, Materialien, Farben, Animation, grundlegendes Bewegungsverhalten und Kampfwerte dürfen nur auf explizite Anforderung geändert werden. Globale Beleuchtung und Postprocessing dürfen weiterhin auf die Schabe wirken. Bei solchen Änderungen dienen die Referenzaufnahmen zur Prüfung von Identität und Lesbarkeit. [Schabe-Baseline](enemies/SCHABE.md)

## Daten und Zuständigkeiten

| Ebene | Ort und Aufgabe |
| --- | --- |
| Fraktion und Archetyp | `packages/shared/src/definitions/enemies.ts` verknüpft stabile IDs, Anzeigenamen und die numerische Netzwerk-ID. |
| Gameplay | Das unveränderliche `gameplay`-Objekt gehört zum Archetyp. `ENEMY_TYPES` leitet seine nach Netzwerk-ID indizierte Tabelle daraus ab. Das ECS greift in den inneren Schleifen direkt auf diese Tabelle zu. |
| Darstellung | `apps/client/src/rendering/AssetRegistry.ts` ordnet der visuellen Asset-ID den vorhandenen Instancing-Renderer zu. Shared und Server kennen nur die Asset-ID als Zeichenkette. |
| Spawn | `apps/server/src/simulation/ArenaEncounter.ts` wählt den Archetyp und beschreibt Spawn-Ring und Wiederauffüllung der Testarena. |

`RUNNER_TYPE` ist der Kompatibilitätsalias für die Schabe. Netzwerk-ID `0`, Bytebreite, Tickrate und Frameaufbau bleiben erhalten. `ENEMY_ARCHETYPES_BY_TYPE` löst die Wire-ID zur stabilen Identität auf.

Weitere Typen erhalten eigene Archetyp-IDs und freie Wire-IDs im Bereich 0–255. Eine zweite Darstellung braucht eine Zuordnung im Client und typbasierte Instancing-Batches. Die derzeitige Arena wählt beim Start genau den registrierten Schabe-Renderer für ihre homogene Horde. Unterschiedliche Fähigkeiten brauchen ein explizites Gameplay-System, falls sie über die vorhandenen Werte und Nahkampfregeln hinausgehen.
