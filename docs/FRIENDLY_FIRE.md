# Reduziertes Friendly Fire

Friendly Fire ist aktiv. Operator verletzen verbündete Operator und Convicts mit Waffen, Granaten und Nahkampf, aber mit reduziertem Schaden.

## Konfiguration (`combat.json › damagePolicy`)

| Feld | Wert | Bedeutung |
| --- | ---: | --- |
| `operatorToOperator` | 0,3 | Operator → anderer Operator |
| `selfDamage` | 0,3 | eigene Granate → eigener Operator |
| `operatorToConvict` | 0,3 | Operator → verbündeter Convict (Panzerung des Convicts wirkt danach) |
| `explosionsDamageOperators` | `true` | Schalter für Explosionsschaden an Operatoren |

Trefferkörper für Hitscan und Nahkampf gegen Verbündete: `operatorHitbox` (Zylinder, Radius 0,42 m, Höhe 1,85 m).

## Zentraler Damage Resolver (`apps/server/src/systems/damage.ts`)

Alle spielerverursachten Treffer laufen durch `resolveDamage`. Reihenfolge, jeder Schritt höchstens einmal:

1. Basisschaden: Waffenschaden, Nahkampfschaden oder Granatenschaden nach Distanzabfall.
2. Zieltyp: Strukturmultiplikator nur für Explosionen gegen Strukturen.
3. Relationsmultiplikator aus `damagePolicy` (feindlich 1, verbündet, selbst). Aufrufer skalieren nie selbst.
4. Rundung: Operator, Convicts und Strukturen erhalten ganze Trefferpunkte (mindestens 1, wenn > 0). Gegner behalten Bruchwerte.
5. Zielseite: Convict-Panzerung, Respawn- und Landeschutz.

| Angreifer → Ziel | Relation | Faktor |
| --- | --- | ---: |
| Operator → Gegner | feindlich | 1 |
| Operator → Nest (Struktur) | feindlich | 1 (Explosion × 2,0) |
| Operator → Operator | verbündet | 0,3 |
| Operator → sich selbst | selbst | 0,3 |
| Operator → Convict | verbündet | 0,3 |
| Gegner → Operator / Convict / Albatross | feindlich | 1 (gegnerischer Nahkampf, Schwierigkeit bereits in `MissionBalance` aufgelöst) |

Beispiel: Explosion mit 100 Schaden trifft einen Mitspieler → 30. Rifle-Treffer am Mitspieler: 24 × 0,3 = 7,2 → 7. Pistole: 21,6 × 0,3 → 6. Nahkampf: 50 × 0,3 = 15.

## Treffererkennung

- Hitscan: Verbündete Operator und Convicts blockieren den Schuss wie Gegner (nächster Treffer gewinnt). Der Schütze selbst und alles hinter der Kamera sind ausgenommen.
- Granaten: jeder Operator und Convict im Radius mit freier Bodenlinie.
- Nahkampf: Verbündete sind normale Kandidaten im Trefferkegel; der Nahkampf trifft das beste einzelne Ziel.

## Rückmeldung

- Eigener Treffer an einem Verbündeten: Fadenkreuz kurz blau und verkleinert (statt des orangen Treffermarkers), Zeile „Eigenbeschuss · OP 02“ für 1,6 s.
- Von einem Verbündeten getroffen: „Getroffen von OP 03“ und die normale Treffer-Vignette.
- Keine Warnfenster. Bei geöffneter Telemetrie (F2) werden `friendly-fire`-Events in der Konsole protokolliert.
- Telemetrie: `friendlyFireDamage.bullet|explosion|melee`, `selfDamage`, `convictFriendlyDamage`.

## Netzwerk

`ShotEvent.ally`, `combat`-Event `friendly-fire` (Angreifer, Ziel, tatsächlich abgezogener Schaden, Quelle, `self`). Der Multiplikator wird nur auf dem Server angewendet; der Client sendet keine Schadenswerte.

## Tests

`combat.test.ts` Abschnitt 15.5 (Resolver-Reihenfolge, Einmal-Anwendung, Rifle und Nahkampf am Mitspieler) und Granaten-Friendly-Fire in 15.3.
