# Kaliber, Munition und Panzerklassen

Seit Release `8.0A` (Schema 3) leitet sich der Waffenschaden aus dem **Kaliber** ab. Kaliber, Munitionssorten und Panzerklassen liegen in `packages/shared/src/balance/data/ammunition.json`. Die bestehenden Waffen sind unverändert: Kestrel AR-01 macht weiterhin 24, die P-01 21,6 Schaden; die Golden Traces sind identisch. [Balance-Architektur](BALANCE_ARCHITECTURE.md) · [Workflow](BALANCE_WORKFLOW.md) · [Friendly Fire](FRIENDLY_FIRE.md)

## Grundsätze

- **Hitscan bleibt.** Die Mündungsgeschwindigkeit erzeugt keine Flugzeit. Sie skaliert die Distanzen des Schadensabfalls und steht für Darstellung (Leuchtspur, Überschallknall) bereit.
- **Drei Ebenen:** Kaliber (Ballistik) → Munitionssorte (gehört zu genau einem Kaliber) → Waffe (Feuerrate, Rückstoß, Streuung, Lauf). Feuerrate und Rückstoß bleiben Werte der Waffe; Munition darf sie über Modifikatoren verändern.
- **Reserven je Waffe.** Magazine und Nachschub bleiben wie bisher pro Waffenslot. Die geladene Munitionssorte ist Teil des effektiven Loadouts.
- **Panzerung als Schwelle.** Panzerklasse und Durchschlag nutzen dieselbe Skala 1 … 7.

## Panzerklassen und Durchschlag

Ein Treffer **durchschlägt**, wenn `Durchschlag ≥ Panzerklasse`. Dann wirkt der volle Schaden. Sonst wirkt nur der Restschaden `armor.nonPenetratingDamageFraction` = **10 %** (stumpfe Wirkung).

| Stufe | Panzerklasse | Durchschlag |
| ---: | --- | --- |
| 1 | Ungepanzert (Schabe) | Minimal (jedes Geschoss) |
| 2 | Leicht gepanzert | Niedrig |
| 3 | Mittel gepanzert | Mittel |
| 4 | Schwer gepanzert | Hoch |
| 5 | Sehr schwer gepanzert | Sehr hoch |
| 6 | Extrem gepanzert | Extrem |
| 7 | Festungspanzerung | Anti-Material |

Wer welche Werte trägt:

| Quelle / Ziel | Feld | Wert 8.0A |
| --- | --- | ---: |
| Schabe | `enemies.json › archetypes[].armorClass` | 1 |
| Schwarmnest | `structures.json › nests[].armorClass` | 1 |
| Kolbenstoß (Nahkampf) | `equipment.json › melee[].penetration` | 1 |
| Sprenggranate | `equipment.json › grenades[].penetration` | 4 |
| Convict-Schüsse | `convicts.json › squad.penetration` | 3 |
| Waffen | Kaliber `penetration`, ± Munition | siehe unten |

Operatoren und Convicts haben noch keine Panzerklasse; Friendly Fire läuft unverändert über die Damage Policy. Panzerung pro Trefferzone (z. B. gepanzerter Rücken, weicher Bauch) ist vorgesehen, aber noch nicht umgesetzt.

## Kaliber (`ammunition.json › calibers`)

| Kaliber | ID | Familie | Schaden | Projektile | v₀ (m/s) | Durchschlag | Abfall Start → Ende (Minimum) |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 10 mm | `caliber.10mm` | Pistole/SMG | 21,6 | 1 | 360 | 2 Niedrig | 48 → 90 m (60 %) |
| .55 | `caliber.55` | Pistole/SMG | 32 | 1 | 260 | 2 Niedrig | 30 → 70 m (50 %) |
| 5,55 × 39 mm | `caliber.5-55x39` | Gewehr | 24 | 1 | 900 | 3 Mittel | 80 → 160 m (65 %) |
| 7,77 × 50 mm | `caliber.7-77x50` | Gewehr (schwer/DMR) | 38 | 1 | 820 | 4 Hoch | 110 → 220 m (70 %) |
| 8,88 × 55 mm | `caliber.8-88x55` | Gewehr (Scharfschütze) | 85 | 1 | 950 | 5 Sehr hoch | 250 → 500 m (80 %) |
| Kaliber 13 | `caliber.13g` | Schrotflinte | 12 je Kugel | 8 | 400 | 2 Niedrig | 12 → 35 m (20 %) |
| Kaliber 21 | `caliber.21g` | Schrotflinte (taktisch) | 11 je Kugel | 6 | 420 | 1 Minimal | 14 → 38 m (25 %) |

Nur 10 mm und 5,55 werden heute verwendet. Die übrigen Werte sind **Startwerte für spätere Waffen** und noch nicht gebalanct. Der Schadensabfall beginnt bei beiden verwendeten Kalibern jenseits der aktuellen `effectiveRange` (44 m / 72 m), ist also in 8.0A neutral. `effectiveRange` der Waffe bleibt die harte Reichweitengrenze.

Schrot (`projectilesPerShot > 1`): Seit 8.1A ist jede Schrotkugel ein eigener Hitscan-Strahl im Kegel `pelletSpreadDegrees` (13 G: 2,6°, 21 G: 2,2°) um die bereits gestreute Zielrichtung, mit eigenem Schaden, Abfall und Durchschlag. Erste Waffe: VX-13 Cerberus ([LOADOUT_SYSTEM](LOADOUT_SYSTEM.md)).

## Munitionssorten (`ammunition.json › ammunition`)

Jede Sorte gehört zu einem Kaliber und hat `displayName`, `shortName` (HUD), `damageType` (`kinetic` oder `explosive`) und eine Liste `modifiers`. Heute gibt es je Kaliber eine Standardsorte ohne Modifikatoren (Vollmantel „VM“, bei Schrot „SCH“).

Modifikatoren wirken auf der Ebene `ammunition` des Stat-Resolvers, **vor** Ausrüstung/Attachments. Erlaubte Werte (`AMMO_MODIFIABLE_STATS`): `damage`, `penetration`, `muzzleVelocity`, `roundsPerSecond`, `recoilPitch`, `recoilYaw`, `spreadHip`, `spreadAim`, `pelletSpread`. Durchschlag wird nur in ganzen Stufen verschoben (`add`, ganze Zahl). Beispiel Teilmantel für später:

```json
{ "id": "ammo.5-55x39.sp", "caliberId": "caliber.5-55x39", "displayName": "Teilmantel", "shortName": "TM",
  "damageType": "kinetic",
  "modifiers": [
    { "stat": "damage", "operation": "multiply", "value": 1.15 },
    { "stat": "penetration", "operation": "add", "value": -1 }
  ] }
```

Der Trace zeigt die Herkunft, z. B. `weapon.kestrel-ar-01.damage: 24 → 27.6 [× 1.15 (ammo:ammo.5-55x39.sp)]`.

## Waffe (`weapons.json`)

Neu je Waffe: `caliberId`, `defaultAmmoId` (muss zum Kaliber gehören) und `ballistics`:

- `damageMultiplier`: Schaden je Projektil = Kaliber × Faktor.
- `velocityMultiplier`: v₀ = Kaliber × Faktor. Die Abfalldistanzen skalieren mit v₀ / Kaliber-v₀ (längerer Lauf, mehr Reichweite).

Das Feld `damage` gibt es in `weapons.json` nicht mehr. Der effektive Wert steht weiterhin als `EffectiveWeapon.damage` bereit, die Projektilwerte unter `EffectiveWeapon.projectile` (`penetration`, `muzzleVelocity`, `damageType`, `falloff`, `projectilesPerShot`).

Munitionswahl: `resolveSelection(registry, selection, modifiers, armorModifiers, { primary: 'ammo…' })`. Ohne Eintrag wird `defaultAmmoId` geladen. Die Auswahl der Sorte im Carrier folgt mit der ersten zweiten Munitionssorte.

## Schadensberechnung

`apps/server/src/systems/damage.ts`, jeder Schritt höchstens einmal:

1. Basisschaden (Kaliber × Waffe × Munition × Ausrüstung; Nahkampf; Granate nach Explosionsabfall)
2. Distanzabfall von Kugeln (Mündung → Treffpunkt)
3. Strukturmultiplikator (Explosion gegen Struktur)
4. Panzerung: Durchschlag ≥ Panzerklasse → 100 %, sonst 10 %
5. Resistenz des Ziels gegen die Schadensart (`enemies.json › resistances.kinetic|explosive`, heute 1)
6. Relationsmultiplikator (Friendly Fire)
7. Rundung (Gegner behalten Bruchwerte)
8. Zielseite (Convict-Flachpanzerung, Schutzzeiten)

Die Regeln für Durchschlag und Abfall liegen gemeinsam für Server und Client in `packages/shared/src/combat/ballistics.ts` (`penetrates`, `armorMultiplier`, `falloffMultiplier`). Gegner-Panzerung je Wire-Typ: `ENEMY_PROTECTION` bzw. `enemyProtection(registry)`.

## Validierung

Die Registry weist unter anderem ab: Waffe mit unbekanntem Kaliber, Standardmunition eines anderen Kalibers, Kaliber ohne Munitionssorte, nicht genau sieben Panzerklassen, Panzerklasse oder Durchschlag außerhalb 1 … 7, nicht ganzzahlige Durchschlagsverschiebung und doppelte Modifikatoren. Jede Waffe wird beim Start mit **jeder** Munition ihres Kalibers aufgelöst, damit auch ungenutzte Sorten keine ungültigen Werte verstecken.

Tests: `apps/server/test/ammunition.test.ts`.

## Nächste Schritte

1. Zweite Munitionssorte (z. B. Teilmantel) mit Auswahl im Carrier, Übertragung im Snapshot und HUD-Anzeige (`shortName`).
2. Erster gepanzerter Gegner (Klasse 2 oder 3) und eine TTK-Tabelle je Kaliber × Panzerklasse.
3. ~~Schrot~~: seit 8.1A (VX-13 Cerberus).
4. Optional: Stagger/Mannstoppwirkung je Kaliber, Panzerung pro Trefferzone, Brandmunition als eigene Schadensart mit Effekt.
