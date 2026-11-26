# Kaibal 50: Doppellauf mit Kipplauf

Release `8.2B`, Schema 5. Primärwaffe der neuen Kategorie `double-barrel` mit eigener Zuführung `break` (Kipplauf). Das Standard-Loadout ist unverändert. Verwandte Systeme: [LOADOUT_SYSTEM](LOADOUT_SYSTEM.md) · [SUBMACHINE_GUNS](SUBMACHINE_GUNS.md) · [WEAPON_VISUAL_SYSTEM](WEAPON_VISUAL_SYSTEM.md)

## Werte (`weapons.json › kaibal-50`)

| Wert | Kaibal 50 |
| --- | --- |
| Slot / Kategorie | primary / double-barrel |
| Kaliber / Munition | 7,77 × 50 mm (`caliber.7-77x50`) / Vollmantel: 58 Schaden (seit 8.2C, vorher 38), Durchschlag 4 (Hoch) |
| Schadensabfall | voll bis 110 m, bis 220 m auf 70 % |
| Feuerrate | 3,333334 Schuss/s (200/min): zweiter Lauf nach genau 9 Ticks (0,3 s) |
| Läufe / Reserve | 2 / 90 lose Patronen (Tragekapazität 90) |
| Nachladen | 0,8 s Kipplauf, Timeline 0,3 / 0,7 |
| Reichweite | 90 m |
| Rückstoß | 4,2° Hochschlag je Schuss, 0,05° seitlich, keine Dauerfeuer-Steigerung, schnelle Erholung (16°/s) |
| Streuung Hüfte / Zielen | 1,2° / 0,12° |
| Ton | `double` |

Die Feuerrate ist mit 3,333334 statt 3,33333 angegeben. Mit dem gerundeten Wert läge der Schussabstand knapp über 9 Ticks, und der zweite Lauf würde erst nach 10 Ticks feuern. Startwerte für Playtests, einstellbar im Balance-Editor.

## Zuführung `break` (Kipplauf)

`feed: { "type": "break" }`, `magazineSize` ist die Zahl der Läufe (höchstens 4, die Registry prüft das), keine Kammerpatrone und keine Magazinvarianten.

- `reserve`/`maxReserve` zählen **lose Patronen**, wie bei `single` (`reserveInRounds(feed)` in `resolver.ts`).
- Ein Nachladevorgang durchläuft die Phasen des Magazinwechsels (`RELOAD_START → MAGAZINE_REMOVAL → MAGAZINE_INSERTION → RELOAD_COMPLETE`). Die Transaktion bei `insertionAt` füllt jeden leeren Lauf aus der Reserve auf: `min(Läufe − Munition, Reserve)`. Eine verbliebene Patrone bleibt, es geht nichts verloren.
- Nachschub am Albatross und Munitionsboxen geben wie bei Flinten den Gegenwert der Magazine in Patronen.
- HUD: `1 / 2 · 88 PAT`, Fortschritt „Kipplauf öffnen“, „Patronen laden“, „Kipplauf schließen“. Kein Hinweis auf verlorene Schuss. Im Ausrüstungsmenü heißt das Feld „Läufe“, die Reserve „Patr.“.

## Modell (`apps/client/src/rendering/weapons/Kaibal50.ts`)

Läufe nebeneinander (Querflinte), etwa 1,06 m lang. Prozedural mit `ModelParts`, eigener Entwurf.

- **Fest:** Stahlbasküle mit dunklen Seitenplatten, Scharnierbolzen, Abzugsbügel mit zwei Abzügen, Sicherung, Schaft mit Halbpistolengriff (Seitenprofil über `ModelParts.profile`), Fischhaut und Gummikappe. Der Öffnungshebel sitzt am Optik-Socket.
- **Laufgruppe (`slide`):** zwei 60-cm-Läufe auf einem Monoblock mit Haken, Laufschiene mit Expressvisier und Messingkorn, Laufband, Vorderschaft mit Fischhaut.
- **`magazine`:** zwei Patronen (Messinghülse, Kupfergeschoss) in der Stützhand. **`spent`:** zwei leere Hülsen für den Auswerfer.

## Animation (`KAIBAL50_HANDLING`, Aktion `break`)

| Bruchteil von 0,8 s | Ablauf |
| --- | --- |
| 0,02–0,16 | Läufe kippen um den Scharnierbolzen um 0,62 rad nach unten, die Hand bleibt am Vorderschaft |
| 0,02–0,22 | Auswerfer werfen beide Hülsen nach hinten oben |
| 0,04–0,26 | Stützhand greift zum Gürtel |
| 0,26–0,66 | Patronen erscheinen in der Hand und wandern in die offenen Kammern |
| 0,70 | Patronen sitzen (Server: `MAGAZINE_INSERTION`) |
| 0,72–0,90 | Hand zurück zum Vorderschaft, Läufe schließen (0,76–0,90) |

- Schüsse wechseln zwischen den Läufen: erst rechts, dann links. Der `Muzzle`-Socket springt um `barrelSpacing`, Mündungsfeuer und Leuchtspur kommen aus dem richtigen Lauf. Nach dem Nachladen beginnt es wieder rechts.
- `ejectsPerShot: false`: Beim Schuss fliegen keine Hülsen (`WeaponFireEffects`), nur beim Öffnen.
- Hochschlag: `recoil.visualKick` 2,2 und `cameraKick` 1,4 heben Waffe und Blick deutlich an.

## Ton

Es gibt noch keine eigenen Aufnahmen. `double` nutzt den Kestrel-Knall mit Rate 0,8. Das P-01-Klicken steht fürs Öffnen, das P-01-Einsetzgeräusch für die Patronen und der Kestrel-Abschluss für das Schließen der Läufe. Das Profil `double` steht in `combat.json › audio.weapons`.

## Freischaltung

`weapon.kaibal-50`: `choice`, ab Level 8, 3.000 SKR.

## Tests und Playtest

- `apps/server/test/kaibal-loadout.test.ts`: Werte, Rückstoßcharakter, zweiter Schuss nach 9 Ticks, Nachladen in 24 Ticks, Auffüllen aus loser Reserve ohne Verlust, letzte Patrone, Registry-Prüfungen, Freischaltung.
- `apps/client/test/kaibal-visual.test.ts`: Abmessungen, Öffnen und Schließen, Hülsen, Patronen in der Hand und in der offenen Kammer, Laufwechsel der Mündung, Modellwahl am Operator.
- `scripts/playtest-weapons.mjs`: Freischalten, Auswahl im Carrier, Schießen und Nachladen in der Arena.

## Offen

1. Eigene Tonaufnahmen (Doppelbüchsenknall, Öffnen, Schließen).
2. Ein Nachlade-Clip für das Soldaten-GLB.
3. Optional: beide Läufe gleichzeitig abfeuern (Doppelschuss) als eigene Eingabe.
