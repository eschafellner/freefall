# Spielercharakter

`PlayerView` verwaltet vier Slots und teilt Geometrien, Materialien und Asset-Cache zwischen den Figuren. Die Teile des prozeduralen Rigs werden nach Geometrie und Material instanziert. Importierte Skinning-Rigs nutzen ihren eigenen Renderpfad. Ein `PlayerVisualController` je Slot verbindet Positionsdaten, Animation, Charakter-Rig und `WeaponVisualController`. Die lokale Figur verwendet die vorhergesagte Position. Die übrigen Figuren verwenden interpolierte Serverpositionen. Sitzungs-ID und Lebensnummer setzen Animation und Recoil bei Slotwechsel oder Respawn zurück.

## Integrierte Darstellung

Der Operator ist ein prozedurales, geskinntes Modell auf einem Skelett mit 27 Knochen (FREEFALL-Knochennamen). Rüstung, Helm und Rucksack sind austauschbare Ausrüstungsteile aus der Garderobe; ein Look kostet zwei Draw Calls pro Operator. Die Animation läuft prozedural auf diesem Skelett: Zweigelenk-IK für Arme und Beine, Fußabrollen, Beckenbewegung, Wirbelsäulenverteilung, Gewehrhaltung mit eingedrehtem Oberkörper, Federn für Sekundärbewegung und Schrittkorrektur im Stand. Alles Weitere, auch wie neue Rüstungen angelegt und später spielwirksam gemacht werden: [Operator: Modell, Rüstungen und Animation](OPERATOR_MODELL.md).

Convicts nutzen dasselbe Rig mit dem Häftlings-Look: oranger Overall mit Reflexstreifen, Kapuze mit Atemmaske, Gewahrsamshalsband mit Statusleuchte, festgeschnallte Schrottplatten, Arbeitshandschuhe, abgetragene Stiefel und Seesack mit der bisherigen Kennzeichnung.

Frühere Stände: [Waffenhaltung](character/waffenhaltung.jpg) · [Nachladen](character/nachladen.jpg) · [Modelle 2026-11-22](visual-style/modelle-vorher-nachher.jpg)

| Slot | Zweck | Knochen im prozeduralen Rig |
| --- | --- | --- |
| `Helmet` | Zubehör am Kopf | `Head` |
| `Torso` | Brustpanzer oder Träger | `UpperChest` |
| `Arms` | Anker am linken Oberarm | `LeftUpperArm` |
| `Legs` | Anker an der Hüfte | `Hips` |
| `Backpack` | Rückseite des Rucksacks (z. B. Häftlingsbeschriftung), je Rucksack eigener Anker | `Backpack` |
| `PrimaryWeapon` | Gewehr in der aktiven Haltung, mit eigenem Weapon-Rig | Waffenrahmen am `UpperChest` |
| `SecondaryWeapon` | Holster am rechten Hüftgurt, Lage je Rüstung | `Hips` |

Jeder Slot ist ein Three.js-Knoten für visuelle Objekte. Beim Wechsel des Looks wandern die Slots zu den Ankern der neuen Teile. Externe Rigs können die Anker über `equipmentNodes` zuordnen.

## GLB und glTF

Die Registrierung erfolgt in `apps/client/src/rendering/AssetRegistry.ts`. `AssetLoader` lädt GLB und glTF bei Bedarf, hält je Pfad das Lade-Promise und teilt die geladenen Geometrien und Materialien. `SkeletonUtils.clone` erzeugt unabhängige Skelette. Bei Ladefehlern, fehlendem Waffenanker oder fehlenden Mindestclips bleibt der Fallback aktiv. Der Renderer besitzt den Cache, die Figuren besitzen Mixer und Skelettklone.

Projektstruktur für neue Assetdateien unter `apps/client/public/assets/`:

```text
characters/soldier/models/
characters/soldier/animations/
characters/soldier/materials/
weapons/assault-rifle/models/
weapons/assault-rifle/attachments/
```

- Maßstab Meter. Füße am Modellursprung, +Y oben, −Z vorwärts, +X zur rechten Seite. Modell- und Knotenskalierung vor Export anwenden.
- Geskinntes Rig mit konsistenten, eindeutigen Bone-Namen. `PrimaryWeapon` muss am Waffenhand-Rig mit Ursprung am Griff und der lokalen Gewehrausrichtung liegen. Weitere Anchor-Namen können in der Registry belegt werden.
- `Idle` und `Walk` oder `Run` sind Mindestclips. Weitere Clips können im Modell, als `animationPaths` mit identischer Skeleton-Bindung oder als `animationPacks` mit eigenem Skelett eingebunden werden; Letztere werden retargeted. Humanoid-Zuordnung über `skeleton` (Preset oder Knochenliste). [Animationsvertrag](ANIMATION_SYSTEM.md) · [Asset-Anforderungen](CHARACTER_ASSET_REQUIREMENTS.md)
- Meshes möglichst nach Material zusammenführen und modulare Teile gezielt dem jeweiligen Anker zuordnen. Für Produktionsassets PBR-Texturen (Base Color, Normal, Roughness/Metallic) mit passenden Farbräumen verwenden. KTX2 setzt die Registrierung eines Transcoderpfads voraus.
- Für neue Assets Quelle, Urheber, Lizenz, zugelassene Projektverwendung und gegebenenfalls Attributionspflicht im Repository erfassen. Dieser Meilenstein enthält ausschließlich projektinternen prozeduralen Charakter- und Waffencode. Externe Modelldateien und Drittanbieter-Clips wurden nicht eingebunden.

Für Produktionsqualität fehlen ein geskinntes Soldatenmodell mit Uniform- und Materialtexturen, animierte Hände und Finger, rüstungstaugliche Deformationen, feinere modulare Ausrüstung und eine abgenommene Clip-Bibliothek. Die Waffenpose muss für das konkrete Asset über alle Bewegungs- und Zielwinkel geprüft werden. [Waffenvertrag](WEAPON_VISUAL_SYSTEM.md) · [Messungen](PERFORMANCE.md#milestone-3)
