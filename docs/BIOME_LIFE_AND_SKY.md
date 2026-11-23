# FREEFALL · Biom-Phase E: Fremdes Leben und Himmel

Die Planeten sollen fremd wirken. Dafür gibt es eigenes Tierleben mit leuchtenden Akzenten und Himmelskörper, die es auf der Erde nicht gibt. Alles läuft nur im Client, hat keine Kollision und wird vom Server nicht simuliert.

## Himmel (`Lighting.ts`, `celestial` im Atmosphärenprofil)

Eine Himmelsebene zeichnet über dem gebackenen Himmel:
- Sonnenscheiben mit Halo. Hinter der gebackenen Wolkendecke (eigene Coverage-Textur) und tiefem Dunst verblassen sie.
- Monde und Gasriesen mit Licht der Hauptsonne, Wolkenbändern und einem schrägen Ring, dessen vordere Hälfte den Planeten verdeckt.

Die Sterne drehen sich mit Tageszeit und Sonnenstand. Wetterbewölkung schleiert sie zusätzlich ein.

| Planet | Himmel | Licht |
| --- | --- | --- |
| Eiswelt (`ice.small-sun.v2`) | Eine kleine, ferne, weiße Sonne (Scheibenradius 0,0032 rad, kleiner als die Erdsonne). Die Wolkendecke ist lockerer, damit sie durchscheint. | Kälteres Licht und härtere Schatten (Radius 2,1 statt 3,45). |
| Wüste (`desert.three-suns.v2`) | Drei Sonnen: ein heißer Hauptstern, ein großer orangefarbener Begleiter tief im Westen und ein winziger blauweißer Zwerg. | Die Begleiter sind eigene Richtungslichter ohne Schatten (0,48 und 0,24), dadurch fällt Licht aus mehreren Richtungen. Die Hauptsonne liegt bei 1,8, die Belichtung bei 0,94. |
| Grüne Ebene | Großer Ringplanet tief am Himmel, gegenüber der Sonne | Unverändert |
| Wald | Zwei Monde | Unverändert |

## Leben (`environment/AmbientLife.ts`, `LIFE_PROFILES`)

| Planet | Arten |
| --- | --- |
| Grüne Ebene | **Segelrochen:** violettgraue Mantas mit türkisen Flügelspitzen, die in 22–42 m Höhe kreisen. **Schwebeblasen:** durchscheinende Gasblasen mit leuchtendem Kern und schwingenden Tentakeln, die mit dem Wind treiben. **Schwirrer:** violett glimmende Schwärme im Gras. |
| Wüste | **Hitzesegler:** langflügelig, in 40–70 m in der Thermik. **Funkenkäfer:** amberfarbene Schwärme an Büschen. **Staubteufel:** wandernde Wirbelsäulen, die langsam ein- und ausblenden. |
| Eiswelt | **Frostrochen:** blasse Mantas, die tief über das Eis gleiten. **Frostmotten:** treibende, kalt leuchtende Punkte. |
| Wald | **Vierflügler:** schnelle Gleiter mit zwei Flügelpaaren zwischen den Stämmen. **Leuchtsporen:** türkis, bis 6 m hoch. Fallende Nadeln nur unter dem Kronendach. Schwebeblasen. |

Technik: Flieger sind instanzierte Meshes, deren Flügelschlag der Vertex-Shader erzeugt. Schwärme bleiben in der Nähe der Kamera und wandern nach. Sporen, Nadeln und Staubteufel sind Punktwolken mit Shader-Bewegung. Die Grafikstufe skaliert die Dichte (Low 40 %, Medium 75 %, High 100 %). Ab 70 m über dem Boden (Absprung) ist alles ausgeblendet.

Prüfung: `environment-detail.test.ts` und die Lichttests (`time-of-day-light`, `weather-rendering`, `planet-atmosphere`) für alle Tageszeiten. Sichtprüfung: `scripts/playtest-biome-horizon.mjs` mit Himmelsansichten (`*-sky-sun`, `*-sky-star*`, `*-sky-body*`).
