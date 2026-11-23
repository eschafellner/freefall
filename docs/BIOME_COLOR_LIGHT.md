# FREEFALL · Farben, Licht, Dämmerung, Flieger und Wolkenschatten

Nachschärfung nach dem Playtest von Phase E.

## Farben und Tonemapping
- `ToneMapping.ts`: `CustomToneMapping` ist ACES Filmic mit anschließender Sättigung ×1,2. ACES allein entsättigt stark, und die Planeten wirkten ausgewaschen. Die Lichterkurve von ACES bleibt erhalten. Das Tonemapping wirkt im direkten Render-Pfad (Medium ohne Post-Processing) und über den OutputPass. `mapFogToDisplay` wendet denselben Sättigungsschritt auf die Nebelfarbe an.
- Natürliche Paletten (Bodenschichten, Bodendetails, mittelgroße Objekte, Felsen, Baumkronen, Ablagerungen) sind um ×1,2 in der HSL-Sättigung angehoben, Kriegsspuren um ×1,12. Gegner, Markierungen und das HUD bleiben unverändert.

## Farbstimmung pro Planet (Licht, Fülllicht und Nebel)

| Planet | Stimmung |
| --- | --- |
| Grüne Ebene | Klarer, blauer Himmelsanteil, olivfarbener Bodenreflex, etwas mehr Sonne und weniger Fülllicht für mehr Kontrast |
| Wüste | Bernsteinfarbene Schatten: warmer Sandreflex von unten, staubig-warmer Himmel |
| Eiswelt | Türkise Schatten aus kaltem Himmel und blauem Eisreflex |
| Wald | Grün gefiltertes Fülllicht und moosiger Bodenreflex |

Die Belichtung am Tag ist um etwa 7–8 % höher. Die Testgrenze für die Belichtung liegt jetzt bei 1,18.

## Morgen- und Abendrot
- Kräftigere Presets mit rosa-orangem bzw. tief orangerotem Sonnenlicht, stärkerem Horizontglühen, violettblauem bzw. indigofarbenem Zenit und wärmerem Dunst.
- Die Wolkenunterseiten leuchten auf der Sonnenseite in der Glühfarbe (Coverage-Textur im Himmels-Blend-Shader).
- Der Dunst hängt von der Blickrichtung ab: Zur tiefen Sonne glüht er warm, auf der Gegenseite bleibt er kühl.

## Flieger
- Halbe Anzahl (Ebene 8, Wüste 4, Eis 4, Wald 6), deutlich tiefer (Ebene 9–20 m, Eis 8–18 m, Wüste 22–38 m, Wald 3–9 m) und größer.
- Modelle mit Volumen: Körper, Flügelhäute mit Adern und gewelltem Hinterrand, Kopfflossen (Rochen) oder Hals mit Kamm und Fingerspreizen (Hitzesegler) bzw. Fühler, gegliederter Leib und zwei Flügelpaare (Vierflügler), schwingender Schwanz.
- Flugbild aus Gleitphasen mit Flügelschlag-Schüben, die Flügelspitzen schwingen nach. Dazu Schräglage in Kurven und gelegentliche Sturzflüge.
- Leuchtzeichnungen (Flügelkante, Rückenpunkte, Augen, Leibende) als additive Ebene. Sie und die Leuchtsporen glimmen am Tag schwach und in Morgen- und Abendrot hell (`setTwilight` aus dem Wetterglühen).

## Wolkenschatten
- `CloudShadows.ts`: Windgetriebenes Wolkenrauschen (Maßstab 115 m) dunkelt nur das direkte Sonnenlicht ab. Das gilt einheitlich für Gelände und Horizont, Felsen und Eis, Bäume, Bodendetails und mittelgroße Objekte.
- Die Bedeckung richtet sich nach dem Himmel des Planeten. Die Stärke beträgt 0,75 (Low 0,55) und sinkt bei dichter Bewölkung.
