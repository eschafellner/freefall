# Architektur-Audit: Taktische Bewegung (Rutschen, Klettern, Überspringen)

Stand 2026-11-19. **Rutschen ist in Phase 2 umgesetzt.** Das Audit dokumentiert die Architektur und die offenen Arbeiten für **Überspringen** und **Klettern**.

Vorgaben aus der Abstimmung:

- Bewegungsbalance kommt später über **Rüstungen**. **Waffen beeinflussen die Bewegung nicht.**
- Charakteranimation langfristig über **hochwertige GLB-Clips**. Das prozedurale Rig bleibt Fallback. Die Hybrid-Animation ist mit diesem Audit umgesetzt (Abschnitt 4).

## 1. Zusammenfassung

| Bereich | Wiederverwendbar ohne Änderung | Muss erweitert werden |
| --- | --- | --- |
| Haltungs-Zustandsmaschine | Struktur, Zeitmodell (Start-/Endtick), Übergangsregeln, Vorhersage auf Client und Server, `SLIDING` mit eigener Bahn | neue Zustände `VAULTING`, `CLIMBING` mit eigener Bahn |
| Kollision | Kapselsweep `postureSweep`, `fitsPosture`, Bahnreservierung des Hechtsprungs | begehbare Oberseiten, Höhenabfrage, Fallen |
| Hitboxen | Haltungs-Kollider, Bodenhaltungs-Treffer | stehende Hitbox ignoriert `player.y` (Risiko R1) |
| Netzwerk | Eingabepuffer, Lebensnummer, `PostureState` im Snapshot, Remote-Interpolation mit `y` | neue Felder im `PostureState` (Start, Ziel, Höhe), neuer Befehl |
| Eingabe | Rebinding, Merge unvollständiger Belegungen | neue Aktion „Überwinden“ (Tastenkonflikt Leertaste, Frage F1) |
| Balance | Registry, Schema, Resolver mit Modifikator-Ebenen | neue Werte in `movement.json`; Rüstungs-Ebene für Tempo (Risiko R3) |
| Kamera | Höhe aus `lookHeight` und `y`, Kollision, Komfortoptionen | eigene Kamerakurven für Klettern |
| Waffenhandling | Freigaben pro Haltung (`actions`) | Einträge für die neuen Zustände |
| Animation | Hybrid-System (Abschnitt 4), Fallback, servergetaktete `slide*`-IDs | Clips für Überspringen und Klettern sowie deren Ableitung in `TacticalAnimation` |
| Gegner-KI | — | Schaben erreichen keine erhöhten Positionen (Frage F3) |

Der Hechtsprung ist die Vorlage für alle drei Bewegungsarten: Er ist bereits eine servergetaktete Bahnbewegung mit Vorbereitungsphase, Bogenhöhe, reservierter Bahn, Landehaltung und vorhersagbarem Ablauf. Rutschen und Überspringen lassen sich mit demselben Muster umsetzen. Klettern braucht zusätzlich begehbare Höhen, die das Spiel heute nicht kennt.

## 2. Bestehende Systeme

### 2.1 Bewegung und Locomotion

| Datei | Inhalt |
| --- | --- |
| `packages/shared/src/config/movement.ts` | `movePlayer` (aufrechter Gang, Sprint, Tether), `aimRay`, Kamerakonstanten |
| `packages/shared/src/config/posture.ts` | `PostureState`, `advancePosture` (Zeitfortschritt, Hechtsprungbahn, Aufstehen), `applyPostureInput` (Befehle, Bewegung je Haltung) |
| `packages/shared/src/config/postureGeometry.ts` | `postureSweep`, `fitsPosture`, Treffer gegen liegende und geduckte Körper, Mündung in Bodenhaltung |
| `packages/shared/src/config/worldGeometry.ts` | `moveOnGround` (Gegner, Convicts), Bodenlinie |
| `apps/server/src/simulation/Battlefield.ts` | `consumeMoves`: genau ein Bewegungsschritt je Eingabe, Rückstandsabbau, Lebensnummer |
| `apps/client/src/game/Prediction.ts` | Replay derselben Funktionen, Korrekturblending |

- Haltungen: `STANDING`, `CROUCHING`, `SLIDING`, `DIVING`, `PRONE`, `SUPINE`, `GETTING_UP` (Schlüssel von `movement.json › actions`).
- Befehle: `crouch`, `dive`, `stand` (`PostureCommand`). Ein Befehl wird nur einmal gesendet, der Server führt höchstens einen pro Tick aus.
- Zeit: Übergänge haben `started`/`until` in Simulationsticks. `postureProgress` liefert 0–1 für Animation und Kollider.
- Höhe: `p.y` ist nur während des Hechtsprungs über 0 (`diveArcHeight`). Jede andere Haltung steht auf `y = 0`. Die Welt hat keine begehbaren Erhebungen.

**Wiederverwendbar:** Zeitmodell, Befehlsweg, Bahnreservierung (`postureSweep` mit Hüllkörper), Vorhersage. Die Prediction übernimmt neue Zustände automatisch, wenn sie in `posture.ts` implementiert werden, weil Client und Server dieselbe Funktion ausführen.

### 2.2 Physik, Kollider und Hitboxen

- Spieler-Kollider pro Haltung in `movement.json › colliders` (Radius, halbe Länge, Höhe, Blick- und Mündungshöhe). Liegende Haltungen sind Kapseln entlang der Körperachse.
- Hindernisse sind achsparallele Quader mit `height` und optional `bottom` (`Obstacle` in `definitions/missions.ts`). In Bodenbruch: Barrieren 1,1–1,3 m, Container 2,6–2,7 m, Bunker 4–4,6 m, Felsen 8–10 m.
- Es gibt keine Schwerkraft, keinen Fallzustand und keine Standfläche auf Hindernissen. Bewegung schiebt nur seitlich (`postureSweep` mit Höhe `top`).
- Treffer (`apps/server/src/systems/combat.ts`): stehend als Zylinder **ab Boden** (`cylinderHit` prüft `0 ≤ y ≤ height`), geduckt und liegend über die Haltungsfunktionen mit `player.y`.

**Wiederverwendbar:** Sweep- und Passprüfung für Rutschen und Überspringen unverändert. **Erweitern:** Für Klettern eine Standhöhe pro Position (Oberseite eines Hindernisses) und eine Fall- bzw. Absprungregel.

### 2.3 Animation

Siehe Abschnitt 4 und [Charakteranimation](ANIMATION_SYSTEM.md). `TacticalAnimation` leitet Clip und Fortschritt allein aus dem replizierten `PostureState` ab. Neue Zustände brauchen dort je einen Zweig, keine zusätzlichen Netzwerkdaten.

### 2.4 Multiplayer

- Eingaben: `PlayerInput` mit `posture`-Befehl und Lebensnummer, validiert in `apps/server/src/networking/input.ts`.
- Snapshots: `players` mit 20 Hz trägt `y` und den vollständigen `PostureState`, sobald die Haltung vom ruhigen Stehen abweicht (`apps/server/src/networking/snapshots.ts`).
- Fremde Spieler: `RemoteInterpolation.ts` interpoliert Position, `y` und Haltung. Die Teleportschwelle berücksichtigt Sprint, Hechtsprung und den schnellsten Rutschschritt.
- Prediction: bitgenau für dieselbe Eingabefolge (Test in `movement-input.test.ts`).

**Erweitern:** Neue Bahnzustände müssen ihre Parameter (Start, Ziel, Höhe, Hindernis) im `PostureState` tragen, damit fremde Clients die Bewegung ohne eigene Weltabfrage darstellen. Die Teleportschwelle muss die schnellste neue Bewegung abdecken.

### 2.5 Eingabe und Tastenbelegung

`apps/client/src/input/Bindings.ts`, `DesktopInput.ts`, Doku [Input Rebinding](INPUT_REBINDING.md). Aktionen: Bewegen, Sprinten (Shift), Ducken (C), Hechtsprung (X), Aufstehen (Leertaste), Zielen, Feuern, Nachladen, Nahkampf, Granate, Stim, Waffen 1/2, Interagieren (E), Ballon (B). Unvollständige gespeicherte Belegungen werden zusammengeführt, neue Aktionen bekommen ihre Standardtaste, sofern sie frei ist.

### 2.6 Balance-Registry

- Daten: `packages/shared/src/balance/data/*.json`, Schema in `definitions.ts`, Auflösung in `resolver.ts` mit den Modifikator-Ebenen `equipment`, `difficulty` und `mission`.
- Bewegungstempo: `operators.json › walkSpeed/sprintSpeed`, Haltungsfaktoren in `movement.json`.
- Server übergibt `registry.operator` an `applyPostureInput`, die Client-Prediction nutzt den Standardwert `BALANCE.operator`.
- `weapons.json` enthält die reservierten Felder `walkSpeedMultiplier`/`sprintSpeedMultiplier` (nur Wert 1 zulässig).

### 2.7 Kamera und Waffenhandling

- `ThirdPersonCamera` folgt `lookHeight` der Haltung und `y` der Figur, kollidiert mit der Welt und respektiert Wackeln, Glättung und reduzierte Bewegung.
- Waffenfreigaben pro Haltung in `movement.json › actions` (Feuer, Zielen, Nachladen, Stim, Wechsel, Granate, Nahkampf, Nachschub). Taktischer Zielstrahl und Mündung in Bodenhaltung (`tacticalAimPitch/Yaw`, `tacticalMuzzle`).

## 3. Lückenanalyse der neuen Bewegungsarten

### 3.1 Rutschen (umgesetzt)

Der Duckbefehl startet im Stand bei gehaltenem Sprint, gültigem Anlauf und abgelaufenem Cooldown die Haltungsbahn. Details und Startwerte stehen in [Taktische Bewegung](TACTICAL_MOVEMENT.md).

| Baustein | Status |
| --- | --- |
| Auslöser | Bestehender `crouch`-Befehl, Sprint-Bit und gemessenes Mindesttempo |
| Bahn und Kollision | Servergetaktete Bahn mit abklingendem Tempo, `postureSweep` und Abbruch in `CROUCHING` |
| Kollider | `SLIDING` in `movement.json › colliders`, am Boden und niedriger als beim Ducken |
| Waffenfreigaben | `SLIDING` in `actions` entspricht `CROUCHING`, inklusive Feuer |
| Balance | Dauer, Strecke, Abklingfaktor, Cooldown und Mindesttempo als modifizierbare Operator-Werte |
| Animation | `slideStart`, `slideLoop`, `slideEnd` im Clip-Vertrag mit prozeduraler Rutschpose bei fehlendem Clip |
| Netzwerk | Bahnparameter, gültiger Anlauf und Cooldown im bestehenden `PostureState` |

### 3.2 Überspringen (Vault)

Vorschlag: Vor einem niedrigen Hindernis (Barrieren 1,1–1,3 m) mit Blick darauf startet ein servergetakteter Übersprung. Der Zustand `VAULTING` folgt einer festen Bahn über die Oberkante und landet auf der anderen Seite.

| Baustein | Status |
| --- | --- |
| Erkennung | neu: Hindernis in Blickrichtung, Höhe im erlaubten Bereich, Landefläche frei (`fitsPosture` am Ziel) |
| Bahn | neu: Bahn über die Kante; die Kollision mit genau diesem Hindernis ist während der Bahn ausgesetzt, alle anderen gelten weiter |
| Auslöser | neu: Befehl `vault` oder automatisch beim Sprint gegen die Kante (Frage F1) |
| Hitbox | Bahnhöhe erfordert `y` > 0, deshalb ist R1 hier relevant |
| Animation | neu: `vaultLow` (bis ca. 1,3 m), optional mit Seitenvariante |
| Netzwerk | Start-, Kanten- und Zielpunkt im `PostureState` |

Aufwand: mittel. Das Hindernismodell reicht aus, weil Barrieren schon Höhe und Ausdehnung haben.

### 3.3 Klettern

Vorschlag: Hochziehen auf Container (2,6–2,7 m) oder niedrige Bunker. Die Figur steht danach **auf** dem Hindernis.

| Baustein | Status |
| --- | --- |
| Standfläche | **fehlt**: Kein System kennt Stehen auf einer Oberseite. `y` ist außerhalb des Hechtsprungs immer 0 |
| Herunterkommen | **fehlt**: Fall- oder Absprungzustand, Landung, eventuell Fallschaden |
| Kollision | erweitern: Sweep muss Oberseiten als Boden behandeln, Kanten als Begrenzung |
| Hitboxen | **R1**: stehende Hitbox liegt immer am Boden |
| Gegner-Nahkampf | stehend wird nur der Abstand geprüft, nicht die Höhe |
| Gegner-KI | `GroundNavigation` und Steuerung sind rein 2D; Schaben kommen nicht hinauf (Frage F3) |
| Granaten | schon höhenbewusst (`player.y + height`) |
| Kamera | funktioniert mit `y`, braucht aber eine Kurve für das Hochziehen |
| Animation | neu: `climbLow` (Hochziehen ca. 1,5–2,7 m), `climbHigh` optional, `dropDown`, `fallLoop`, `land` |

Aufwand: hoch. Klettern ändert das Weltmodell von „flach mit Hindernissen“ auf „Ebenen mit Höhen“ und berührt Treffer, KI und Kamera.

### 3.4 Rüstungen statt Waffen als Bewegungsbalance

- Tempo und künftige Rutsch-, Kletter- und Sprungwerte sollten als Operator-Werte über die Modifikator-Ebene `equipment` aus einer Rüstungsdefinition laufen. Die Ebene existiert im Resolver bereits.
- Die reservierten Felder `walkSpeedMultiplier`/`sprintSpeedMultiplier` in `weapons.json` widersprechen der Vorgabe. Empfehlung: im Bewegungsmeilenstein aus Schema und Daten entfernen. Das ändert den Balance-Hash, die Simulation bleibt gleich.

## 4. Umgesetzt: Hybrid-Charakteranimation

Mit diesem Audit ist die Animationsgrundlage umgesetzt. Details: [Charakteranimation](ANIMATION_SYSTEM.md), Asset-Vertrag: [Character Asset Requirements](CHARACTER_ASSET_REQUIREMENTS.md).

| Baustein | Datei |
| --- | --- |
| Humanoid-Rollen, Presets (FREEFALL, Mixamo, Unreal), Oberkörpermaske | `apps/client/src/rendering/characters/animation/HumanoidSkeleton.ts` |
| Clip-Vertrag: Gruppe, Ebene, Taktung, Priorität, Fallback | `…/animation/ClipLibrary.ts` |
| Retargeting zwischen Skeletten | `…/animation/Retargeting.ts` |
| Zusammenstellung aus Modell und Animationspaketen | `…/animation/CharacterClipSet.ts` |
| Blick, Zielausrichtung, Rückstoß, Foot IK | `…/animation/SkeletonOverlay.ts` |
| Basis- und Oberkörperebene, Überblendungen | `apps/client/src/rendering/characters/CharacterClipPlayer.ts` |
| Offline-Prüfung angelieferter GLBs | `scripts/check-character-asset.ts` (`npm run assets:check`) |

Weil kein Soldaten-GLB registriert ist, läuft im Spiel das prozedurale Rig.

## 5. Risiken

| Nr. | Risiko | Betrifft | Gegenmaßnahme |
| --- | --- | --- | --- |
| R1 | Stehende Hitbox ignoriert `player.y` | Überspringen, Klettern | `operatorHit`/`cylinderHit` auf `player.y` umstellen, Treffertests mit erhöhter Figur |
| R2 | Bitgenaue Prediction | alle | Neue Bahnen ausschließlich in `posture.ts`, Weltabfragen deterministisch, Replay-Test wie für den Hechtsprung |
| R3 | Prediction nutzt Standardtempo | Rüstungen | Effektive Operator-Werte (oder Rüstungs-ID) replizieren und an `Prediction` übergeben, sonst Dauerkorrekturen |
| R4 | Golden Traces | alle | Ändern sich nur, wenn der Trace-Treiber die neuen Befehle nutzt; sonst bitgleich |
| R5 | Teleportschwelle der Remote-Interpolation | Rutschen | Umgesetzt und getestet. Schwelle berücksichtigt das schnellste Bahntempo. |
| R6 | Gegner erreichen erhöhte Spieler nicht | Klettern | Designentscheidung (F3) vor der Umsetzung |
| R7 | Clips und Gameplay-Bahn laufen auseinander | alle | Bahnzustände sind servergetaktet; Clips werden über `postureProgress` gestellt, nicht frei abgespielt |
| R8 | Tastenkonflikt Leertaste | Überspringen, Klettern | F1 |

## 6. Empfohlene Reihenfolge

1. **Rutschen** (umgesetzt), nach dem Tick-Muster des Hechtsprungs.
2. **Überspringen**: Hindernisabfrage und Bahn, zusammen mit R1.
3. **Klettern**: erst nach den Entscheidungen F2 und F3, weil es das Weltmodell erweitert.
4. Rüstungen als eigener Balance-Meilenstein, inklusive R3.

## 7. Offene Fragen

- **F1 Eingabe:** Eigene Taste „Überwinden“ oder Leertaste kontextabhängig (Aufstehen am Boden, Überspringen und Klettern im Stand)? Automatisches Überspringen beim Sprint gegen eine Barriere?
- **F2 Klettern:** Nur Container, oder auch Bunker? Dürfen Operator auf Hindernissen stehen und von dort kämpfen, oder ist Klettern nur ein Überwinden ohne Verweilen?
- **F3 Gegner:** Sollen Schaben erhöhte Operator erreichen (Klettern, Springen), oder ist eine erhöhte Position bewusst ein taktischer Vorteil?
