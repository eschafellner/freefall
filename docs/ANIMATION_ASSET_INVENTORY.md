# Animationsinventar für Operatoren

Stand 19. November 2026. Die Arbeitskopie enthält keine Operator-Assets im Format GLB, glTF, FBX, BVH oder BLEND. `ASSETS.soldier` ist unbelegt. Die historischen Vergleichsaufnahmen unter `docs/character` sind Videoreferenzen. Die im Testcode erzeugten Three.js-Clips und Humanoid-Skelette sind synthetische Fixtures. Die folgende Bestandsaufnahme umfasst alle Vertragsclips und sämtliche im Spiel sichtbaren Operator-Fallbacks.

## Vorhandene Runtime-Animationen

Die folgenden Animationen entstehen im bestehenden Repository-Code. Ihr Ursprung und Nutzungsstatus leiten sich aus dem FREEFALL-Projektcode ab. Für diese Implementierung wurden keine externen Assets und keine Drittlizenzen eingebunden. Alle Einträge sind mit dem segmentierten `SoldierRig` und dessen Waffen-Sockets kompatibel. Das Rig besteht aus Gruppen und starren Mesh-Segmenten. Die jeweils genannten Teile sind deshalb Gelenke bzw. Transformationsgruppen. Alle Posen arbeiten relativ zur bereits gerenderten Position.

| Name und Zweck | Ort | Dauer und Typ | Verwendete Gelenke | Root Motion | Status |
| --- | --- | --- | --- | --- | --- |
| Idle, Walk Forward, Walk Backward, Strafe Left, Strafe Right, Run, Sprint | `CharacterAnimation.ts`, `SoldierRig.ts` | Loop, Schrittperiode aus Geschwindigkeit abgeleitet | Becken, Rumpf, Kopf, Arme, Beine, Füße | relativ | FUNCTIONAL FALLBACK |
| Aim, Fire, Reload, Weapon Switch | `CharacterAnimation.ts`, `PlayerVisualController.ts`, `SoldierRig.ts` und `WeaponVisualController.ts` | Aim gehalten, kurzer Schussimpuls je Ereignis, Reload und Wechsel über Serverintervall | Rumpf, Kopf, Schultern, Ellenbogen, Hände, Waffe und Magazin | relativ | FUNCTIONAL FALLBACK |
| Crouch Enter/Exit, Idle, Walk, Strafe, Aim, Fire, Reload | `TacticalAnimation.ts`, `SoldierRig.ts` | Übergang je 6 Ticks, Idle und Gang als Loop, Aktionen wie im Stand | Becken, Knie, Füße, Rumpf, Arme, Waffe | relativ | FUNCTIONAL FALLBACK |
| Slide Start, Loop, End | `TacticalAnimation.ts`, `SoldierRig.ts` | 18 Ticks bei Standardbalance, Phasen 20/60/20 % | Becken, Beine, Füße, Rumpf | relativ | FUNCTIONAL FALLBACK |
| Dive Forward, Backward, Left, Right und vier Diagonalen | `TacticalAnimation.ts`, `SoldierRig.ts` | One-Shot über 23 Ticks bei Standardbalance, inklusive drei Vorbereitungsticks | Becken, Wirbelsäule, Kopf, Arme, Beine, Füße | Flugbahn aus Simulation | FUNCTIONAL FALLBACK |
| Prone Entry/Landing und Supine Entry/Landing | `TacticalAnimation.ts`, `SoldierRig.ts` | Landung ab bestätigtem Landetick über 5 Ticks, Einstieg bis 6 Ticks | Becken, Rumpf, Knie, Füße, Arme | relativ | FUNCTIONAL FALLBACK |
| Prone Idle, Aim, Fire, Reload, Crawl, Switch, Stim | `TacticalAnimation.ts`, `PlayerVisualController.ts`, `SoldierRig.ts` | Idle und Kriechen als Loop, Aim gehalten, Kampfimpulse und Ausrüstung servergetaktet | Becken, Beine, Rumpf, Arme und Waffensockets | relativ | FUNCTIONAL FALLBACK |
| Supine Idle, Aim, Fire, Reload, Move, Switch, Stim | `TacticalAnimation.ts`, `PlayerVisualController.ts`, `SoldierRig.ts` | Idle und Bodenbewegung als Loop, Aim gehalten, Kampfimpulse und Ausrüstung servergetaktet | Becken, Beine, Rumpf, Arme und Waffensockets | relativ | FUNCTIONAL FALLBACK |
| Prone Get Up, Supine Get Up | `TacticalAnimation.ts`, `SoldierRig.ts` | One-Shot, 24 bzw. 30 Ticks bei Standardbalance | Becken, Rumpf, Knie, Füße, Arme | relativ | FUNCTIONAL FALLBACK |
| Treffer, Tod, Granate, Nahkampf | `CharacterAnimation.ts`, `PlayerVisualController.ts`, `SoldierRig.ts` | Trefferimpuls, Tod bis neue Lebens-ID, Aktionen im jeweiligen Spielfenster | Rumpf, Arme, Kopf, Beine | relativ | FUNCTIONAL FALLBACK |

## Produktionsclips

Für jede folgende ID gilt der Status **MISSING**. Daher sind Dateispeicherort, konkrete Dauer, tatsächliche Bone-Kanäle, Root Motion, Rig-Kompatibilität, Quelle und Lizenz des Clips offen. Loop und Taktung sind Anforderungen des Vertrags. Die Zieldaten brauchen die Humanoid-Rollen und den Waffenanker aus dem Asset-Vertrag. Aktuell ist kein Clip als **PRODUCTION READY** eingestuft. [Asset-Vertrag](CHARACTER_ASSET_REQUIREMENTS.md)

| Clip-ID | Layer | Art | Taktung | Verwendung | Fallback bei vorhandenem GLB |
| --- | --- | --- | --- | --- | --- |
| `idle` | base | Loop | Autorentempo | Stehen und gerichtete Fortbewegung | ohne Idle bleibt das prozedurale Rig aktiv |
| `walk` | base | Loop | Geschwindigkeitsabhängig | Stehen und gerichtete Fortbewegung | Run (Walk oder Run ist Pflicht) |
| `run` | base | Loop | Geschwindigkeitsabhängig | Stehen und gerichtete Fortbewegung | Walk (Walk oder Run ist Pflicht) |
| `sprint` | base | Loop | Geschwindigkeitsabhängig | Stehen und gerichtete Fortbewegung | Run, sonst Walk |
| `strafeLeft` | base | Loop | Geschwindigkeitsabhängig | Stehen und gerichtete Fortbewegung | Walk, sonst Run |
| `strafeRight` | base | Loop | Geschwindigkeitsabhängig | Stehen und gerichtete Fortbewegung | Walk, sonst Run |
| `backward` | base | Loop | Geschwindigkeitsabhängig | Stehen und gerichtete Fortbewegung | Walk, sonst Run |
| `crouchEnter` | base | One-Shot | Serverticks | Geduckte Haltung und Bewegung | prozedurales Rig für diesen Zustand |
| `crouchIdle` | base | Loop | Autorentempo | Geduckte Haltung und Bewegung | prozedurales Rig für diesen Zustand |
| `crouchWalk` | base | Loop | Geschwindigkeitsabhängig | Geduckte Haltung und Bewegung | prozedurales Rig für diesen Zustand |
| `crouchStrafeLeft` | base | Loop | Geschwindigkeitsabhängig | Geduckte Haltung und Bewegung | Crouch Walk, sonst prozedurales Rig für diesen Zustand |
| `crouchStrafeRight` | base | Loop | Geschwindigkeitsabhängig | Geduckte Haltung und Bewegung | Crouch Walk, sonst prozedurales Rig für diesen Zustand |
| `crouchAim` | upper | Loop | Autorentempo | Geduckte Haltung und Bewegung | GLB-Grundpose, Waffe und Magazin prozedural |
| `crouchFire` | upper | One-Shot | Autorentempo | Geduckte Haltung und Bewegung | GLB-Grundpose, Waffe und Magazin prozedural |
| `crouchReload` | upper | One-Shot | Serverticks | Waffe und Magazin | GLB-Grundpose, Waffe und Magazin prozedural |
| `crouchExit` | base | One-Shot | Serverticks | Geduckte Haltung und Bewegung | prozedurales Rig für diesen Zustand |
| `slideStart` | base | One-Shot | Serverticks | Rutschsequenz | prozedurales Rig für diesen Zustand |
| `slideLoop` | base | Loop | Serverticks | Rutschsequenz | prozedurales Rig für diesen Zustand |
| `slideEnd` | base | One-Shot | Serverticks | Rutschsequenz | prozedurales Rig für diesen Zustand |
| `diveForward` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveBackward` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveLeft` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveRight` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveForwardLeft` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveForwardRight` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveBackwardLeft` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `diveBackwardRight` | base | One-Shot | Serverticks | Richtung und Flugphase | prozedurales Rig für diesen Zustand |
| `proneEnter` | base | One-Shot | Serverticks | Bauchlage, Kriechen und Bodenkampf | Prone-Grundpose, sonst prozedurales Rig für diesen Zustand |
| `proneLand` | base | One-Shot | Serverticks | Bauchlage, Kriechen und Bodenkampf | Prone-Grundpose, sonst prozedurale Landung |
| `proneIdle` | base | Loop | Autorentempo | Bauchlage, Kriechen und Bodenkampf | prozedurales Rig für diesen Zustand |
| `proneAim` | base | Loop | Autorentempo | Bauchlage, Kriechen und Bodenkampf | prozedurales Rig für diesen Zustand |
| `proneFire` | upper | One-Shot | Autorentempo | Bauchlage, Kriechen und Bodenkampf | GLB-Grundpose, Waffe und Magazin prozedural |
| `proneCrawl` | base | Loop | Geschwindigkeitsabhängig | Bauchlage, Kriechen und Bodenkampf | prozedurales Rig für diesen Zustand |
| `proneReload` | upper | One-Shot | Serverticks | Waffe und Magazin | GLB-Grundpose, Waffe und Magazin prozedural |
| `proneStim` | upper | One-Shot | Serverticks | Stim-Geste | GLB-Grundpose, Waffe und Magazin prozedural |
| `proneSwitch` | upper | One-Shot | Serverticks | Wechsel zwischen Primär- und Sekundärwaffe | GLB-Grundpose, Waffe und Magazin prozedural |
| `supineEnter` | base | One-Shot | Serverticks | Rückenlage, Bodenbewegung und Kampf | Supine-Grundpose, sonst prozedurales Rig für diesen Zustand |
| `supineLand` | base | One-Shot | Serverticks | Rückenlage, Bodenbewegung und Kampf | Supine-Grundpose, sonst prozedurale Landung |
| `supineIdle` | base | Loop | Autorentempo | Rückenlage, Bodenbewegung und Kampf | prozedurales Rig für diesen Zustand |
| `supineAim` | base | Loop | Autorentempo | Rückenlage, Bodenbewegung und Kampf | prozedurales Rig für diesen Zustand |
| `supineFire` | upper | One-Shot | Autorentempo | Rückenlage, Bodenbewegung und Kampf | GLB-Grundpose, Waffe und Magazin prozedural |
| `supineMove` | base | Loop | Geschwindigkeitsabhängig | Rückenlage, Bodenbewegung und Kampf | prozedurales Rig für diesen Zustand |
| `supineReload` | upper | One-Shot | Serverticks | Waffe und Magazin | GLB-Grundpose, Waffe und Magazin prozedural |
| `supineStim` | upper | One-Shot | Serverticks | Stim-Geste | GLB-Grundpose, Waffe und Magazin prozedural |
| `supineSwitch` | upper | One-Shot | Serverticks | Wechsel zwischen Primär- und Sekundärwaffe | GLB-Grundpose, Waffe und Magazin prozedural |
| `proneGetUp` | base | One-Shot | Serverticks | Aufrichten aus der gespeicherten Ausgangshaltung | prozedurales Rig für diesen Zustand |
| `supineGetUp` | base | One-Shot | Serverticks | Aufrichten aus der gespeicherten Ausgangshaltung | prozedurales Rig für diesen Zustand |
| `reload` | upper | One-Shot | Serverticks | Waffe und Magazin | GLB-Grundpose, Waffe und Magazin prozedural |
| `reloadPistol` | upper | One-Shot | Serverticks | Waffe und Magazin | Reload (Gewehr), sonst GLB-Grundpose, Waffe und Magazin prozedural |
| `stim` | upper | One-Shot | Serverticks | Stim-Geste | GLB-Grundpose, Waffe wird prozedural gesenkt |
| `weaponSwitch` | upper | One-Shot | Serverticks | Wechsel zwischen Primär- und Sekundärwaffe | GLB-Grundpose, Waffe und Magazin prozedural |
| `aim` | base | Loop | Autorentempo | Zielen oder Schussimpuls | Idle mit prozeduraler Ziel- und Blickausrichtung |
| `fire` | upper | One-Shot | Autorentempo | Zielen oder Schussimpuls | prozeduraler Waffenrückstoß |
| `hit` | upper | One-Shot | Autorentempo | Trefferreaktion oder Tod | kein Treffer-Clip, nur Waffen-/Kamerareaktion |
| `death` | base | One-Shot | Autorentempo | Trefferreaktion oder Tod | Modell kippt als Ganzes |

[Charakteranimation](CHARACTER_ANIMATION.md) · [Higgsfield-Pilot](HIGGSFIELD_ASSET_PIPELINE.md)
