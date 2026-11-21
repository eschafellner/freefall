# Procedural Wind · 7.7C

`WindProfile` enthält Richtung in Radiant, Grundstärke und Böenamplitude in normierten Einheiten, Frequenz in Hz und Turbulenz. Der Server liefert die Endpunkte über den Atmosphärenzustand. Der Client wertet sie deterministisch aus Missionszeit und Wetter-Seed aus.

Zwei gewichtete Sinuswellen bilden die Böenhüllkurve je Endpunkt. Der Client berechnet beide Hüllkurven zuerst und überblendet sie mit demselben Fortschritt wie das Wetter. Die Richtung nimmt den kürzeren Kreisbogen und variiert leicht mit einer langsamen, begrenzten Turbulenz. Das Ergebnis ist ein normierter horizontaler X/Z-Vektor mit einer Maximalstärke von 1. Vegetation skaliert denselben Vektor per Profil und Qualitätsstufe. Schnee und Staub integrieren ihn mit ihrer lokalen Darstellungszeit für eine stetige Drift.

Entwicklungsräume erlauben einem Host `weather:<id>` über Testwetter im Menü. Der Debug-Nachrichtenpfad versteht ergänzend `weather:<id>:<grad>:<stärke>:<sekunden>`, beispielsweise `weather:windy-forest:270:0.85:12`. Gültig sind 0–360 Grad, 0–1 Stärke und 2–120 Sekunden. Ein fester Debug-Wind setzt Böen und Richtungsvariation für diesen Zielzustand auf null. F2 zeigt die aktiven Parameter. F4 schaltet die lokale Wetterdarstellung im Debug-Raum für Vergleiche um.

[Wetterarchitektur](PLANET_WEATHER_SYSTEM.md) · [Vegetationsshader](VEGETATION_WIND_ANIMATION.md)
