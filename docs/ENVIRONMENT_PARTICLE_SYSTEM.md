# Environment Particles · 7.7C

Schnee und Staub teilen einen `THREE.Points`-Batch mit einem 5-KiB-Instanzdatensatz für 320 Seeds. Sein Shader berechnet Bewegung, Größe, Ausblendung und Helligkeit. Die CPU aktualisiert wenige Uniforms und bei Zellwechseln ein 9 × 9 großes Terrain-Höhenraster. Das Raster wird im Vertexshader bilinear abgetastet. Der 32-m-Bereich um die Kamera blendet zum Rand hin aus und verwendet umlaufende Weltpositionen. Ein Fade in den ersten 1,8–4,8 m und Depth Test schützen Fadenkreuz und nahe Geometrie. Es gibt keine Wettertexturen oder Bodies.

Schnee fällt unterschiedlich schnell. Bei Wind liegt ein Teil des Schnees dicht über der Oberfläche und driftet schneller quer zum Blick. Wüstenstaub bleibt niedriger und nutzt breitere, in projizierter Windrichtung geformte Punkte. Der Hintergrunddunst kommt aus dem vorhandenen FogExp2. Im Wald erzeugt derselbe Fog-Pfad höhenabhängigen Bodendunst. Zusätzliche optionale Blätterpartikel waren für diesen Meilenstein entbehrlich.

| Qualitätsstufe | Maximum pro Client | Vegetationsauslenkung |
| --- | ---: | ---: |
| Low | 64 | 58 % |
| Medium | 176 | 84 % |
| High | 320 | 100 % |

Das aktuelle Profil und die Kamerahöhe reduzieren den Batch. Schwächerer Schnee hat 67 % der maximalen Dichte. Bei Reduzierter Bewegung pausiert die Wetterbewegung einschließlich Partikeln und Vegetationsverformung. Stetige Licht- und Nebelübergänge bleiben sichtbar.

Batch und Material werden beim ersten sichtbaren Niederschlag erzeugt, für Übergänge wiederverwendet und am Missionsende, beim Welttausch und beim Dispose freigegeben. Three.js stellt die bestehenden Buffer und Shader aus den CPU-Daten wieder her, wenn der WebGL-Kontext zurückkommt.

[Messwerte und Prüfgrenzen](WEATHER_PERFORMANCE.md)

## Prüfung 7.7E

Die 7.7E-Browserkontrolle bestätigte 320 Schneepunkte auf High nach Wiederherstellung des WebGL-Kontexts und 0 bei aktiver reduzierter Bewegung. Der Resultat- und Raumaustrittspfad entsorgt den Punktbatch. [Render-Nachweise](MILESTONE_7_7_VISUAL_ACCEPTANCE.md)
