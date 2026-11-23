# Loadout, VX-13 Cerberus und Einzelpatronen-Nachladen

Release `8.1A`. Operatoren stellen ihre Ausrüstung im Carrier an der Station **Ausrüstung** zusammen. Erste neue Waffe ist die Vorderschaftrepetierflinte **VX-13 Cerberus** (Kaliber 13) mit Einzelpatronen-Nachladen. Das Standard-Loadout und seine Werte sind unverändert, die Golden Traces sind identisch. Grundlagen: [AMMUNITION_SYSTEM](AMMUNITION_SYSTEM.md).

## VX-13 Cerberus (`weapons.json › vx-13`)

| Wert | VX-13 |
| --- | --- |
| Slot / Kategorie | primary / shotgun |
| Kaliber / Munition | Kaliber 13 (`caliber.13g`) / Schrot (`ammo.13g.buckshot`) |
| Schaden | 8 Kugeln × 12, Kegel 2,6°, Durchschlag 2 (Niedrig) |
| Schadensabfall | voll bis 12 m, linear bis 35 m auf 20 % |
| Feuerrate | 1,4 Schuss/s (84/min, Repetierbewegung) |
| Kapazität | 9 im Röhrenmagazin + 1 im Lauf = 10 |
| Reserve | 80 lose Patronen (Tragekapazität 80) |
| Nachladen | Ansetzen 0,35 s, dann 0,52 s je Patrone; leere Waffe: erste Patrone direkt ins Patronenlager, 0,8 s |
| Reichweite | 40 m |
| Rückstoß | 3,2° Hochschlag, keine Dauerfeuer-Steigerung, schnelle Erholung |

Alle Werte sind Startwerte für Playtests.

## Zuführung (`feed`)

Jede Waffe hat ein Feld `feed`:

- `{ "type": "magazine", "chamberRounds": 0 }`: Magazinwechsel wie bisher. `reserve`/`maxReserve` zählen **ganze Magazine**; der Rest im alten Magazin geht verloren. Mit `chamberRounds: 1` bleibt bei einem taktischen Nachladen die Patrone im Lauf (n + 1).
- `{ "type": "single", "chamberRounds": 1, "startSeconds": 0.35, "chamberSeconds": 0.8 }`: Einzelpatronen. `reserve`/`maxReserve` zählen **lose Patronen**, `reloadSeconds` und `reloadTimeline` beschreiben **einen Patronenzyklus**.

`reserveMagazines`/`maxReserveMagazines` heißen seit 8.1A `reserve`/`maxReserve`. `EffectiveWeapon.capacity` = `magazineSize` + `chamberRounds`. Netzwerkseitig bleibt das Feld `equipment.magazines`; es enthält die Reserve in der Einheit der Waffe. Der Nachschub am Albatross gibt Schrotflinten je gewährtem Magazin `magazineSize` Patronen (bei der VX-13: 2 × 9 = 18 je Ladung, gedeckelt auf 80).

## Einzelpatronen-Nachladen (Server, `systems/combat.ts`)

```text
RELOAD_START (startSeconds) → SHELL_LOADING ──insertAt──▶ SHELL_INSERTION ──until──▶ nächster Zyklus … → READY
```

- Pro Zyklus wird genau eine Patrone von der Reserve in die Waffe übertragen (`SHELL_INSERTION`, Combat-Event `reload`).
- Der Vorgang endet, wenn die Waffe voll oder die Reserve leer ist.
- Ein **neuer** Druck auf Feuern beendet das Nachladen zwischen zwei Patronen. Eingelegte Patronen bleiben, die Patrone in der Hand wird nicht geladen. Wer bei leerer Waffe Feuern gedrückt hält, löst das automatische Nachladen aus, ohne dass es nach der ersten Patrone gleich wieder abbricht. Erst Loslassen und erneutes Drücken schießt.
- Waffenwechsel, Sprint und andere Unterbrechungen behalten alle bereits eingelegten Patronen.
- `ReloadState.started`/`until` beschreiben den aktuellen Zyklus. Animation, HUD-Fortschritt und Ton laufen pro Patrone.

## Schrot (Server)

`fireWeapon` würfelt Streuung und Rückstoß einmal pro Schuss. Bei `projectilesPerShot > 1` verfolgt `tracePellet` jede Kugel als eigenen Strahl: Treffer, Schaden mit Abfall und Panzerung, Kills und Einschläge gelten je Kugel. Die Telemetrie zählt einen Schuss und höchstens einen Treffer. Das `ShotEvent` ist die erste Kugel; `pellets` enthält die übrigen (`shotRays(shot)` liefert alle Strahlen). So gibt es einen Mündungsblitz und einen Schussknall, aber acht Leuchtspuren und Einschläge.

## Loadout-Auswahl

`LoadoutSelection` (`definitions.ts`): `primaryWeaponId`, `secondaryWeaponId`, `meleeId`, `grenadeId` (Taktische Ausrüstung), `medicalId`, `backpackId`, `armorId`.

- **Daten:** Rucksäcke (`equipment.json › backpacks`) und Rüstungen (`armors`) haben `modifiers` auf der Ebene `equipment`. Rucksäcke dürfen Waffen- und Ausrüstungswerte ändern, mit `primary.<stat>`/`secondary.<stat>` für die Waffe im jeweiligen Slot, z. B. `primary.maxReserve`. Rüstungen dürfen nur Operatorwerte ändern (`operator.slide.*`; Bewegungsbalance über Rüstungen). Heute gibt es je eine Standardoption ohne Wirkung.
- **Auflösung:** `resolveSelection(registry, selection)` liefert das effektive Loadout; `resolveLoadout(registry, presetId)` nutzt dieselbe Funktion für die Vorgaben aus `loadouts`. Die Registry löst beim Start jede Waffe, jeden Rucksack und jede Rüstung einmal im Standard-Loadout auf.
- **Prüfung am Server** (`FreefallRoom`, Nachricht `loadout`):
  1. `validateLoadoutSelection` prüft Form, bekannte IDs und die Slots der Waffen.
  2. Mit Accounts müssen alle Teile freigeschaltet sein (`missingLoadoutUnlocks`). Die VX-13 und die Standardteile sind Grundausstattung.
  3. `Battlefield.setLoadout` wechselt das Loadout. In Missionen geht das nur in `CARRIER_HUB` und `MISSION_SELECTION`. Der Operator wird vollständig neu ausgerüstet.
  4. Antwort an den Client: `{ selection }` oder `{ error }`.
- **Netzwerk:** `PlayerState.weapons` trägt die Waffen-IDs jedes Operators (Modell, Ton, HUD der Mitspieler). `sync-state` schickt dem Client sein aktuelles Loadout.
- **Client:** Die Station „AUSRÜSTUNG“ im Carrier öffnet mit `E` das Menü (`ui/LoadoutPanel.tsx`). Es hat Auswahlfelder für Primär- und Sekundärwaffe, Nahkampfwaffe, Taktische Ausrüstung, Medizin, Rucksack und Rüstung, dazu Werte je Waffe (Kaliber, Schaden, Durchschlag, Feuerrate, Magazin, Reserve, Nachladen, Reichweite). Das zuletzt angenommene Loadout liegt im `localStorage` und wird beim Betreten des nächsten Raums wiederhergestellt.

## Darstellung

- Prozedurales Modell `rendering/weapons/Cerberus.ts`: Lauf über Röhrenmagazin, Vorderschaft als bewegliches Teil (Repetierbewegung nach jedem Schuss), Patronenhalter am Gehäuse. Beim Nachladen hält die Stützhand eine Patrone.
- Ton: Es gibt noch keine eigenen Aufnahmen. Der Schuss nutzt den Kestrel-Knall, verlangsamt auf 0,7. Dazu kommen ein synthetisches Repetiergeräusch und ein Klicken je eingelegter Patrone (`WeaponAudioCatalog.ts › shotgun`). Eigene Aufnahmen sollen das ersetzen.
- HUD: `9 / 10 · 80 PAT` statt `MAG`; „Patrone laden“ als Nachladefortschritt und der Hinweis, dass Feuern das Nachladen beendet.

## Tests und Playtest

- `apps/server/test/shotgun-loadout.test.ts`: Werte, Schrottreffer, Zyklen bis 9 + 1, Kammerladung bei leerer Waffe, Abbruch durch Feuern, gehaltener Abzug, Waffenwechsel, Kammerpatrone bei Magazinwaffen, Validierung und Carrier-Regel.
- `scripts/playtest-loadout.mjs` (Playwright): Station öffnen, VX-13 wählen und übernehmen, dann in der Arena schießen (8 Strahlen) und nachladen.

## Offen

1. Eigene Tonaufnahmen und ein Nachlade-Clip für die Flinte; heute läuft die Gewehr-Nachladeanimation pro Patrone.
2. Weitere Rucksäcke und Rüstungen mit Wirkung (Tragekapazität, Bewegung) und eine Panzerklasse für Operatoren.
3. Munitionssorten-Auswahl im Menü (Teilmantel, Flintenlaufgeschoss für Kaliber 13).
4. Waffen und Teile über Levelstufen freischalten statt als Grundausstattung.
