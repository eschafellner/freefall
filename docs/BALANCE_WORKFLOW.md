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

## Balance-Editor

```bash
npm run balance:edit   # dann http://localhost:5180 öffnen, beenden mit Strg+C
```

Ein lokales Werkzeug, mit dem man Waffen, Magazinvarianten, Kaliber, Munition, Panzerklassen, Gegner, Vorratskisten und PoI-Beute zentral ansehen und bearbeiten kann. Es läuft nur auf `127.0.0.1` und gehört nicht zum Spiel-Build oder Deployment. Code: `scripts/balance-editor/`.

- **Tabs:**
  - **Waffen**, **Kaliber & Munition** und **Gegner** zeigen die wichtigsten Werte als Tabelle. ▸ klappt einen Eintrag auf und zeigt alle Felder (Rückstoß, Streuung, Trefferzonen, Angriffe …).
  - **Waffen › Magazinvarianten:** kleines, erweitertes und Trommelmagazin je Waffe anlegen, ändern und entfernen, mit Modifikatoren wie längerer Nachladezeit (siehe [Magazinvarianten](#magazinvarianten-vorbereitet)).
  - **Versorgung & Beute:** Munitionsbox, Erste-Hilfe-Kasten und Granatenkiste an PoI, Albatross-Nachschub und Container, Heilstims, Granatenkapazität sowie Proben, Artefakte und Marks je Schwierigkeitsstufe. Eine Tabelle zeigt, wie viel Schuss jede Kiste je Waffe bringt.
  - **Analyse** zeigt Schüsse und Zeit bis zum Kill für jede Waffe (optional je Munition und Magazinvariante) gegen jede Panzerklasse jedes Gegners, Gegner-HP je Schwierigkeitsgrad sowie DPS, Gesamtmunition und Magazinschaden.
- **Abgeleitete Werte** (blaue Spalten) kommen aus dem Resolver und den gemeinsamen Schadensregeln (`combat/ballistics.ts`). Sie gelten für die Schwierigkeit und Distanz oben rechts. Gelbe Zahlen zeigen die Abweichung vom gespeicherten Stand.
- **Prüfung:** Jede Änderung läuft durch dieselbe Validierung wie `balance:check`. Fehler erscheinen unten rechts und am betroffenen Feld. Ungültige Stände lassen sich nicht speichern.
- **Speichern** (oder Strg+S) zeigt alle Änderungen als „alt → neu“ und schlägt ein neues Release-Label für `manifest.json` vor. Geschrieben wird nur der Text der geänderten Werte. Formatierung und Feldreihenfolge bleiben erhalten, der Git-Diff enthält also nur echte Wertänderungen.
- **Schreibschutz:**
  - `id`, `wireType` und `protected` lassen sich nur direkt in der Datei ändern.
  - Einträge anlegen oder entfernen geht im Editor nur bei Magazinvarianten und ihren Modifikatoren. Neue Waffen, Gegner oder Felder werden in den Dateien angelegt.
  - Gegner mit `protected: true` (die Schabe) sind nur lesbar.
- **Externe Änderungen:** Ändert jemand die Dateien, während der Editor offen ist, erscheint ein Hinweis. „Neu laden“ übernimmt den neuen Stand und behält die eigenen, noch nicht gespeicherten Änderungen.
- **Näherungen der Kill-Zeiten:**
  - Alle Projektile treffen, der erste Schuss fällt bei 0 s.
  - Nachladen dauert die volle Zeit (Einzelpatronen: Kammer plus ein Zyklus je Patrone).
  - Bei Gegnern mit Trefferzonen gibt es eine Spalte je Panzerklasse der Zonen.
  - ⛨ bedeutet: kein Durchschlag, nur Restschaden.

Nach dem Speichern gilt der übliche Ablauf: `npm test`, bei gewollten Änderungen die Golden Traces mit `npm run balance:trace` erneuern, Server neu starten. Mit `BALANCE_EDITOR_DATA=<Ordner>` arbeitet der Editor auf einer Kopie des Datenordners, `BALANCE_EDITOR_PORT` ändert den Port.

## Magazinvarianten (vorbereitet)

Seit 8.1B kann jede Waffe mit Magazin-Zuführung neben ihrem Standardmagazin (`magazineSize`) Varianten in `weapons.json › weapons[].magazineVariants` haben:

```json
"magazineVariants": [
  {
    "type": "drum",
    "displayName": "Trommelmagazin",
    "magazineSize": 100,
    "modifiers": [
      { "stat": "reloadSeconds", "operation": "multiply", "value": 1.4 },
      { "stat": "reserve", "operation": "add", "value": -4 }
    ]
  }
]
```

- **Typen:** `compact` (kleines Magazin), `extended` (erweitert), `drum` (Trommel), je höchstens einmal je Waffe.
- **Prüfregeln:**
  - Das kleine Magazin fasst weniger als das Standardmagazin, die beiden anderen mehr.
  - Die Trommel fasst mehr als das erweiterte Magazin.
  - Einzelpatronen-Waffen (VX-13) und Kipplaufwaffen (Kaibal 50) haben keine Varianten.
- **Wirkung:** Die Größe ersetzt `magazineSize`. Die Modifikatoren wirken auf der Ebene `equipment`. Erlaubt sind `reserve`, `maxReserve`, `reloadSeconds`, `roundsPerSecond`, `recoilPitch`, `recoilYaw`, `spreadHip` und `spreadAim`.
- **Reserve:** `reserve` zählt weiter ganze Magazine. Ein Trommelmagazin erhöht die Gesamtmunition deshalb stark, außer ein Modifikator senkt die Reserve. Der Editor zeigt das in der Spalte „Schuss gesamt“.
- **Auflösen:** `resolveWeapon(registry, id, ammoId, magazineModifiers(weapon, 'drum'))` liefert die effektive Waffe mit diesem Magazin. Die Registry löst beim Laden jede Variante einmal auf, ungültige Werte fallen also sofort auf.
- **Noch offen fürs Spiel:**
  - Auswahl im Carrier (Loadout-Auswahl, Freischaltung und Preis)
  - Übertragung der Wahl an den Server
  - Anzeige im HUD

  Bis dahin nutzen Server und Client immer das Standardmagazin.

## Wo Werte geändert werden

| Thema | Datei |
| --- | --- |
| Feuerrate, Magazin, Reserve, Nachladen, Reichweite, Kaliber und Lauf-Faktoren, Magazinvarianten | `weapons.json` |
| Kaliber (Schaden, Durchschlag, Abfall), Munitionssorten, Panzerklassen, Restschaden | `ammunition.json` ([AMMUNITION_SYSTEM](AMMUNITION_SYSTEM.md)) |
| Granaten, Heilstims, Loadout, Waffenwechsel, Albatross-Nachschub | `equipment.json` |
| Munitionsboxen, Erste-Hilfe-Kästen, Granatenkisten, Proben und Marks an PoI | `loot.json` |
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
  - weapons.json › weapons[0].reserve: Startreserve 9 übersteigt die Tragekapazität maxReserve 8
```

Dieselbe Validierung läuft beim Serverstart, im Client-Build und in `npm test`.

## Beispiel: eine Waffe tunen

Ziel: Die Kestrel soll 10 % mehr Schaden machen (26,4 statt 24) und 32 Schuss pro Magazin haben.

1. `weapons.json`, Eintrag `kestrel-ar-01` (der Schaden kommt seit 8.0A aus dem Kaliber; eine einzelne Waffe ändert ihn über den Lauf-Faktor, alle 5,55-Waffen über `ammunition.json › calibers`):

   ```json
   "ballistics": { "damageMultiplier": 1.1, "velocityMultiplier": 1 },
   "magazineSize": 32,
   ```

2. `manifest.json`: `"release": "8.0A-kestrel-1"`.
3. `npm run balance:check -- --explain` zeigt den neuen Hash und `weapon.kestrel-ar-01.damage: 26.400000000000002 → 26.400000000000002` (Basis = Kaliber × `damageMultiplier`).
4. `npm test` schlägt an zwei Stellen absichtlich fehl:
   - `balance.test.ts` › *weapon … values equal the 7.1 constants except the documented 7.2B changes*. Der Test hält den Stand vor der Migration fest. Für eine gewollte Änderung wird der Erwartungswert angepasst oder der Eintrag aus dem Altwertevergleich genommen.
   - `balance.test.ts` › *combat, spawn and damage results match the recorded 7.2B golden traces*. Der Simulations-Fingerabdruck ändert sich, weil Schaden andere Kills erzeugt. Neue Werte mit `npm run balance:trace` erzeugen, in `GOLDEN_TRACES` übernehmen und die Änderung im Commit begründen.
5. Die Schabe-Tests müssen grün bleiben. Schlagen sie fehl, wurde der geschützte Gegner verändert.

Ein Schaden von `-5`, eine Magazingröße von `0` oder `12.5`, eine Feuerrate über 30/s, mehr Startmagazine als `maxReserve` oder eine Reload-Timeline mit `removalAt ≥ insertionAt` werden abgewiesen.

## Neue Waffe registrieren

1. Eintrag in `weapons.json` mit neuer, stabiler ID (Kleinbuchstaben, Ziffern, `.`, `_`, `-`), `slot`, `category`, `caliberId`, `defaultAmmoId` (Munition desselben Kalibers), `ballistics`, allen Pflichtfeldern, `assets.visual` und `sounds.fire` (`rifle` oder `pistol`). Schrotkaliber werden noch abgewiesen.
2. Im Loadout `loadout.operator_standard` (`equipment.json`) `primaryWeaponId` oder `secondaryWeaponId` darauf zeigen lassen oder ein zweites Loadout anlegen. Eine Auswahl im Carrier gibt es noch nicht.
3. Für die Darstellung braucht der Client ein Modell zur Asset-ID (`apps/client/src/rendering/AssetRegistry.ts`, `rendering/weapons/`).
4. `npm run balance:check && npm test`.

Seit 7.2B haben alle Waffen eine Reserve aus ganzen Magazinen (`reserve`, Tragekapazität `maxReserve`), übertragen als `equipment.magazines.primary|secondary`. `sounds.fire` braucht ein Profil in `combat.json › audio.weapons`.

## Neuen Gegner registrieren

1. Gegebenenfalls Fraktion in `enemies.json › factions`.
2. Archetyp in `enemies.json › archetypes` mit neuer ID, `factionId`, dem **nächsten freien** `wireType` (lückenlos ab 0, bestehende Typen nie umnummerieren), `gameplay`, `ai.detectionRange` und `visualAssetId`. `protected` auf `false`, bis das Design freigegeben ist.
3. Einsetzen: als `spawnArchetypeId` eines neuen Nests (`structures.json`, gleiche Fraktion) oder als `swarm.json › arena.archetypeId`. Der Encounter Director spawnt den Archetyp des Haupt-Nests.
4. Der Hordenrenderer im Client zeichnet bisher nur die Schabe. Ein neuer Wire-Typ braucht eine eigene Darstellung. Die Dateien der Schabe sind geschützt und dürfen dafür nicht verändert werden.
5. `armorClass` (1 … 7) und `resistances.kinetic|explosive` festlegen. Treffer mit geringerem Durchschlag als die Panzerklasse machen nur 10 % Schaden ([AMMUNITION_SYSTEM](AMMUNITION_SYSTEM.md)).

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

## Code-Review 2026-11: Golden Traces neu aufgezeichnet

Die Fehlerbehebungen des Code-Reviews ändern Simulationsergebnisse bewusst. Die acht Fingerabdrücke wurden deshalb neu aufgezeichnet:

- Eingabepuffer: Ein Rückstand wird aktiv abgebaut (`MOVEMENT_INPUT.credit`, `drift`). Eingaben eines früheren Lebens bewegen nicht mehr, der Respawn leert die Warteschlange.
- Knockback erreicht genau `knockbackDistance`. Nach dem Stagger entfällt der zusätzliche Stillstands-Tick.
- Convicts und Operatorwaffen feuern im Mittel exakt mit `roundsPerSecond` (gebrochenes Feuerintervall statt Aufrunden auf ganze Ticks). Die P-01 schießt damit 4 statt 3,75 Schuss/s, die Kestrel bleibt bei 10 Schuss/s (3 Ticks).
- Taktische Nahschüsse gehen nicht mehr verloren, wenn der Zielpunkt auf Laufhöhe oder dahinter liegt.
- Arena: Kills durch Granate und Nahkampf verzögern das Nachfüllen wie Kills durch Schüsse.
- Gegner-Nahkampf läuft durch den Damage Resolver (ganze HP). Heute bleibt das wirkungslos, weil alle `enemyDamageMultiplier` 1 sind.

Weiter offen:

1. ~~Reichweitenabhängiger Schadensabfall~~: seit 8.0A je Kaliber vorhanden, für die bestehenden Waffen noch neutral. `effectiveRange` bleibt die harte Grenze.
2. ~~Waffenabhängige Laufgeschwindigkeit~~: entfällt (Entscheidung 2026-11). Waffen beeinflussen die Bewegung nicht; die Bewegungsbalance kommt später über Rüstungen ([Audit](TACTICAL_MOVEMENT_AUDIT.md#34-rüstungen-statt-waffen-als-bewegungsbalance)).
3. ~~Gegnerpanzerung beziehungsweise Resistenzen~~: seit 8.0A Panzerklassen 1 … 7 und Resistenzen je Schadensart.
4. Aufgenommene Audio-Assets (Pipeline vorhanden, siehe [WEAPON_AUDIO](WEAPON_AUDIO.md)).
5. Time-to-Kill-Auswertung je Stufe aus den Playtest-Telemetriedaten.

### 7.4A · Gegner-KI

Die Arena- und sieben Missions-Fingerprints wurden gezielt neu aufgezeichnet. Zielbindung und Lebenswechsel ändern den Verfolgungsverlauf. Die Korrekturen an Deckung, Kontaktpunkt, Stagger-Ende und Hinderniswegen ändern Positionen und einzelne Treffer. Die registrierten Schabenwerte für Gesundheit, Schaden, Reichweite und Cooldown bleiben gleich. Die Prüfsummen der geschützten Schaben-Dateien werden separat geprüft. [Gegner-KI und Ausgangsaudit](ENEMY_AI_ARCHITECTURE.md)

### 7.4B · Schwarmbewegung

Der Missions-Snapshot enthält `hordeAi` aus der validierten Registry. Neue Werte für Lenkung, Körperkontakt, Angriffsräume, Planungsbudgets und Recovery sind in der [Schwarm-Dokumentation](ENEMY_SWARM_BEHAVIOR.md) beschrieben. Änderungen an Positionsverläufen und Kontaktzeiten sind Teil des Meilensteins. Die Arena- und Missions-Golden-Traces wurden für diese gewollten Änderungen neu aufgezeichnet.

### 7.4C · Nahkampfphasen und Angriffssektoren

Der Missions-Snapshot enthält `meleeAttack` aus der Registry. Die Schabe beginnt ihren Angriff mit Windup, prüft tatsächlichen Kontakt im aktiven Zeitfenster und setzt die vorhandene Wiederholrate beim Start. Der Einschlag kann ausfallen, wenn der Operator die Reichweite oder den Schlagsektor rechtzeitig verlässt. Die Arena- und Missions-Golden-Traces wurden für die gewollten Positionierungs-, Timing- und Treffereignisänderungen mit `npm run balance:trace` neu aufgezeichnet. Die geschützten Gameplay-Werte der Schabe werden separat geprüft. [Nahkampf und Timing](ENEMY_COMBAT_BEHAVIOR.md)

## 7.4D · Director-Balance und Gameplay-Traces

Das Objekt `director` in `balance/data/swarm.json` führt Zustandstakte, Pressure-Gewichte, Wellenbudgets und Spawn-Prüfgrenzen. Die Schwierigkeits-Caps und bisherigen Durchbruchs-, Patrouillen- und Nestparameter bleiben Quellen für das übrige Spawn-Verhalten. Registry-Validierung und der Missionssnapshot greifen vor dem Start des Laufs. Die sieben Missions-Fingerprints aus `npm run balance:trace` wurden für die geänderte Positionsprüfung, Reihenfolge der Spawn-Produzenten und die replizierte Director-Phase aktualisiert. Der Arena-Fingerprint blieb identisch. [Director-Balance](HORDE_ENCOUNTER_PACING.md)

## 7.9A.2 · Rückstoßerholung der Kestrel

Die Kestrel beginnt nach drei Serverticks mit der Erholung. Dadurch ändern sich Schussbahnen und daraus folgende Treffer in Arena und Missionen. Die acht Gameplay-Fingerabdrücke und der Balance-Release wurden für diese Änderung aktualisiert. Die prozedurale Missionszusammensetzung verwendet den neuen Registry-Hash nach dem bestehenden Seed-Verfahren. [Vergleich und Wiederherstellung der Baseline](COMBAT_BALANCE_7_9A_2.md)

## 7.9B · Schabenangriffe und Wellenankunft

Der Registry-Release `7.9B` (Schema 2, Hash `390e375eec0bf943`) verlängert den Schaben-Windup von 11 auf 14 Ticks und die Mindestdauer von PEAK von 120 auf 210 Ticks. Die acht Gameplay-Fingerabdrücke erfassen die Folgen des neuen Angriffstimings. Der versionierte 7.9A.2-Snapshot dient als Referenz für den reproduzierbaren Vorher-nachher-Vergleich. [Messung und Abnahme](MILESTONE_7_9B_REPORT.md)
