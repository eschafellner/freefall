# FREEFALL · Biom-Phase C: Felsgruppen und Landmarken (Weltgenerator v2)

Phase C ändert die physische Welt. `WORLD_GENERATOR_VERSION` und die Version des Planetprofils stehen jetzt auf 2. Damit erhalten alle Welten neue IDs, und Pläne aus v1 werden beim Wiederherstellen abgelehnt.

## Änderungen

- **Mehr Solids:** Die Ebene hat jetzt 60 statt 34, die Wüste 66 statt 40 und die Eiswelt 70 statt 42. Der Wald behält 500.
- **Gruppen statt Streuung:** Sechs Gruppenzentren pro Welt. Außer den drei ersten großen Slots fallen etwa 70 % der Kandidaten in 5–35 m um ein Zentrum, der Rest bleibt verstreut. In Gruppen beträgt der Mindestabstand von Kante zu Kante 4 m statt 6 m, bleibt also begehbar. Im Wald bleibt die rauschgesteuerte Bestandsverteilung unverändert.
- **Benannte Landmarken** (`addLandmarks` in `WorldGenerator.ts`): Für jedes Teil gelten dieselben Reservierungs- und Abstandsregeln. Passt ein Teil nicht, entfällt es.

| Planet | Landmarke |
| --- | --- |
| Grüne Ebene | **Hügelgruppe:** ein großer Block mit Ring aus sechs Felsen auf der höchsten freien Kuppe. **Baumgruppen:** zwei Haine aus je acht Laubbäumen. |
| Wüste | **Felsnadeln:** fünf 4,5–8 m hohe Sandsteinsäulen auf einer Anhöhe. **Dünenkamm:** sieben flache, langgezogene Felsbänke in einer Linie. Dazu wie bisher der Sandsteinbogen. |
| Eiswelt | **Eisformationen:** zwei Kronen aus einem 6,5–8,5 m hohen Zentralblock und sechs Eisblöcken, eine auf einer Kuppe, eine in einer Senke. |
| Wald | **Alter Baum:** ein Riesenstamm mit 1,45 m Radius in der freiesten Lichtung, im Renderer etwa 9 m über dem Kronendach. **Felsformation:** ein Moosfelsring. |

## Prüfung

- `procedural-world.test.ts`: 100 Seeds je Planet erzeugen begehbares Terrain und gültige Missionen, einschließlich Navigations- und Erreichbarkeitsprüfung des Missionsgenerators. Neu sind Fixture-IDs für v2 und ein Gruppen- und Landmarkentest (der Median des Abstands zum nächsten Solid liegt unter 20 m, das Budget wird durch Landmarken überschritten).
- Missionsmatrix: 77 eingabegesteuerte Läufe (`measure-mission-balance.ts`, Relaisverteidigung, Relaiskette, Nestsäuberung, 1–4 Spieler, beide Extraktionen). Verglichen wurde mit demselben Code-Stand vor Phase C.
  - 76 Läufe enden gleich.
  - Die Missionsdauer ändert sich im Mittel um +0,5 s, die Spanne reicht von −46 bis +43 s je nach neuer Felslage. Mittel je Planet: Ebene −7,0 s, Wüste +0,2 s, Eis +2,6 s, Wald +6,1 s.
  - Ein Lauf kippt: Der 18-Minuten-Ausdauertest im Wald (Welt 63, vier Spieler, Albatross) verliert das Team auf dem Weg zur Extraktion nach 1.181 s. Vorher wurde nach 1.177 s extrahiert. Die gescriptete Route wurde 41 m länger (384 statt 425 m). Das Szenario lag schon vorher an der Belastungsgrenze.
- `npm run balance:check` ist OK. Die Balance-Daten selbst bleiben unverändert.
