# Gegnerfraktionen

| Fraktions-ID | Anzeigename | Registrierte Archetypen |
| --- | --- | --- |
| `swarm` | Der Schwarm | `swarm.schabe`, `swarm.jaeger`, `swarm.durchbruchskaefer`, `swarm.assaultbreaker` |

Die **Schabe ist das freigegebene Basisdesign** der Fraktion „Der Schwarm“. Silhouette, Geometrie, Maßstab, Materialien, Farben, Animation, grundlegendes Bewegungsverhalten und Kampfwerte dürfen nur auf explizite Anforderung geändert werden. Globale Beleuchtung und Postprocessing dürfen weiterhin auf die Schabe wirken. Bei solchen Änderungen dienen die Referenzaufnahmen zur Prüfung von Identität und Lesbarkeit. [Schabe-Baseline](enemies/SCHABE.md)

## Daten und Zuständigkeiten

| Ebene | Ort und Aufgabe |
| --- | --- |
| Fraktion und Archetyp | `packages/shared/src/balance/data/enemies.json` verknüpft stabile IDs, Anzeigenamen, Werte und die numerische Netzwerk-ID. `definitions/enemies.ts` stellt die bisherigen Aliase bereit. |
| Gameplay | Das unveränderliche `gameplay`-Objekt gehört zum Archetyp. `ENEMY_TYPES` leitet seine nach Netzwerk-ID indizierte Tabelle daraus ab. Das ECS greift in den inneren Schleifen direkt auf diese Tabelle zu. |
| Darstellung | `apps/client/src/rendering/AssetRegistry.ts` ordnet der visuellen Asset-ID den vorhandenen Instancing-Renderer zu. Shared und Server kennen nur die Asset-ID als Zeichenkette. |
| Spawn | `apps/server/src/simulation/ArenaEncounter.ts` wählt den Archetyp und beschreibt Spawn-Ring und Wiederauffüllung der Testarena. |

`RUNNER_TYPE` ist der Kompatibilitätsalias für die Schabe. Netzwerk-ID `0`, Bytebreite, Tickrate und Frameaufbau bleiben erhalten. `ENEMY_ARCHETYPES_BY_TYPE` löst die Wire-ID zur stabilen Identität auf.

## Kasten

| Archetyp | Wire-ID | Rolle | Besonderheiten |
| --- | ---: | --- | --- |
| `swarm.schabe` · Schabe | 0 | Arbeiterin, Masse | Freigegebenes Basisdesign. [Schabe](enemies/SCHABE.md) |
| `swarm.jaeger` · Jäger | 1 | Schneller Krieger | Flankiert, Sprungangriff, ungepanzert, 16 Schaden. [Jäger](enemies/JAEGER.md) |
| `swarm.durchbruchskaefer` · Durchbruchskäfer | 2 | Schwerer Krieger | Frontal mittel gepanzert (Klasse 3) mit kleiner ungepanzerter Schwachstelle (Kehlsack), 300 LP, greift Operator, Convicts und Albatross-Düsen an. [Durchbruchskäfer](enemies/DURCHBRUCHSKAEFER.md) |
| `swarm.assaultbreaker` · Assaultbreaker | 3 | Signatur-Belagerungskaste | Vierbeiniger Koloss, 1.800 LP. Kopf und oberer Rumpf Klasse 5, Läufe und Schwanz Klasse 4, Bauchunterseite Klasse 2. Ansturm mit Überrennen, ab Schwer. [Assaultbreaker](enemies/ASSAULTBREAKER.md) |

Weitere Typen erhalten eigene Archetyp-IDs und die nächste freie Wire-ID im Bereich 0–255. Archetypen können optionale Felder für Körpergröße (`groundRadius`), Trefferzonen (`hitZones`), Frontpanzerung (`frontArmor`), Taktik (`tactics`, `flank`), eigenes Angriffstiming (`attack`), Sprungangriffe (`leap`), Ansturm (`charge`), Fahrzeugziele (`vehicleTargets`) und Stagger-Immunität setzen. Das gemeinsame Modul `packages/shared/src/combat/enemyBody.ts` leitet daraus die Eigenschaften je Wire-Typ ab, die Server, Netzwerk und Client nutzen. Im Client zeichnet `SwarmVisuals` jede Kaste mit einem eigenen Instancing-Renderer. Die Arena spawnt weiterhin nur Schaben.
