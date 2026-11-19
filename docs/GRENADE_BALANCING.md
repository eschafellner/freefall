# Granaten-Balancing

## Werte (`equipment.json › grenades[0]`)

| Wert | 7.2A | 7.2B |
| --- | ---: | ---: |
| `baseDamage` | 110 | **165** (× 1,5) |
| `blastRadius` | 7 m | **10,5 m** (× 1,5) |
| `falloff` | linear | linear |
| `structureDamageMultipliers.structure.swarm_nest` | 1,45 | **2,0** |
| `capacity` | 2 | 2 |

Der alte Nest-Multiplikator wurde ersetzt, nicht gestapelt. Weitere Faktoren gibt es nicht; die Schwierigkeit wirkt nur über die Nest-HP (`nestHealthMultiplier`).

## Formel (Server, `systems/grenades.ts`)

```text
d       = 3D-Abstand Detonation → Ziel (Ziel auf 0,5 m Höhe, Granate liegt bei 0,09 m)
Basis   = round(baseDamage × (1 − d / blastRadius))  für d < blastRadius, sonst 0
Deckung = 0, wenn die Bodenlinie Detonation → Ziel ein Hindernis schneidet (clearGroundLine)
Nest    = Resolver: Basis × structureMultiplier (2,0), gerundet
Operator= Resolver: Basis × 0,3 (Verbündete und Selbstschaden)
```

Für Nester wird der Abstand zum Nestmittelpunkt verwendet.

## Wirkung gegen Schwarmnester

Schaden pro Granate und nötige Würfe je Schwierigkeit (Leicht / Normal / Herausfordernd / Schwer / Extrem / Albtraum / FREEFALL, Nest-HP 306 / 360 / 360 / 396 / 414 / 432 / 450). Berechnet mit dem Servercode:

| Abstand zum Nestzentrum | Gegnerschaden | Nestschaden | Würfe |
| --- | ---: | ---: | --- |
| 0 m (Volltreffer) | 159 | 318 | 1 / 2 / 2 / 2 / 2 / 2 / 2 |
| 2 m | 133 | 266 | 2 / 2 / 2 / 2 / 2 / 2 / 2 |
| 3,8 m (Nestrand) | 105 | 210 | 2 / 2 / 2 / 2 / 2 / 3 / 3 |
| 5 m | 86 | 172 | 2 / 3 / 3 / 3 / 3 / 3 / 3 |
| 6 m | 70 | 140 | 3 / 3 / 3 / 3 / 3 / 4 / 4 |
| 8 m | 39 | 78 | 4 / 5 / 5 / 6 / 6 / 6 / 6 |

Zielvorgabe „zwei bis vier gut platzierte Granaten auf Normal“ ist erfüllt (0–6 m: 2–3 Würfe). Zum Vergleich 7.2A: Volltreffer 151 (3 Würfe), Nestrand 73 (5 Würfe), 5 m 45 (8 Würfe). Zerstörte Nester stoppen die Produktion sofort (`SwarmNestManager.destroy` setzt das Spawn-Budget auf 0). Auftauchende Nester (`EMERGING`) nehmen keinen Explosionsschaden.

## Performance

Die Explosion fragt nur die Grid-Zellen ab, die den Radius überdecken (bei 10,5 m und 1,9-m-Zellen höchstens 12 × 12 Zellen), nie die ganze Horde. Operator (≤ 4) und Convicts (≤ 4) werden linear geprüft. Gemessen: längste einzelne Explosionsabfrage bei 1.000 Gegnern 0,045 ms (Benchmark `combat`), Telemetrie `blastQueryMsMax`.

## Darstellung (`rendering/weapons/GrenadeView.ts`)

Feste Pools, keine neuen Objekte pro Explosion: Blitz (additives Sprite, 0,12 s) plus eine dauerhaft vorhandene Punktlichtquelle (Intensität 0 im Ruhezustand, damit keine Shader neu kompiliert werden), Druckwelle bis zum Schadensradius, Rauchsäule, Bodenstaubring, Erdbrocken mit ballistischer Flugbahn, Brandfleck (14 s). Ausgelöst durch das Server-Event `blast` (mit Fallback über den Granaten-Snapshot für ältere Server). Kamera: FOV-Kick und leichte Positionserschütterung (max. 6 cm, klingt in ca. 0,4 s ab), deaktiviert bei `prefers-reduced-motion`. Explosionsgeräusch siehe [Waffen-Audio](WEAPON_AUDIO.md).

## Tests

`combat.test.ts` Abschnitt 15.3, `simulation.test.ts` (Abstand, Deckung, gleichzeitige Explosionen im vollen Grid).
