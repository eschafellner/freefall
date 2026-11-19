# Combat-Playtest-Metriken

Die Kampftelemetrie zählt pro Einsatz (Mission) bzw. pro Arena-Sitzung. Sie enthält keine personenbezogenen Daten: keine Spielernamen, keine Sitzungs-IDs, nur Summen pro Waffe und System. Die Zähler sind einfache Inkremente ohne Allokation pro Tick (`apps/server/src/systems/telemetry.ts`).

## Wo die Daten erscheinen

| Ort | Inhalt |
| --- | --- |
| F2-Telemetriepanel, Abschnitt KAMPF | laufende Werte (Server-`metrics`, 2 Hz) |
| F2-Telemetriepanel, Abschnitt AUDIO | aktive Stimmen, Spitze, verworfene Ereignisse (Client) |
| `MissionResult.combat` | Endstand des Einsatzes, an alle Clients gesendet |
| Server-Log am Missionsende | eine Zeile `[combat-telemetry] {…}` mit Mission, Schwierigkeit, Balance-Hash und allen Zählern |

## Felder (`CombatTelemetry`)

| Feld | Bedeutung |
| --- | --- |
| `shots.primary|secondary` | abgegebene Schüsse |
| `hits.primary|secondary` | Treffer an Gegnern und Nestern |
| `damage.primary|secondary` | tatsächlich verursachter Schaden (am Gegner gedeckelt auf dessen Rest-HP) |
| `magazinesUsed.*` | verbrauchte Reservemagazine |
| `roundsDiscarded.*` | beim Nachladen verworfene Restpatronen |
| `reloadsInterrupted` | abgebrochene Nachladevorgänge vor der Insertion |
| `grenadesThrown`, `grenadeKills` | Würfe, Kills durch Explosionen |
| `grenadeDamageEnemies`, `grenadeDamageNests` | Explosionsschaden gegen Gegner bzw. Nester |
| `meleeAttacks`, `meleeHits`, `meleeKills`, `staggers` | Nahkampf |
| `friendlyFireDamage.bullet|explosion|melee` | Schaden an verbündeten Operatoren |
| `selfDamage` | Selbstschaden durch eigene Granaten |
| `convictFriendlyDamage` | Schaden an verbündeten Convicts |
| `resupplyUses`, `refilled.*` | Nachschubnutzungen und vergebene Mengen |
| `blasts`, `blastQueryMsTotal`, `blastQueryMsMax` | Explosionen und Laufzeit der Trefferabfragen |

## Auswertungsvorlage

Pro Testlauf (Schwierigkeit, Spielerzahl, Balance-Hash aus der Logzeile notieren):

| Kennzahl | Formel | Erwartung / Frage |
| --- | --- | --- |
| Trefferquote AR / P-01 | `hits / shots` | sinkt sie bei Dauerfeuer deutlich? (Recoil wirkt) |
| Munitionsdruck | `magazinesUsed.primary` von 8 + Nachschub | Wird die Reserve knapp, aber nicht leer? |
| Verlust durch taktisches Nachladen | `roundsDiscarded / (magazinesUsed × Magazingröße)` | Anteil verworfener Munition, Hinweis auf vorschnelles Nachladen |
| Granaten-Effizienz | `grenadeDamageNests / grenadesThrown` | ≥ 120 pro Wurf bei gezielten Nest-Würfen |
| Nahkampf-Nutzung | `meleeHits / meleeAttacks` | Wird V als Notlösung genutzt? |
| Friendly-Fire-Anteil | `Σ friendlyFireDamage / (Operator × 100 HP)` | stört FF den Koop-Fluss? |
| Nachschub-Auslastung | `resupplyUses / 8` | Werden die Container gezielt angesteuert? |
| Explosionskosten | `blastQueryMsMax` | bleibt deutlich unter 1 ms |

Ergänzend aus dem F2-Panel: FPS, CPU-/GPU-Zeit, Draw Calls, Netzlast, Server-Tick Ø/P95, Audio-Stimmen. Diese Client-Werte werden nicht automatisch gespeichert und müssen notiert werden.

## Beispiel aus dem automatischen Trace (FREEFALL, skriptgesteuert)

Nicht repräsentativ für echtes Spiel, zeigt nur das Format:

```json
{"shots":{"primary":142,"secondary":32},"magazinesUsed":{"primary":3,"secondary":3},"roundsDiscarded":{"primary":70,"secondary":21},
 "reloadsInterrupted":2,"grenadesThrown":6,"grenadeDamageEnemies":1440,"grenadeKills":27,"friendlyFireDamage":{"bullet":0,"explosion":39,"melee":0},
 "selfDamage":44,"convictFriendlyDamage":21,"blasts":6,"blastQueryMsMax":0.026}
```
