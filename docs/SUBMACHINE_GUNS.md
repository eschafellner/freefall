# Maschinenpistolen: MP-99 und Viktor 55

Release `8.2A`, Schema 5. Zwei Primärwaffen der neuen Kategorie `submachine-gun`, freischaltbar im Arsenal. Das Standard-Loadout ist unverändert. Grundlagen: [LOADOUT_SYSTEM](LOADOUT_SYSTEM.md) · [AMMUNITION_SYSTEM](AMMUNITION_SYSTEM.md) · [WEAPON_VISUAL_SYSTEM](WEAPON_VISUAL_SYSTEM.md)

## Werte (`weapons.json`)

| Wert | MP-99 (`mp-99`) | Viktor 55 (`viktor-55`) |
| --- | --- | --- |
| Slot / Kategorie | primary / submachine-gun | primary / submachine-gun |
| Kaliber / Munition | 10 mm (`caliber.10mm`) / Vollmantel | .55 (`caliber.55`) / Vollmantel |
| Schaden | 21,6 (Kaliberwert, × 1) | 32 (Kaliberwert, × 1) |
| Schadensabfall | voll bis 48 m, bis 90 m auf 60 % | voll bis 30 m, bis 70 m auf 50 % |
| Feuerrate | 12 Schuss/s (720/min) | 18,33333 Schuss/s (1.100/min) |
| Magazin / Reserve | 40, 8 Magazine (Tragekapazität 8) | 35, 8 Magazine (Tragekapazität 8) |
| Nachladen | 2,2 s, Timeline 0,16 / 0,56 | 1,4 s, Timeline 0,14 / 0,60 |
| Reichweite | 50 m | 36 m |
| Rückstoß vertikal (je Schuss) | 0,20° | 0,15° × 0,6 = 0,09° |
| Rückstoß horizontal (je Schuss) | 0,10° | 0,30° × 2 = 0,60° |
| Rückstoß Dauerfeuer | +2 % je Schuss bis × 1,3, max. 4,5° | +4 % je Schuss bis × 1,8, max. 6° (seitlich ±3°) |
| Streuung Hüfte / Zielen | 1,1° / 0,3° | 1,3° / 0,35° |
| Ton | `smg` | `smg-heavy` |

Zum Vergleich: Die Kestrel hat 0,36° vertikal, 0,22° horizontal und 240 Schaden/s. MP-99: 259 Schaden/s. Viktor 55: 587 Schaden/s, mit vollem Kaliberwert laut Vorgabe. Ihre Grenzen sind der starke seitliche Rückstoß, der Abfall ab 30 m und ein Magazin, das nach knapp 2 s leer ist. Die seitliche Auslenkung ist in `applyShotRecoil` auf die Hälfte von `maxClimbDegrees` begrenzt. Deshalb hat die Viktor 55 trotz geringem Hochschlag `maxClimbDegrees: 6`. Bei 30 Hz ergibt 1.100/min einen gebrochenen Schussabstand von 1,64 Ticks. `nextShotAt` hält den Durchschnitt exakt. Alle Werte sind Startwerte für Playtests und im Balance-Editor einstellbar.

## Freischaltung (`unlocks.ts`)

| ID | Level | Preis |
| --- | ---: | ---: |
| `weapon.mp-99` | 5 | 4.500 SKR |
| `weapon.viktor-55` | 7 | 6.000 SKR |

Beide sind `choice`: Sie werden im Arsenal gekauft. Eine Migration ist nicht nötig, weil kein Account sie vorher besitzen konnte.

## Modelle (`apps/client/src/rendering/weapons/`)

Prozedural mit `ModelParts` und dem gemeinsamen Waffenmaterial. Ursprung am Griff, −Z nach vorn, Meter. Länge mit ausgezogenem Schaft je ~0,66 m (Kestrel ~0,88 m). Eigene Entwürfe ohne Drittanbieter-Ressourcen.

- **MP-99** (`Mp99.ts`): kastenförmiges Stahlgehäuse mit Schiene und kompaktem Reflexvisier, Polymer-Unterteil, belüfteter Laufmantel mit Kompensator, gerades 40-Schuss-Magazin vor dem Abzugsbügel, senkrechter Vordergriff, Schiebeschaft mit zwei Stangen.
- **Viktor 55** (`Viktor55.ts`), angelehnt an die Bauform „Vektor 45“: hohes Gehäuse mit durchgehender Schiene und tief liegendem Lauf in Höhe der Griffhand, Nase fällt zum Laufmantel ab. Das schräge Unterteil („Kinn“) vor dem Magazinschacht nimmt den nach unten laufenden Verschluss auf. Dazu ein gerades 35-Schuss-Magazin direkt vor dem Abzugsbügel, Klappvisier, kurzer Vordergriff und ein skelettierter Klappschaft. Die schrägen Flächen nutzen `ModelParts.profile`: ein Seitenprofil-Polygon, das über die Breite extrudiert wird.

## Animationen (`WeaponVisualController`, `WeaponProfile`)

Jedes Modell liefert ein `WeaponProfile` mit Sockets und Choreografie. Die Bruchteile beziehen sich auf `reloadSeconds` und folgen derselben Timeline wie der Server.

| | MP-99 (`MP99_HANDLING`) | Viktor 55 (`VIKTOR55_HANDLING`) |
| --- | --- | --- |
| Schuss | Verschluss im rechten Auswurffenster und linker Spannhebel fahren 2,2 cm zurück, zurück in 50 ms | 1,8 cm, zurück in 40 ms, vor dem nächsten Schuss (55 ms) |
| Magazin | fällt bei 0,16 heraus (27 cm tief), sitzt bei 0,56 | fällt bei 0,14 heraus, sitzt bei 0,60 |
| Stützhand | Vordergriff → Magazin → **Spannhebel**: greifen 0,60–0,68, zurückziehen 0,68–0,74, loslassen 0,77 (Verschluss schnellt vor), zurück zum Vordergriff 0,79–0,90 | Vordergriff → Magazin → Vordergriff |
| Verschluss beim Nachladen | vorn, bis die Hand ihn spannt | offen ab 0,10, Fanghebel lässt ihn bei 0,66 vor |

Der `PlayerVisualController` hält alle Primärwaffen außer der Kestrel in `primaries` (VX-13, MP-99, Viktor 55) und zeigt die Waffe, die `PlayerState.weapons.primary` nennt. Rückstoßkick (`recoil.visualKick`) und Verschlussbewegung gelten für jede sichtbare Primärwaffe. Mit importiertem Soldaten-GLB hängen alle am selben `PrimaryWeapon`-Knoten.

## Ton

Es gibt noch keine eigenen Aufnahmen. `smg` nutzt den P-01-Knall mit Rate 1,06, `smg-heavy` mit 0,9 für die schwerere Unterschall-Patrone .55. Beide verwenden die Kestrel-Geräusche für Magazin raus und rein sowie für den Abschluss (Spannhebel bzw. Fanghebel). Damit bei 720 und 1.100 Schuss/min keine Schüsse wegfallen, während frühere Ausklänge noch laufen, dürfen beide Bänke 8 statt 4 Stimmen je Schütze halten (`WeaponRecordings.voices`, `VoiceBudget.reserve(perOwner)`). Das Gesamtlimit von 28 Stimmen bleibt. `combat.json › audio.weapons` hat die Profile `smg` und `smg-heavy`.

## HUD

Eigene Silhouetten in `HudIcons.tsx` (`mp-99`, `viktor-55`). Das Ausrüstungsmenü listet beide automatisch unter „Primärwaffe“.

## Tests und Playtest

- `apps/server/test/smg-loadout.test.ts`: Werte laut Vorgabe, Rückstoßcharakter im Vergleich zur Kestrel, Dauerfeuer 12 bzw. 18–19 Schuss in 1 s, Nachladen 66 bzw. 42 Ticks, Freischaltung (Level, Preis, fehlende Freischaltung), Slot-Prüfung.
- `apps/client/test/smg-visual.test.ts`: Mündung am vorderen Modellende, Abmessungen, Modellwahl am Operator, Verschluss pro Schuss, Magazin und Stützhand auf der Server-Timeline, Spannhebel (MP-99) und Fanghebel (Viktor 55).
- `apps/client/test/weapon-audio.test.ts`: Das Stimmenbudget je Bank deckt die Kadenz.
- `scripts/playtest-weapons.mjs` (Playwright, auch Kaibal 50): Freischalten, im Carrier wählen, in der Arena feuern und nachladen, Nahaufnahmen.

## Offen

1. Eigene Tonaufnahmen für beide Waffen.
2. Nachlade-Clips für das Soldaten-GLB; heute bewegt ein importierter Clip die Hände, das prozedurale Magazin folgt der Timeline.
3. Magazinvarianten (z. B. 60er-Trommel für die MP-99) über `magazineVariants`, sobald Carrier und Simulation sie anbieten.
