# Character Asset Requirements

Dieses Dokument legt fest, welche Charakter-, Rig- und Animationsdateien FREEFALL für die Hybrid-Animation braucht. **Im Repository liegen derzeit keine Soldaten- oder Animations-GLBs.** Alle hier genannten Clips fehlen, im Spiel läuft das prozedurale Rig. Es wurden bewusst keine Platzhalter-Clips erstellt.

Der maschinenlesbare Vertrag ist `apps/client/src/rendering/characters/animation/ClipLibrary.ts`. Angelieferte Dateien prüft:

```bash
npm run assets:check -- pfad/soldier.glb [pfad/animationen.glb ...] [--skeleton mixamo] [--clip reload=Rifle_Reload]
```

Das Skript liest nur das glTF-JSON. Es meldet das erkannte Skelett-Preset, fehlende Humanoid-Rollen, den `PrimaryWeapon`-Knoten, vorhandene und fehlende Vertragsclips samt Fallback sowie nicht zugeordnete Clips. Bei verfehlter Mindestanforderung endet es mit Exit-Code 1.

## 1. Charaktermodell

| Anforderung | Wert |
| --- | --- |
| Format | GLB (glTF 2.0), Texturen eingebettet oder KTX2 mit registriertem Transcoder |
| Maßstab und Achsen | Meter, +Y oben, −Z vorwärts, +X rechts, Füße am Ursprung, Skalierung vor dem Export angewendet |
| Rig | Ein geskinntes Humanoid-Skelett mit eindeutigen Knochennamen, Bind-Pose als Ruhepose der Knoten |
| Pflichtrollen | hips, spine, chest, neck, head, linker und rechter Ober-/Unterarm und Hand, linkes und rechtes Ober-/Unterbein und Fuß |
| Empfohlen | upperChest, Schultern (Clavicle), Zehen, Finger (für Griff und Magazin) |
| Waffenanker | Knoten `PrimaryWeapon` an der Waffenhand, Ursprung am Griff, lokale Gewehrausrichtung. Andere Namen über `equipmentNodes.PrimaryWeapon` |
| Ausrüstungsanker (optional) | `Helmet`, `Torso`, `Arms`, `Legs`, `Backpack`, `SecondaryWeapon` oder Zuordnung über `equipmentNodes` |
| Deformation | Schulter und Hüfte für Bauch- und Rückenlage sowie Hechtsprung ausgelegt, rüstungstaugliche Gewichtung |
| Budget | Richtwert ≤ 25.000 Dreiecke pro Operator, ≤ 80 Knochen, 4 Einflüsse pro Vertex |

Unterstützte Benennungen (automatisch erkannt): **FREEFALL** (`Hips`, `Spine`, `Chest`, `UpperChest`, `Neck`, `Head`, `LeftUpperArm` …), **Mixamo** (`mixamorig:Hips` …) und **Unreal** (`pelvis`, `spine_01` …). Andere Rigs ordnen ihre Knochen über `skeleton.bones` in der Registry zu.

## 2. Animationen

Alle Clips **in place**: keine horizontale Root Motion. Die Weltposition kommt ausschließlich vom Server. Vertikale Bewegung des Beckens ist erlaubt. Clips eines anderen Skeletts werden beim Laden retargeted (Abschnitt 3).

Taktung:

- **free**: läuft in Autorentempo.
- **speed**: Abspieltempo folgt der Bodengeschwindigkeit. Das Autorentempo in m/s gehört in `clipSpeeds`.
- **server**: Clipzeit = Serverfortschritt 0–1. Die Clipdauer ist frei, entscheidend sind die **Anteile** der Schlüsselmomente.

Ebene:

- **base**: ganzer Körper.
- **upper**: Oberkörper über der laufenden Basis. Nur Knochen ab `spine` aufwärts zählen, Beine und Becken werden ignoriert.

### 2.1 Mindestumfang (ohne ihn bleibt das prozedurale Rig aktiv)

| ID | Ebene | Taktung | Hinweise |
| --- | --- | --- | --- |
| `idle` | base | free | Gewehr im Anschlag (Low Ready), Loop |
| `walk` oder `run` | base | speed | Loop. Spieltempo Gehen 5,8 m/s, Sprint 9,2 m/s. `walk` ≈ 2–3 m/s für Interpolation und Bremsen |

### 2.2 Kernumfang

| Gruppe | IDs | Taktung | Ziel-Timing aus dem Spiel |
| --- | --- | --- | --- |
| Locomotion | `sprint`, `strafeLeft`, `strafeRight`, `backward` | speed | Sprint 9,2 m/s, Strafe und Rückwärts mit Waffe im Anschlag |
| Ducken | `crouchEnter`, `crouchExit` | server | Übergang 0,20 s |
| | `crouchIdle`, `crouchWalk`, `crouchStrafeLeft`, `crouchStrafeRight` | free / speed | geduckt 55 % des Gehtempos (3,2 m/s) |
| | `crouchAim`, `crouchFire`, `crouchReload` | free / free / server | Oberkörper in Hocke über dem Körperclip |
| Rutschen | `slideStart`, `slideLoop`, `slideEnd` | server | 0–20 % absenken, 20–80 % tiefe Rutschpose, 80–100 % in die Hocke übergehen. Eine freie Bahn dauert 0,60 s (18 Ticks) und bleibt am Boden. Bei Kollision wechselt die Figur sofort in die Hocke. |
| Hechtsprung | `diveForward`, `diveBackward`, `diveLeft`, `diveRight` | server | 0,75 s (23 Ticks), Vorbereitung 0,09 s (≈ 12 %), Flugbogen 0,62 m, 5 m Strecke. Vorwärts und seitlich landen in Bauchlage, rückwärts in Rückenlage |
| Bauchlage | `proneIdle`, `proneAim`, `proneCrawl` | free / free / speed | Kriechen 25 % des Gehtempos (1,45 m/s) |
| | `proneEnter`, `proneLand` | server | kurze Bodenpose beim Einstieg und fünf Ticks ab Dive-Landung |
| | `proneReload`, `proneStim`, `proneSwitch` | server | Oberkörper über der Grundpose, Reload wie Gewehr, Stim 1,2 s |
| Rückenlage | `supineIdle`, `supineAim`, `supineMove` | free / free / speed | Bewegung 20 % des Gehtempos (1,16 m/s) |
| | `supineEnter`, `supineLand` | server | kurze Bodenpose beim Einstieg und fünf Ticks ab Dive-Landung |
| | `supineReload`, `supineStim`, `supineSwitch` | server | Oberkörper über der Grundpose |
| Aufstehen | `proneGetUp`, `supineGetUp` | server | 0,8 s aus Bauchlage, 1,0 s aus Rückenlage |
| Nachladen | `reload` | server, upper | Gewehr 2,1 s: Magazin raus bei 20 %, neues Magazin sitzt bei 72 %. Die Magazinbewegung bleibt prozedural an der Waffe; die Hand muss zu diesen Anteilen am Magazinschacht sein |
| Heilstim | `stim` | server, upper | 1,2 s, Injektion auf ca. 50 %. Waffe gesenkt, Beine aus der Basis |
| Waffenwechsel | `weaponSwitch` | server, upper | Übergabe der sichtbaren Waffe zur Mitte des Wechsels |

### 2.3 Optional

| IDs | Hinweise |
| --- | --- |
| `diveForwardLeft`, `diveForwardRight`, `diveBackwardLeft`, `diveBackwardRight` | Prozedurale Pose für die tatsächliche Richtung als Fallback |
| `reloadPistol` | P-01, 1,45 s: raus bei 18 %, sitzt bei 68 %. Fallback auf `reload` |
| `proneFire`, `supineFire` | kurzer Schussimpuls am Boden |
| `aim` | Stand-Anschlag. Fallback: Idle mit prozeduraler Zielausrichtung |
| `fire` | Oberkörperimpuls pro Schuss, Fallback prozeduraler Rückstoß |
| `hit`, `death` | Trefferreaktion (upper) und Tod (base) |

### 2.4 Geplant, noch ohne Gameplay (siehe [Audit](TACTICAL_MOVEMENT_AUDIT.md))

Für die späteren Bewegungszustände sind servergetaktete Clips vorgesehen. Geplant sind `vaultLow` für Barrieren von 1,1 bis 1,3 m, `climbLow` für Container von ca. 2,7 m sowie optional `climbHigh`, `dropDown`, `fallLoop` und `land`.

### 2.5 Benennung

Clipnamen im GLB entsprechen standardmäßig den IDs (Groß-/Kleinschreibung egal, z. B. `ProneReload`). Abweichende Namen ordnet `clips` in der Registry zu:

```ts
// apps/client/src/rendering/AssetRegistry.ts
ASSETS.soldier = {
  path: 'characters/soldier/models/operator.glb',
  skeleton: { preset: 'freefall' },
  animationPaths: ['characters/soldier/animations/core.glb'],            // gleiches Skelett
  animationPacks: [{ path: 'characters/soldier/animations/library.glb', skeleton: { preset: 'mixamo' } }], // wird retargeted
  clips: { reload: 'Rifle_Reload_Standing' },
  clipSpeeds: { walk: 2.4, run: 5.8, sprint: 9.2, crouchWalk: 3.2, proneCrawl: 1.45, supineMove: 1.16 },
  footIK: false,
};
```

## 3. Retargeting

Animationspakete mit anderem Skelett werden beim Laden einmal auf den Charakter übertragen. Übertragen wird die Drehung jedes Humanoid-Knochens relativ zu seiner Ruhepose im Wurzelraum. Nur die Hüfte verschiebt sich, skaliert mit dem Verhältnis der Hüfthöhen; alle anderen Knochen behalten die Proportionen des Charakters.

Voraussetzungen:

- Beide Rigs folgen der Achsenkonvention aus Abschnitt 1 und haben einheitliche Skalierung.
- Die Ruhepose der Knoten ist eine neutrale Standpose (T- oder A-Pose). Unterschiedliche Ruheposen zwischen den Rigs sind erlaubt.
- Alle Pflichtrollen sind auf beiden Seiten zugeordnet. Sonst wird das Paket ohne Retargeting übernommen und funktioniert nur bei gleichen Knochennamen; das Log meldet das.

Grenzen: Finger, Twist-Knochen und Requisiten ohne Rolle werden nicht übertragen. Handkontakt am Gewehr hängt von den Proportionen ab und muss pro Charakter geprüft werden; dafür ist eine Hand-IK am Waffengriff der nächste Ausbauschritt.

## 4. Abnahme pro Lieferung

1. `npm run assets:check` ohne Fehler, Mindestanforderung erfüllt.
2. Im Spiel mit F2-Telemetrie: Locomotion bei 0–9,2 m/s ohne Fußgleiten (`clipSpeeds` prüfen).
3. Haltungswechsel, Rutschen, Hechtsprünge in acht Richtungen und Aufstehen mit den Kollidern aus der F2-Anzeige abgleichen.
4. Nachladen im Stand, im Gehen und geduckt: Hand trifft Magazin zu den Anteilen aus Abschnitt 2.2.
5. Vier Clients: identische Darstellung fremder Operator.
6. Quelle, Urheber, Lizenz und Attribution im Repository erfassen ([Charakter](CHARACTER_SYSTEM.md#glb-und-gltf)).
