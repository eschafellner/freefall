# Combat Balance 7.2B

Milestone 7.2B macht das Kampfsystem taktisch und spürbar: begrenzte Magazine mit taktischem Nachladen, serverseitiges Recoil und Streuung, stärkere Granaten, reduziertes Friendly Fire, Nahkampf mit Stagger, gemeinsamer Nachschub am Albatross und eine neue Waffen-Audio-Pipeline. Alle Werte liegen in der Balance Registry aus 7.2A. Es gibt keine zweite Konfigurationsarchitektur.

| | |
| --- | --- |
| Balance-Release | `7.2B` |
| Schema | 2 (`manifest.json`) |
| Konfigurations-Hash | `89fa48fc4bb55051` (`npm run balance:check`) |
| Neue Datei | `packages/shared/src/balance/data/combat.json` |
| Erweiterte Dateien | `weapons.json`, `equipment.json`, `structures.json`, `manifest.json` |

Laufende Missionen behalten ihre beim Start aufgelöste Balance (`MissionBalance`, inklusive Nachschub). Das Loadout wird beim Erzeugen des Battlefields einmal aufgelöst.

Detaildokumente: [Taktisches Nachladen](TACTICAL_RELOADING.md) · [Nahkampf](MELEE_SYSTEM.md) · [Granaten](GRENADE_BALANCING.md) · [Friendly Fire](FRIENDLY_FIRE.md) · [Albatross-Nachschub](ALBATROSS_RESUPPLY.md) · [Waffen-Audio](WEAPON_AUDIO.md) · [Playtest-Metriken](COMBAT_PLAYTEST_METRICS.md)

## 1. Combat Audit (Stand vor 7.2B)

| Bereich | Vorgefunden | Bewertung |
| --- | --- | --- |
| WeaponDefinitions | Registry-Einträge für Kestrel AR-01 und P-01, Recoil/Streuung als `reserved(0)` | vollständig, aber Gunplay-Felder gesperrt |
| Munition | Rifle 30 Schuss, unbegrenzte Reserve. Pistole 12 Schuss, 48 lose Reservepatronen (`pistolReserve`), Nachladen füllte nur die Differenz auf | kein Magazinmodell |
| Reload | ein Zeitstempel `reloadUntil`, Munition am Ende gutgeschrieben | keine Phasen, keine Unterbrechungsregeln außer Waffenwechsel/Tod |
| Client Prediction | nur Bewegung. Schüsse kamen ausschließlich als Server-Event | kein Recoil-Feedback ohne Latenz |
| Hit Validation | Server-Hitscan gegen Gegner (O(n) Strahltest) und Nester | korrekt, keine Operator-Treffer |
| Recoil / Spread | nur ein FOV-Kick der Kamera (0,63°) und ein Modell-Kick. Schussrichtung = exakte Blickrichtung | Recoil war reiner Kamera-Effekt |
| Granaten | 110 Schaden, 7 m, linearer Abfall, Deckung per Bodenlinie, Nest × 1,45, Grid-Abfrage | funktional, gegen Nester schwach (3–8 Granaten) |
| Heilstims | 5 Ladungen, 40 HP, unterbrechbar | unverändert übernommen |
| Gegnerschaden | `damageEnemy` direkt, keine Relation (Freund/Feind) | kein zentraler Resolver |
| Nestschaden | Treffer und Explosion direkt, Multiplikator in `structureBlastDamage` | ok |
| Albatross / Equipment | Hülle, Düsen, Lebenszyklus. `resupply.supplyCrates = not-implemented` | Nachschub fehlte |
| Audio | eine Oszillator-Ton-Funktion pro Schuss, kein Raum, keine Busse, keine Assets | Platzhalter |
| HUD / Tasten | 1/2 Waffen, R, G, H, E, B | V frei, keine Konflikte |
| Multiplayer-Verträge | `PlayerInput` mit `seq`/`life`, `EquipmentState` mit `pistolReserve`, `ShotEvent` | Sequenznummern vorhanden |

Gemessene Ausgangsperformance: siehe Abschnitt 6.

## 2. Geänderte Werte (alt → neu)

| Wert | 7.2A | 7.2B | Herleitung |
| --- | ---: | ---: | --- |
| Rifle Magazin | 30 | **45** | verbindlich |
| Rifle Reservemagazine | unbegrenzt | **8** (Tragekapazität 8) | verbindlich, Missionsstart 405 Schuss inkl. geladenem Magazin |
| Pistole Schaden | 18 | **21,6** | 18 × 1,2 |
| Pistole Reserve | 48 lose Patronen | **4 Magazine** à 12 (Kapazität 4) | verbindlich, gleiche Gesamtmenge |
| Rifle vertikales Recoil | 0 (nur FOV-Kick) | **0,36°/Schuss** | Referenz 0,3° × `verticalMultiplier` 1,2 |
| Rifle horizontales Recoil | 0 | **0,22°/Schuss** | Referenz 0,2° × `horizontalMultiplier` 1,1 |
| Rifle Recovery | Kamera-Kick-Abklingrate 19/s | unverändert für den Kick, neu 5 °/s für das Gameplay-Recoil | bestehender Wert beibehalten |
| Granate Schaden | 110 | **165** | × 1,5 |
| Granate Radius | 7 m | **10,5 m** | × 1,5 |
| Granate gegen Nest | × 1,45 | **× 2,0** | ersetzt den alten Multiplikator (nicht gestapelt) |
| Friendly Fire | aus | **30 %** | `combat.json › damagePolicy` |
| Selbstschaden | aus | **30 %** | keine frühere Regel vorhanden |
| Nahkampf | – | 50 Schaden, 2 m, Cooldown 0,8 s, Stagger 0,4 s | Ausgangswerte |
| Nachschub | – | 2 Container × 4 Ladungen | Ausgangswerte |

Hinweis zum Recoil: Weil 7.2A kein Gameplay-Recoil besaß, gibt es keinen messbaren Altwert, auf den sich +20 %/+10 % beziehen ließen. Die Registry führt deshalb einen Referenzwert (`pitchPerShot` 0,3°, `yawPerShot` 0,2°) und die geforderten Multiplikatoren getrennt. So bleibt die verlangte Steigerung nachvollziehbar und unabhängig tunebar.

Unverändert: Feuerraten (10/s, 4/s), Rifle-Schaden 24, Reichweiten, Nachladezeiten (2,1 s / 1,45 s), Waffenwechsel 0,48 s, Granatenkapazität 2, Wurfphysik, Stims, Operator, Gegner, Nester, Schwierigkeitsgrade, Convicts.

## 3. Über die Registry steuerbar

| Datei | Neue oder freigegebene Felder |
| --- | --- |
| `weapons.json` | `reserveMagazines`, `maxReserveMagazines`, `reloadTimeline.removalAt/insertionAt`, `recoil.*` (Basis, Multiplikatoren, Wachstum, Klettergrenze, Recovery, `visualKick`, `cameraKick`), `spread.*` (Hüfte, Visier, Bewegung, Bloom) |
| `equipment.json` | `medical.interruptedBy.melee`, neue Liste `melee[]`, `loadouts[].meleeId`, `resupply.*` (Interaktion, Reichweite, Mengen, Verfügbarkeit) |
| `structures.json` | `vehicles[].supplyContainers[]` (Seite, Seriennummer, Montagepunkt, Ladungen, HP) |
| `combat.json` | `damagePolicy`, `operatorHitbox`, `audio.*` |

Effektive Werte (Ticks, Radiant) berechnet `resolver.ts` einmal pro Konfiguration: `EffectiveWeapon.handling`, `reloadRemovalTicks`/`reloadInsertionTicks`, `EffectiveLoadout.melee`, `damagePolicy`, `MissionBalance.resupply`. Recoil, Streuung, Nahkampfschaden und -reichweite akzeptieren Ausrüstungs-Modifikatoren (spätere Aufsätze), Nachschubmengen, Ladungen und Interaktionszeit akzeptieren Missions-Modifikatoren (spätere Schiffsupgrades).

## 4. Netzwerkverträge

| Nachricht | Änderung |
| --- | --- |
| `input` (`PlayerInput`) | `equipment` akzeptiert zusätzlich `melee`. Weiterhin nur Tasten, Blickrichtung, `seq`, `life`. Unbekannte Felder (z. B. `damage`, `ammo`) werden verworfen |
| `players` (`PlayerState`) | `equipment.magazines.{primary,secondary}` ersetzt `pistolReserve`. Neu `equipment.meleeReadyAt`, `equipment.supplyId`, optional `reload` (`ReloadState`, nur solange relevant) |
| `shot` (`ShotEvent`) | neu `slot` und `ally` (getroffener Verbündeter) |
| `combat` (neu) | `CombatEvent[]` pro Tick, max. 48: `melee`, `friendly-fire`, `reload`, `resupply`, `blast` |
| `mission-state` | `albatross.supply[]` (Container-Zustand), `result.combat` (Telemetrie) |
| `mission-interact` | startet am Container die Nachschubaktion. Ablehnungen kommen als `mission-feedback` (`resupply-full`, `-empty`, `-destroyed`, `-offline`, `-range`, `-busy`) |
| `metrics` | neu `combat` (laufende Telemetrie) |

Schutz gegen Duplikate: strikt steigende `seq` (Wiederholungen werden verworfen), `life`-Bindung für Aktionen, Flanken-Erkennung für Reload, genau eine Munitions- bzw. Nachschubtransaktion pro Aktion auf einem Server-Tick, keine Client-Werte für Schaden, Munition, Magazine, Granaten, Stims, Ladungen oder Multiplikatoren.

## 5. Tests

`npm test`: 97 Tests, alle grün. Neu in `apps/server/test/combat.test.ts` (26 Tests):

- **Waffen:** 45/8, 4 Pistolenmagazine, Pistolenschaden 21,6 am Gegner, Recoil aus der Registry (geänderte Datei ändert den Effektivwert), zunehmendes Recoil bei Dauerfeuer, Recovery auf 0, Feuerrate serverseitig (genau 10 Schuss/s), Client-Felder wie `damage` werden verworfen.
- **Nachladen:** 17/45 + 8 → 45/45 + 7 (17 Schuss verworfen), volle Magazine und leere Reserve, Auto-Reload, Unterbrechung durch Wechsel/Granate/Nahkampf vor der Insertion, keine Zweittransaktion danach, gleichzeitiger Wechsel + Reload, doppelte Reload-Pakete, Tod während des Reloads.
- **Granaten:** Werte aus der Registry, Abfall mit der Distanz, Wand blockt, 2–4 Granaten pro Nest auf Normal, Nest in der Mission zerstört und ohne weitere Spawns, Friendly Fire und Selbstschaden, 1.000 Gegner: nur Gegner im Radius betroffen.
- **Nahkampf:** genau ein Ziel, Schaden, kein Treffer hinten/außer Reichweite/hinter Deckung, Cooldown, Stagger blockiert Angriffe, Knockback begrenzt (≤ 1,1 m), Stagger endet von selbst, Immunität verhindert Ketten, kein Durchschieben durch Wände.
- **Friendly Fire:** Resolver-Reihenfolge und Einmal-Anwendung, Rifle- und Nahkampftreffer am Mitspieler.
- **Nachschub:** zwei Container mit Ladungen aus der Registry, Auffüllen bis zur Kapazität, keine Ladung bei Vollversorgung, gleichzeitige Nutzung der letzten Ladung durch vier Operator, Reichweite, zerstörter Container, flugunfähiger und zerstörter Albatross, Abbruch durch Feuern.
- **Multiplayer:** vier Operator laden gleichzeitig nach und schlagen gleichzeitig zu, Reconnect während eines Reloads und nach einer Nachschubtransaktion, Disconnect während der Nachschubinteraktion.

Bestehende Suiten angepasst: `reload.test.ts` (Transaktion am Insertion-Tick, Pistolenmagazin verworfen), `balance.test.ts` (Schema 2, neue Validierungsregeln, Altwertevergleich mit dokumentierten 7.2B-Änderungen, neu aufgezeichnete Golden Traces). Die Schabe-Prüfsummen (`EnemyVisualLOD.ts`, `AgentMeshes.ts`, `HordeManager.ts`) sind unverändert; der Stagger-Zustand liegt deshalb in einer eigenen ECS-Komponente (`ecs/StaggerComponent.ts`).

Die vollständige Mission (Carrier, Boarding, Deployment, Convicts, Patrouillen, Verstärkungsrufe, Durchbrüche, Nester, Ziele, Albatross- und Ballon-Extraktion, MissionResult, Belohnungen) läuft weiter über `mission.test.ts`, `multiplayer.test.ts` (vier echte Verbindungen inklusive Reconnect) und die Golden Traces aller sieben Stufen.

## 6. Performance

Gemessen mit `npm run benchmark`, gleiche Maschine (Ryzen 7 9700X, Node 24.18), gleicher Seed 421337, vier Operator. Serverseitige Simulationszeit pro Tick (Budget 33 ms).

| Szenario | vor 7.2B Ø / P95 / max (ms) | 7.2B Ø / P95 / max (ms) |
| --- | --- | --- |
| Arena, 1.000 Gegner, Dauerfeuer | 0,214 / 0,245 / 1,141 | 0,220 / 0,246 / 0,449 |
| Arena, 1.000 Gegner, Dauerfeuer + Granaten alle 2 s + Nahkampf jede s (neu) | – | 0,121 / 0,147 / 0,873 |
| Mission, Nester L4 (307 Gegner) | 0,091 / 0,103 | 0,094 / 0,106 |
| Mission, Sättigung L7 (1.000 Gegner) | 0,360 / 0,374 | 0,366 / 0,379 |
| Komplette FREEFALL-Mission, 1.000 Gegner | 0,386 / 0,409 / 0,994 | 0,393 / 0,430 / 1,067 |
| Explosions-Abfrage, längste einzelne (1.000 Gegner) | – | 0,045 ms |

Der Benchmark-Harness füllt seit 7.2B die Reservemagazine auf, damit die Schusslast mit 7.1 vergleichbar bleibt. Das Kampf-Szenario ist schneller als reines Dauerfeuer, weil Granaten viele Gegner entfernen und der Hitscan danach weniger Kandidaten prüft.

Geschätzte ausgehende Datenrate pro Client (Mission-Benchmark): leer 38,0 → 42,9 kB/s, Sättigung L7 148,1 → 153,0 kB/s (+3 %). Ursache: Magazine, Nahkampf-Cooldown und Container-Zustand in den Snapshots. Der Reload-Zustand wird nur übertragen, solange er läuft.

**Nicht gemessen** (kein Browser-Lauf in dieser Umgebung): Client-FPS, P95-Frame-Time, Draw Calls, reale Audio-Stimmenzahl, reale Netzwerkrate. Die Werte stehen im F2-Telemetriepanel zur Verfügung (inklusive neuer Abschnitte KAMPF und AUDIO) und sollten im nächsten Playtest erfasst werden. Neue Draw Calls entstehen durch die Explosionseffekte (sieben instanzierte Meshes, je einer pro Effektschicht, unabhängig von der Zahl der Explosionen) und die zwei Container (einige Einzel-Meshes).

## 7. Offene Punkte

1. **Nahkampf tötet die Schabe sofort.** 50 Schaden gegen 48 HP (alle Stufen haben `enemyHealthMultiplier` 1). Stagger und Knockback greifen daher bei Schaben derzeit nie, nur bei Gegnern mit mehr Restleben. Playtest-Entscheidung: 50 beibehalten (Nahkampf als sicherer Kill) oder z. B. 30 Schaden (zwei Stöße, sichtbarer Stagger dazwischen).
2. **Pistole tötet die Schabe weiterhin mit drei Treffern** (21,6 × 2 = 43,2 < 48). Für zwei Treffer wären 24 nötig.
3. Granate gegen Nest: ein Volltreffer ins Zentrum zerstört ein Nest auf Leicht (306 HP) in einem Wurf.
4. Die Containermodelle sind prozedural; ein authored Asset fehlt. Die Nahkampfanimation ist ein prozeduraler Fallback (kein Clip).
5. Waffen-Audio ist vollständig synthetisch. Lizenzierte Aufnahmen fehlen (Anforderungen in [WEAPON_AUDIO](WEAPON_AUDIO.md)).
6. Recoil-Prediction auf dem Client wird nicht aktiv mit dem Server abgeglichen; beide laufen nach Loslassen des Abzugs deterministisch auf 0 zurück. Bei hoher Latenz kann der Anstieg in den ersten Schüssen um einen Tick abweichen.
7. Convicts schießen nicht auf Operator; die Relation Convict → Operator ist im Resolver mit 0 belegt.
8. Client-Performance (FPS, Frame-Time, Draw Calls, Audio-Stimmen) muss im Browser-Playtest gemessen werden.

## 8. Fokus für den nächsten Playtest

- Fühlt sich das Rifle-Recoil bei Dauerfeuer kontrollierbar, aber fordernd an? Werden kurze Feuerstöße genutzt?
- Reichen 405 Schuss plus Nachschub für eine Mission auf Normal und FREEFALL? Wie viel Restmunition wird beim Nachladen verworfen (Telemetrie `roundsDiscarded`)?
- Werden die acht Nachschubladungen knapp? Wann werden sie genutzt? Werden Container zerstört?
- Granaten gegen Nester: zwei bis drei Würfe auf Normal bestätigen, Selbst- und Eigenbeschuss in engen Situationen beobachten.
- Friendly Fire 30 %: fühlt es sich fair an oder frustrierend? Wie viel Schaden entsteht pro Mission?
- Nahkampf: Entscheidung zu Punkt 7.1 treffen.
- Waffen-Audio auf Kopfhörern und Lautsprechern prüfen, Lautstärkeregler, Carrier gegenüber Dev' Ault.
- Client-FPS und Frame-Time mit vier Operatoren und 1.000 Gegnern bei Granatensalven.
