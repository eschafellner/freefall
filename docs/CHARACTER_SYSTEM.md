# Spielercharakter

`PlayerView` verwaltet vier Slots und teilt Geometrien, Materialien und Asset-Cache zwischen den Figuren. Die Teile des prozeduralen Rigs werden nach Geometrie und Material instanziert. Importierte Skinning-Rigs nutzen ihren eigenen Renderpfad. Ein `PlayerVisualController` je Slot verbindet Positionsdaten, Animation, Charakter-Rig und `WeaponVisualController`. Die lokale Figur verwendet die vorhergesagte Position. Die übrigen Figuren verwenden interpolierte Serverpositionen. Sitzungs-ID und Lebensnummer setzen Animation und Recoil bei Slotwechsel oder Respawn zurück.

## Integrierte Darstellung

Der prozedurale Soldat ist ein funktionaler Ersatz für ein geskinntes Produktionsmodell. Er verwendet meterbasierte Proportionen, eigenständig modellierte Schutzplatten, Helm, Handschuhe, Stiefel, Taschen und einen Funkrucksack. Stoff und Polymer verwenden matte Materialien, die Waffe einen metallischen Materialansatz. Eine Schulter- und Rückenmarkierung in jeder Squad-Farbe entspricht dem HUD-Slot. Die vorhandene Arena-Beleuchtung wird weiterverwendet. [Waffenhaltung](character/waffenhaltung.jpg) · [Nachladen](character/nachladen.jpg)

| Slot | Zweck |
| --- | --- |
| `Helmet` | Zubehör am Kopf |
| `Torso` | Brustpanzer oder Träger |
| `Arms` | Anker an der linken Schulter im Fallback |
| `Legs` | Anker an der Hüfte im Fallback |
| `Backpack` | Anker am Rücken |
| `PrimaryWeapon` | Gewehr in der aktiven Haltung, mit eigenem Weapon-Rig |
| `SecondaryWeapon` | Anker am rechten Hüftgurt |

Jeder Slot ist ein Three.js-Knoten für visuelle Objekte. Externe Rigs können die Anker über `equipmentNodes` zuordnen. Modulare Rüstungsmodelle sollen ihre austauschbaren Meshes getrennt liefern. Progression, Inventar und kosmetische Freischaltungen sind spätere Datenquellen für diese Anker.

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
- `Idle` und `Walk` oder `Run` sind Mindestclips. Weitere Clips können im Modell oder als `animationPaths` mit identischer Skeleton-Bindung eingebunden werden. [Animationsvertrag](ANIMATION_SYSTEM.md)
- Meshes möglichst nach Material zusammenführen und modulare Teile gezielt dem jeweiligen Anker zuordnen. Für Produktionsassets PBR-Texturen (Base Color, Normal, Roughness/Metallic) mit passenden Farbräumen verwenden. KTX2 setzt die Registrierung eines Transcoderpfads voraus.
- Für neue Assets Quelle, Urheber, Lizenz, zugelassene Projektverwendung und gegebenenfalls Attributionspflicht im Repository erfassen. Dieser Meilenstein enthält ausschließlich projektinternen prozeduralen Charakter- und Waffencode. Externe Modelldateien und Drittanbieter-Clips wurden nicht eingebunden.

Für Produktionsqualität fehlen ein geskinntes Soldatenmodell mit Uniform- und Materialtexturen, animierte Hände und Finger, rüstungstaugliche Deformationen, feinere modulare Ausrüstung und eine abgenommene Clip-Bibliothek. Die Waffenpose muss für das konkrete Asset über alle Bewegungs- und Zielwinkel geprüft werden. [Waffenvertrag](WEAPON_VISUAL_SYSTEM.md) · [Messungen](PERFORMANCE.md#milestone-3)
