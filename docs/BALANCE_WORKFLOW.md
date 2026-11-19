# Balance-Workflow

Wie man Gameplay-Werte ändert, prüft und neue Definitionen registriert. [Architektur](BALANCE_ARCHITECTURE.md) · [Katalog](BALANCE_CATALOG.md)

## Kurzfassung

```bash
# 1. Wert in packages/shared/src/balance/data/*.json ändern
npm run balance:check              # Validierung, neuer Hash, effektive Werte je Stufe
npm run balance:check -- --explain # jeder aufgelöste Wert mit seinen Modifikatoren
npm test                           # Registry-, Regressions- und Simulationstests
npm run typecheck && npm run build
# 2. Server neu starten (lokal: npm run dev; Testserver: docker compose up -d --build)
```

Änderungen wirken nur nach einem Neustart. Laufende Missionen behalten ihren Snapshot, bis sie zum Carrier zurückkehren. Der Client wird mit denselben Daten gebaut. Ist er veraltet, meldet er die abweichende Version im HUD.

## Wo Werte geändert werden

| Thema | Datei |
| --- | --- |
| Schaden, Feuerrate, Magazin, Reserve, Nachladen, Reichweite | `weapons.json` |
| Granaten, Heilstims, Loadout, Waffenwechsel, Nachschub | `equipment.json` |
| Operator-HP, Lauf- und Sprinttempo, Respawn | `operators.json` |
| Schabe und weitere Archetypen, Fraktionen | `enemies.json` |
| Nester, Albatross | `structures.json` |
| Patrouillen, Rufe, Verstärkungen, Threat, Extraktionsdruck, Horden-KI | `swarm.json` |
| Convict-Trupp und -Kits | `convicts.json` |
| Sieben Schwierigkeitsgrade | `difficulty.json` |
| Release-Label | `manifest.json` (bei jeder veröffentlichten Änderung anpassen) |

Unbekannte Felder werden abgewiesen. Ein Tippfehler wie `"dammage"` fällt also sofort auf.

## Validierung starten

`npm run balance:check` lädt die Registry genauso wie Server und Client. Bei Fehlern listet es alle Probleme mit Datei und Pfad auf und endet mit Exit-Code 1:

```text
Ungültige Balance-Konfiguration (1 Fehler):
  - weapons.json › weapons[0].reserveMagazines: Startreserve 9 übersteigt die Tragekapazität maxReserveMagazines 8
```

Dieselbe Validierung läuft beim Serverstart, im Client-Build und in `npm test`.

## Beispiel: eine Waffe tunen

Ziel: Die Kestrel soll 26 statt 24 Schaden machen und 32 Schuss pro Magazin haben.

1. `weapons.json`, Eintrag `kestrel-ar-01`:

   ```json
   "damage": 26,
   "magazineSize": 32,
   ```

2. `manifest.json`: `"release": "7.2B-kestrel-1"`.
3. `npm run balance:check -- --explain` zeigt den neuen Hash und `weapon.kestrel-ar-01.damage: 26 → 26`.
4. `npm test` schlägt an zwei Stellen absichtlich fehl:
   - `balance.test.ts` › *weapon … values equal the 7.1 constants except the documented 7.2B changes*. Der Test hält den Stand vor der Migration fest. Für eine gewollte Änderung wird der Erwartungswert angepasst oder der Eintrag aus dem Altwertevergleich genommen.
   - `balance.test.ts` › *combat, spawn and damage results match the recorded 7.2B golden traces*. Der Simulations-Fingerabdruck ändert sich, weil Schaden andere Kills erzeugt. Neue Werte mit `npm run balance:trace` erzeugen, in `GOLDEN_TRACES` übernehmen und die Änderung im Commit begründen.
5. Die Schabe-Tests müssen grün bleiben. Schlagen sie fehl, wurde der geschützte Gegner verändert.

Ein Schaden von `-5`, eine Magazingröße von `0` oder `12.5`, eine Feuerrate über 30/s, mehr Startmagazine als `maxReserveMagazines` oder eine Reload-Timeline mit `removalAt ≥ insertionAt` werden abgewiesen.

## Neue Waffe registrieren

1. Eintrag in `weapons.json` mit neuer, stabiler ID (Kleinbuchstaben, Ziffern, `.`, `_`, `-`), `slot`, `category`, allen Pflichtfeldern, `assets.visual` und `sounds.fire` (`rifle` oder `pistol`).
2. Im Loadout `loadout.operator_standard` (`equipment.json`) `primaryWeaponId` oder `secondaryWeaponId` darauf zeigen lassen oder ein zweites Loadout anlegen. Eine Auswahl im Carrier gibt es noch nicht.
3. Für die Darstellung braucht der Client ein Modell zur Asset-ID (`apps/client/src/rendering/AssetRegistry.ts`, `rendering/weapons/`).
4. `npm run balance:check && npm test`.

Seit 7.2B haben alle Waffen eine Reserve aus ganzen Magazinen (`reserveMagazines`, Tragekapazität `maxReserveMagazines`), übertragen als `equipment.magazines.primary|secondary`. `sounds.fire` braucht ein Profil in `combat.json › audio.weapons`.

## Neuen Gegner registrieren

1. Gegebenenfalls Fraktion in `enemies.json › factions`.
2. Archetyp in `enemies.json › archetypes` mit neuer ID, `factionId`, dem **nächsten freien** `wireType` (lückenlos ab 0, bestehende Typen nie umnummerieren), `gameplay`, `ai.detectionRange` und `visualAssetId`. `protected` auf `false`, bis das Design freigegeben ist.
3. Einsetzen: als `spawnArchetypeId` eines neuen Nests (`structures.json`, gleiche Fraktion) oder als `swarm.json › arena.archetypeId`. Der Encounter Director spawnt den Archetyp des Haupt-Nests.
4. Der Hordenrenderer im Client zeichnet bisher nur die Schabe. Ein neuer Wire-Typ braucht eine eigene Darstellung. Die Dateien der Schabe sind geschützt und dürfen dafür nicht verändert werden.
5. Gegnerpanzerung und Resistenzen sind reserviert (neutral), bis die Schadensberechnung sie unterstützt.

## Schwierigkeitsmodifikatoren

Jede Stufe in `difficulty.json` liefert direkte Werte (Gegnerlimit, Nester, Budgets, Patrouillendichte, Convict-Kit) und Multiplikatoren. `difficultyModifiers()` in `resolver.ts` übersetzt die Multiplikatoren in Modifikatoren der Ebene `difficulty` mit der Quelle `difficulty:<id>`. `resolveMissionBalance()` wendet sie bei Missionsstart genau einmal an. Welche Werte betroffen sind, steht in der [Architektur](BALANCE_ARCHITECTURE.md#von-der-schwierigkeit-beeinflusste-werte).

Einen neuen schwierigkeitsabhängigen Wert anlegen:

1. Feld im `difficultySchema` (`definitions.ts`) und in allen sieben Einträgen von `difficulty.json`.
2. Modifikator in `difficultyModifiers()` ergänzen.
3. Den Wert in `resolveMissionBalance()` mit `r('<schlüssel>', basis, …)` auflösen und im `MissionBalance`-Typ ablegen.
4. Im Server nur den effektiven Wert aus dem Snapshot lesen, nie den Multiplikator.

Missionsmodifikatoren (Ebene `mission`, z. B. ein Sturm, der die Sicht halbiert) gibt `resolveMissionBalance(registry, difficultyId, [...])` als dritten Parameter mit. Für Waffenattachments ist die Ebene `equipment` in `resolveLoadout()` vorbereitet:

```ts
resolveLoadout(BALANCE, 'loadout.operator_standard', [
  { source: 'attachment:drum', layer: 'equipment', stat: 'weapon.kestrel-ar-01.magazineSize', operation: 'add', value: 15 },
]);
```

## Balance-Versionierung

- Der Hash entsteht aus dem kanonischen Inhalt aller JSON-Dateien. Gleiche Werte ergeben immer denselben Hash, unabhängig von Formatierung und Schlüsselreihenfolge.
- `manifest.json › release` ist das menschenlesbare Label. Bei einer Schemaänderung wird `schemaVersion` erhöht und `definitions.ts` angepasst.
- Jede Mission speichert den Hash im Snapshot, im Event `MissionStarted` und im Ergebnis. Missionsergebnisse lassen sich so einer Konfiguration zuordnen.
- Client und Server vergleichen ihre Version nach dem Beitritt (`balance-version`).

## Wie die Migration überprüft wurde

1. **Bestandsaufnahme** aller Konstanten und Magic Numbers (siehe [Katalog](BALANCE_CATALOG.md), Spalte „Vorher“).
2. **Simulations-Fingerabdruck vor der Migration.** `apps/server/test/support/balance-trace.ts` spielt deterministische Szenarien: eine Arena mit 1.000 Gegnern und vier Operatoren sowie je eine Mission auf allen sieben Stufen mit vier Operatoren (Feuern, Nachladen, Waffenwechsel, Granaten, Stims, Nestkampf, Patrouillenalarm, Verstärkungsruf, Durchbrüche, Convicts). Jeder Tick fließt mit Schüssen, Events, Hordenzustand (Position, HP, Ziel, Angriffstimer), Spielerzustand, Nestern, Convicts und Albatross in einen SHA-256 ein. Die Fingerabdrücke wurden auf dem unveränderten Stand 7.1 (`2bef906`) aufgezeichnet.
3. **Schrittweise Migration** mit Typprüfung und Tests nach jedem Schritt.
4. **Vergleich nach der Migration:** Alle acht Fingerabdrücke sind bitgenau identisch. Damit liefern Treffer, Schaden, Kills, Nahkampf, Heilung, Munition, Spawns, Nest-Produktion, Rufe und Convict-Kampf dieselben Ergebnisse. Die Fingerabdrücke stehen als `GOLDEN_TRACES` in `balance.test.ts`. Das Metadatenfeld `balanceHash` ist dabei ausgenommen.
5. **Altwertevergleich:** `balance.test.ts` enthält die 7.1-Konstanten wörtlich und vergleicht sie mit der Registry. Die Missions-Snapshots aller Stufen werden gegen die alten Formeln geprüft (z. B. `Math.ceil(35 * 30 * faktor)`).
6. **Schabe:** Werte, Wire-Typ 0, Objektidentität von `ENEMY_TYPES[0]` und die SHA-256-Prüfsummen von `EnemyVisualLOD.ts`, `AgentMeshes.ts` und `HordeManager.ts` sind unverändert.
7. **Performance** (`npm run benchmark`, Ryzen 7 9700X, gleiche Maschine, gleicher Seed):

   | Szenario | 7.1 Ø / P95 (ms) | 7.2A Ø / P95 (ms) |
   | --- | --- | --- |
   | Arena, 1.000 Gegner, 4 Operator | 0,210 / 0,233 | 0,214 / 0,240 |
   | Mission FREEFALL, Sättigung 1.000 Gegner | 0,357 / 0,368 | 0,357 / 0,367 |
   | Komplette FREEFALL-Mission inkl. Extraktion und Rückkehr | 0,372 / 0,400 | 0,381 / 0,403 |

   Schüsse, Kills, Gegnerspitzen, Extraktion (4 Operator) und Rückkehr zum Carrier sind in beiden Ständen identisch. Die Unterschiede liegen im Messrauschen und weit unter dem Tickbudget von 33 ms.

## 7.2B: Gunplay-Tuning umgesetzt

Erledigt (siehe [COMBAT_BALANCE_7_2B](COMBAT_BALANCE_7_2B.md)): serverseitiges Recoil und Streuung, taktisches Nachladen mit ganzen Magazinen, Nahkampf mit Stagger, reduziertes Friendly Fire über einen zentralen Damage Resolver, Albatross-Nachschub, Waffen-Audio-Pipeline und Kampftelemetrie. Die Golden Traces wurden für diese gewollten Änderungen neu aufgezeichnet; der Trace-Treiber nutzt jetzt zusätzlich Nahkampf und hasht die Combat-Events (Laufzeitmessungen der Telemetrie sind ausgenommen).

Weiter offen:

1. Reichweitenabhängiger Schadensabfall. `effectiveRange` ist weiterhin eine harte Grenze.
2. Waffenabhängige Laufgeschwindigkeit in `movePlayer` und in der Client-Prediction.
3. Gegnerpanzerung beziehungsweise Resistenzen (`resistances` bleibt reserviert).
4. Aufgenommene Audio-Assets (Pipeline vorhanden, siehe [WEAPON_AUDIO](WEAPON_AUDIO.md)).
5. Time-to-Kill-Auswertung je Stufe aus den Playtest-Telemetriedaten.
