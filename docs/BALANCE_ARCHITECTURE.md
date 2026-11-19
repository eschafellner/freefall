# Balance-Architektur

Seit Milestone 7.2A liegen alle wichtigen Gameplay-Werte als JSON in einer zentralen, validierten Registry. Die Simulation liest nur noch aufgelöste, unveränderliche Werte. Die Migration hat keine Werte geändert ([Katalog](BALANCE_CATALOG.md), [Workflow](BALANCE_WORKFLOW.md)).

## Aufbau

```text
packages/shared/src/balance/
├── data/                 Gameplay-Daten (die einzige Stelle für Werte)
│   ├── manifest.json     Schema-Version und Release-Label
│   ├── weapons.json      Primär- und Sekundärwaffen
│   ├── equipment.json    Granaten, Heilstims, Nahkampf, Loadouts, Nachschubregeln
│   ├── combat.json       Damage Policy (Friendly Fire), Operator-Hitbox, Audio-Parameter (7.2B)
│   ├── operators.json    Lebenspunkte, Bewegung, Respawn, Schutzzeiten
│   ├── enemies.json      Fraktionen und Gegner-Archetypen (Schabe)
│   ├── structures.json   Schwarmnester, Albatross-02
│   ├── swarm.json        Horden-KI, Arena, Patrouillen, Verstärkungen, Threat, Extraktionsdruck
│   ├── convicts.json     Trupp und sieben Ausrüstungskits
│   └── difficulty.json   Sieben Schwierigkeitsgrade
├── schema.ts             Abhängigkeitsfreie Validierungs-DSL mit Pfadangaben in Fehlermeldungen
├── definitions.ts        Schemas je Datei. Die TypeScript-Typen werden daraus abgeleitet.
├── registry.ts           Laden, Querverweise, eindeutige IDs, Einfrieren, Konfigurations-Hash
├── resolver.ts           Modifikatoren, effektive Loadouts, Missions-Snapshot
├── hash.ts               Kanonisches JSON und FNV-1a-64
├── defaults.ts           Die veröffentlichte Konfiguration: BALANCE und BASE_LOADOUT
└── index.ts
```

Eine bestehende Definition Registry gab es nicht. Die Werte lagen als Konstanten in `definitions/*.ts` und als Magic Numbers in Server-Systemen. Diese Module sind jetzt dünne Aliase auf die Registry (`TEST_RIFLE`, `WEAPONS`, `FRAG`, `STIM`, `PLAYER`, `ENEMY_TYPES`, `DIFFICULTIES`, `ALBATROSS`, `NEST_*`). Sie halten keine eigenen Werte und sorgen nur dafür, dass bestehende Imports, Entity-IDs und Netzwerk-IDs gleich bleiben.

Es kommt keine neue Abhängigkeit hinzu. Im Repository gab es keine Validierungsbibliothek, und für die vorhandenen Definitionen reicht eine kleine eigene DSL (`schema.ts`). Sie läuft identisch in Node und im Browser.

## Datenfluss

```text
JSON (data/)                        einmal beim Serverstart
  └─ createBalanceRegistry()        Schema → Querverweise → Einfrieren → Hash → Probe-Auflösung aller Konfigurationen
       └─ BalanceRegistry (BALANCE)
            ├─ resolveLoadout()            beim Konfigurieren eines Battlefield     → EffectiveLoadout (SimPlayer.loadout)
            └─ resolveMissionBalance()     einmal bei Missionsstart (Boarding)      → MissionBalance (eingefroren)
                 └─ EncounterDirector, PatrolManager, SwarmNestManager, Convicts, meleeSystem
```

Kein System löst JSON pro Tick auf. Ticks, Feuerintervalle, Nachladedauern, Nest-HP und Cooldowns werden einmal berechnet und als Zahlen gelesen. Die Messung zeigt keinen messbaren Mehraufwand bei 1.000 Gegnern (siehe Workflow, Abschnitt Migration).

## Validierung

`createBalanceRegistry(raw)` sammelt alle Fehler, bevor es abbricht. Jede Meldung nennt Datei und Pfad:

```text
Ungültige Balance-Konfiguration (2 Fehler):
  - weapons.json › weapons[0].magazineSize: muss ≥ 1 sein, erhalten -30
  - difficulty.json › difficulties[1].patrolMinSize: Minimum 9 ist größer als patrolMaxSize 7
```

| Ebene | Prüfung |
| --- | --- |
| Schema | Pflichtfelder, unbekannte Felder (Tippfehler), endliche Zahlen, ganze Zahlen, Wertebereiche, Enums, ID-Format |
| IDs | Eindeutig über **alle** Definitionen hinweg, stabile Kleinschreibung |
| Querverweise | Loadout → Waffen/Granate/Stim, Waffe passt zum Slot, Gegner → Fraktion, Nest → Fraktion und Spawn-Archetyp (gleiche Fraktion), Granaten-Strukturmultiplikator → Nest, Schwierigkeit → Convict-Kit, Convicts → Nachladewaffe, Arena/Patrouille → Archetyp |
| Konsistenz | Genau 7 Stufen mit Level 1–7, Patrouillen-Minimum ≤ Maximum, `maxActiveEnemies` ≤ ECS-Kapazität 1.000, Durchbrüche ≤ Nester, Spawns je Tick ≤ Gegnerlimit, Wire-Typen eindeutig und lückenlos ab 0, Sprint ≥ Gehen, Granaten-Freigabe vor Wurfende |
| Reservierte Felder | Recoil, Streuung, waffenabhängige Laufgeschwindigkeit, Gegnerpanzerung/-resistenzen und Stim-Cooldown sind im Datenformat vorhanden, werden aber noch nicht simuliert. Nur der neutrale Wert ist zulässig. Ein Tuning-Versuch schlägt laut fehl, statt wirkungslos zu bleiben. |
| Auflösung | Nach der Schemaprüfung löst die Registry jedes Loadout und alle 7 Missions-Snapshots probeweise auf. Ungültige effektive Werte (negativ, nicht endlich, außerhalb des Bereichs) fallen beim Start auf, nicht erst beim Missionsstart. |

Ein Fehler verhindert den Serverstart und den Client-Build. Eine teilweise gültige Konfiguration gibt es nicht.

## Auflösung effektiver Werte

Reihenfolge der Ebenen:

```text
Basisdefinition (JSON)
  → equipment   Ausrüstung und spätere Waffenattachments (nur Waffenwerte)
  → difficulty  aus difficulty.json erzeugt (nur Missionswerte)
  → mission     optionale Missionsmodifikatoren (nur Werte, die auch difficulty erlauben)
  → effektiver Wert
```

Formel je Wert, unabhängig von der Listenreihenfolge:

```text
wert = (basis + Σ add) × Π multiply ÷ Π divide   → Rundung (round/ceil) → Bereichsprüfung
```

Schutz gegen Mehrfachanwendung und unkontrolliertes Stacking:

- Jede Quelle (`difficulty:hard`, `attachment:drum`) darf einen Wert nur einmal verändern.
- Jeder Wert wird pro Resolver genau einmal aufgelöst. Ein zweiter Versuch wirft einen Fehler.
- Jeder Wert erlaubt nur bestimmte Ebenen. Ein Difficulty-Modifikator auf Waffenschaden wird abgewiesen.
- Modifikatoren ohne Ziel (Tippfehler im Wert-Schlüssel) werden abgewiesen.
- Multiplikatoren und Divisoren müssen > 0 und endlich sein. Ergebnisse müssen endlich sein und Mindest- und Höchstwerte einhalten. Magazine haben mindestens 1 Schuss.
- Der Missions-Snapshot enthält keine rohen Multiplikatoren mehr. `EncounterDirector`, `PatrolManager` und `SwarmNestManager` sehen nur effektive Werte und können einen Faktor deshalb strukturell nicht ein zweites Mal anwenden. Vor 7.2A lasen sie `difficulty.*Multiplier` direkt, und das Nest speicherte zusätzlich eine Kopie des Faktors.

Jeder aufgelöste Wert hinterlässt einen Trace, den `explainBalance()` und `npm run balance:check -- --explain` ausgeben:

```text
nest.maxHealth: 360 → 396 [× 1.1 (difficulty:hard)]
extraction.pressureIntervalTicks: 450 → 360 [÷ 1.25 (difficulty:hard)]
```

### Von der Schwierigkeit beeinflusste Werte

| Wert | Quelle in `difficulty.json` | Operation |
| --- | --- | --- |
| Gegner-HP, je Archetyp | `enemyHealthMultiplier` | × (7.2A: überall 1) |
| Gegner-Nahkampfschaden, je Archetyp | `enemyDamageMultiplier` | × (7.2A: überall 1) |
| Nest-HP | `nestHealthMultiplier` | × |
| Nest-Produktionsintervall | `nestSpawnIntervalMultiplier` | × |
| Sichtweite der Patrouillen | `detectionRangeMultiplier` | × |
| Ruf-Cooldown je Gruppe, regionaler und globaler Verstärkungs-Cooldown | `reinforcementCooldownMultiplier` | × |
| Extraktionsdruck (erster Impuls, Intervall) | `extractionThreatMultiplier` | ÷ |
| Threat-Bonus und Nestproduktion während der Extraktion | `extractionThreatMultiplier` | × |
| Gegnerlimit, Nester, Durchbrüche, Verstärkungsbudget, Spawns je Tick, Patrouillendichte und -größe | direkte Werte | – |
| Convict-Ausrüstungsqualität | `convictKitId` | Verweis |

## Statische Definition und Laufzeitzustand

| Statisch (Registry, Snapshot) | Laufend (MissionInstance) |
| --- | --- |
| `nest.maxHealth`, Intervall, Ausgänge, Kollaps-Dauer | `SwarmNest.hp`, `state`, `spawnCooldown`, `boostUntil` |
| Albatross Hull/Thruster-Maximum | `Albatross.hullHealth`, Thruster-Zustand |
| Magazingröße, Reservemagazine, Stim-Ladungen | `SimPlayer.ammo`, `equipment.magazines.primary|secondary`, `equipment.stims` |
| Recoil, Streuung | `EffectiveWeapon.handling` (Radiant, Ticks), `SimPlayer.recoil` |
| Nahkampf, Friendly Fire | `EffectiveLoadout.melee`, `EffectiveLoadout.damagePolicy` → `systems/damage.ts` |
| Nachschub | `MissionBalance.resupply` (Missionsebene, vorbereitet für Schiffsupgrades) |
| Patrouillen-Sichtweite, Ruf-Cooldown | `PatrolGroup.state`, `nextCall`, `alarm` |

## Versionierung und Serverautorität

- `BALANCE.version = { schemaVersion, release, hash }`. Der Hash ist FNV-1a-64 über das kanonische JSON aller Dateien (sortierte Schlüssel). Formatierung und Schlüsselreihenfolge ändern ihn nicht, jeder Wert schon.
- `MissionInstance.start()` erzeugt beim Übergang ins Boarding einen eingefrorenen `MissionBalance`. Er gilt bis zur Rückkehr zum Carrier. Die Auswahl der Schwierigkeit ist ab dann gesperrt.
- Der Hash steht im Missions-Snapshot (`balance`), im Event `MissionStarted` (`balanceHash`) und im Missionsergebnis (`balanceHash`). Damit lässt sich jede Runde einer Konfiguration zuordnen.
- Konfigurationen ändern sich nur durch Dateiänderung und Neustart. Eine Live-Balancing-Schnittstelle gibt es bewusst nicht.
- Der Server berechnet Treffer, Schaden, Heilung, Munition und Spawns. Der Client nutzt dieselben Definitionen nur für Anzeigen: Namen, Magazin- und Ladungsanzeige, Nachladebalken, Granatenradius im Effekt, Waffen-Kick und Audio-Cue. Er rechnet keinen Schaden.
- **Versionskonflikt:** Der Client sendet nach dem Beitritt `balance-version`, der Server antwortet mit seiner Version. Bei Abweichung erscheint ein Hinweis im HUD und eine Konsolenwarnung: „Balance-Version weicht ab (Server … #…, Client … #…). Der Server bleibt maßgeblich, angezeigte Werte können abweichen. Bitte Client neu laden.“ Das Spiel läuft weiter, weil der Server autoritativ ist. Zusätzlich steht der Hash in den Room-Metadaten.

## Schutzregeln

- **Schabe:** `enemies.json` markiert den Archetyp mit `"protected": true`. Werte, Wire-Typ 0, Asset-ID und das Objekt `ENEMY_TYPES[0]` bleiben identisch. Die Prüfsummen der visuellen Dateien und von `HordeManager.ts` sind unverändert. `schabe.test.ts` und `balance.test.ts` sichern das ab. Der Missions-Snapshot gibt für die Schabe auf allen Stufen dasselbe Objekt zurück, solange die Multiplikatoren 1 sind.
- **Netzwerk:** Wire-Typen dürfen nie umnummeriert werden. Neue Archetypen erhalten den nächsten freien Typ.
