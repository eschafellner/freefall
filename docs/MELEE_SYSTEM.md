# Nahkampf

Schneller Waffenstoß (Kolbenschlag) gegen ein einzelnes Ziel vor dem Operator. Server-autoritativ, Taste **V** (`BINDINGS.melee` in `input/DesktopInput.ts`, als `KeyboardEvent.code` umstellbar).

## Werte (`equipment.json › melee[0]`, `melee.weapon_strike`)

| Wert | Ausgang | Ticks (30 Hz) |
| --- | ---: | ---: |
| `damage` | 50 | – |
| `range` (bis zur Trefferkante des Ziels) | 2 m | – |
| `arcDegrees` (Trefferkegel vorne) | 80° | cos 40° = 0,766 |
| `windupSeconds` (Trefferzeitpunkt) | 0,14 s | 4 |
| `actionSeconds` (Aktion gesamt) | 0,42 s | 13 |
| `cooldownSeconds` | 0,8 s | 24 |
| `staggerSeconds` | 0,4 s | 12 |
| `staggerImmunitySeconds` | 0,8 s | 24 |
| `knockbackDistance` | 1,1 m | – |

## Ablauf

1. `V` sendet `equipment: 'melee'` mit `life`. Der Server startet die Aktion nur, wenn keine andere Aktion läuft und der Cooldown abgelaufen ist (`equipment.meleeReadyAt`). Ein laufender Reload wird unterbrochen.
2. Am Impact-Tick (`started + windupTicks`) löst `meleeStrike` den Treffer auf:
   - Kandidaten: Gegner aus dem Uniform Grid (nur Zellen im Umkreis Reichweite + 1,2 m), Operator und Convicts.
   - Bedingungen: Kante innerhalb der Reichweite, Richtung im Kegel um die Blickrichtung, freie Bodenlinie (`clearGroundLine`, keine Treffer durch Wände).
   - Auswahl: ein primäres Ziel mit der besten Bewertung (Abstand + Abweichung vom Blick). Kein Flächenschaden.
3. Schaden läuft über den zentralen Resolver (`melee`). Verbündete Operator und Convicts erhalten 30 % ([Friendly Fire](FRIENDLY_FIRE.md)).
4. Überlebt ein Gegner, wird er gestaggert (falls nicht immun).

## Stagger und Knockback

- Gespeichert in `ecs/StaggerComponent.ts` (eigene Arrays pro Horden-Slot). Der genehmigte `HordeManager` der Schabe bleibt unverändert; ein Eintrag gilt nur, solange der Slot dieselbe Gegner-ID trägt.
- Während des Stagger: keine Lenkung (`steeringSystem`), keine Angriffe (`meleeSystem`), `attackAt` wird auf das Stagger-Ende geschoben (unterbricht die laufende Angriffsaktion).
- Knockback: Startgeschwindigkeit `v0 = 2 · d · 30 / T`, linear auf 0 bis zum Stagger-Ende. Der Schlag wird nach der Bewegung seines Ticks aufgelöst, der Gegner bewegt sich also in T − 1 Ticks. Die zurückgelegte Strecke ist ohne Hindernis genau `knockbackDistance` (vorher `d · T / (T + 1)`, bei T = 12 also 1,015 m statt 1,1 m). Ein Stagger von einem Tick hat keinen Knockback. Im End-Tick bewegt sich der Gegner bereits wieder mit seiner Steuerung, ohne zusätzlichen Stillstand. Bewegung über `moveOnGround` mit Kollision: kein Durchschieben durch Wände, keine Teleports. Positionen laufen über den normalen Horden-Snapshot, keine zusätzlichen Netzwerkdaten.
- Kein Stunlock: Nach dem Stagger ist derselbe Gegner `staggerImmunitySeconds` lang immun. Ein Stagger endet garantiert nach `staggerTicks`.

Wichtig für den Playtest: Die Schabe hat 48 HP. Ein Nahkampftreffer mit 50 Schaden tötet sie sofort, Stagger und Knockback werden bei Schaben deshalb derzeit nicht sichtbar. Sie greifen bei angeschlagenen Gegnern mit mehr als 50 Rest-HP und bei künftigen schwereren Gegnertypen.

## Aktionspriorität

| Laufend ↓ / Eingabe → | Feuer | R | V | G | H | 1/2 | Sprint | E (Nachschub) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| nichts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reload | gesperrt | ignoriert | bricht ab, startet | bricht ab, startet | gesperrt | bricht ab, startet | läuft weiter | gesperrt |
| Nahkampf | gesperrt | gesperrt | Cooldown | ignoriert | ignoriert | ignoriert | ✓ | ignoriert |
| Granate | gesperrt | gesperrt | ignoriert | ignoriert | ignoriert | ignoriert | ✓ | ignoriert |
| Waffenwechsel | gesperrt | gesperrt | ignoriert | ignoriert | ignoriert | ignoriert | ✓ | ignoriert |
| Heilstim | bricht ab | bricht ab | bricht ab | ignoriert | ignoriert | bricht ab | bricht ab | ignoriert |
| Nachschub | bricht ab | bricht ab | bricht ab | bricht ab | bricht ab | bricht ab | bricht ab | ignoriert |

Umgesetzt in `systems/equipment.ts` (Kommentar am Dateianfang). Tod bricht alles ab.

## Animation und Darstellung

- Prozeduraler Fallback (kein Animationsclip vorhanden): kurzes Ausholen bis zum Impact-Tick, dann Stoß der Waffe nach vorne und oben, Oberkörper lehnt hinein (`CharacterAnimation.melee`, `SoldierRig.pose`, `PlayerVisualController.poseImported`). Der Höhepunkt liegt exakt auf dem Server-Impact-Tick (`windupTicks / actionTicks`).
- Fehlendes Asset: ein Clip `melee` (0,42 s, Treffer bei 0,14 s) für das Soldaten-GLB. `CharacterClip` kann um `melee` erweitert werden, sobald er existiert.
- Stagger-Feedback beim Gegner: Die bestehende Trefferreaktion von `EnemyVisualLOD` wird für die Stagger-Dauer gehalten (`ArenaView.stagger`). Das Schabe-Design und seine Dateien sind unverändert.
- HUD: `V Kolbenstoß` mit Restcooldown, Aktionsbalken während des Stoßes. Audio: Luftzug und bei Treffer ein dumpfer Aufprall.

## Netzwerk

`combat`-Event `melee` mit Angreifer, Position, Blickrichtung, Gegner-ID oder `ally`, Schaden, `staggered`, `eliminated`. Der Client berechnet keinen Nahkampfschaden.

## Tests

`combat.test.ts` Abschnitt 15.4, Friendly Fire in 15.5, gleichzeitiger Nahkampf von vier Operatoren in 15.7.
