# Boreal Relay · Visual Overhaul V1

## Art Direction

Boreal Relay ist ein vorgeschobener Außenposten in einem staubigen, felsigen Becken. Landefläche und Fahrwege bilden den offenen Kampfbereich. Die Sektoren am Rand haben unterschiedliche Silhouetten und Funktionen. Dicht gesetzte Rolltore markieren den Fuhrpark, der Gittermast und die Richtantenne die Relaisstation. Treibstofftanks, Container, Sandsäcke, Betonbarrieren, Flutlichtmasten und ein beschädigter Rohrträger ergänzen den Außenring.

| Material oder Akzent | Richtfarbe |
| --- | --- |
| Erde und feuchter Schlick | `#817057` · `#514940` |
| Schiefer und gealterter Beton | `#67685E` · `#7B7C70` |
| Oliv lackiertes Blech und dunkler Stahl | `#454E3D` · `#383E3E` |
| Markierungsfarbe und Warnocker | `#C4BDA2` · `#A78348` |

Bodenzonen variieren großflächig über Vertexfarben. Kachelbare PBR-Texturen liefern Korn, Normalen und Rauheit. Verzerrte UVs, Fahrspuren, abgenutzte Markierungen und räumlich gebündeltes Geröll brechen die Wiederholung auf. Der spielbare Bereich liegt auf der autoritativen Trefferebene bei `y = 0`. Flache Details liegen dicht darüber. Gebäude, Schutzelemente und Höhenrelief stehen außerhalb des Bewegungsbereichs. Die Zonen am Rand sind Kulisse.

## Lighting und Qualität

Three.js **0.187.0** verwendet weiterhin `WebGLRenderer` mit WebGL 2. Ein prozeduraler Wolkenhimmel liefert Hintergrund und gefiltertes Umgebungslicht. Himmelsfüllung, gerichtetes warmes Licht, exponentieller Dunst, ACES und sRGB formen den bedeckten Tag. Die Sonne berechnet Schatten für statische Bauten beim Aufbau und bei Profilwechseln. Spieler und nahe Gegner nutzen gemeinsam gezeichnete Kontaktschatten.

Die Auswahl unter **Grafikqualität** gilt sofort und wird lokal gespeichert. Desktop startet mit Medium, Geräte mit grobem Zeiger mit Low. Die Auflösung ergibt sich aus Fenstergröße, begrenzter Pixeldichte und Skalierung.

| Einstellung | Low | Medium | High |
| --- | ---: | ---: | ---: |
| Auflösungsskala · DPR-Limit | 0,68 · 1,0 | 0,90 · 1,3 | 1,00 · 1,65 |
| Statische PCF-Schattenkarte | aus | 1.024² | 2.048² |
| Geröll · Bewuchs, nominelle Distanz in m | 13 · aus | 23 · 20 | 38 · 44 |
| Gegner-LOD, Grenze Nah · Mittel in m | 12 · 30 | 21 · 48 | 31 · 67 |
| Gegner-Kontaktschatten bis m | 10 | 23 | 33 |
| Effekt-Slots · max. Einschlagpartikel pro Slot | 20 · 3 | 36 · 6 | 56 · 9 |
| Vollbild-Antialiasing | aus | aus | FXAA |

Low verwendet für die großen Bodenflächen einen einfacheren Materialpfad mit Farbtextur und Vertexfarben. Detailkacheln behalten am Rand eine kleine Distanzreserve. Entfernte Gegner bleiben als vereinfachte Instanzen sichtbar. Geräte ohne Float-Renderziele verwenden die direkt beleuchtete Szene mit LDR-Himmel.

## Assets, Figuren und VFX

- Gelände, Himmel, Oberflächenkarten, Beschriftungen und Modelle werden im Client erzeugt. V1 enthält keine extern bezogenen Art-Assets.
- Relative Asset-Pfade stehen in `apps/client/src/rendering/AssetRegistry.ts` und verweisen auf `apps/client/public/assets/`. Der Loader teilt laufende und abgeschlossene GLB- und Textur-Ladevorgänge. Farbtexturen als sRGB, Normalen- und Rauheitsdaten als lineare Daten angeben. KTX2 kann über einen Basis-Transcoderpfad aktiviert werden.
- Milestone 3 ersetzt die V1-Figur durch ein artikuliertes Fallback-Rig mit Charakter- und Waffensockets. Die Arena-Beleuchtung und das instanzierte Schabe-Design werden weiterverwendet. [Charakter und aktuelle Assetanforderungen](CHARACTER_SYSTEM.md)
- Gegner wechseln zwischen drei instanzierten Silhouetten. Bewegung und Trefferimpuls laufen auf den beiden näheren Stufen. Tracer, Mündungsfeuer, Staub, Funken und kurze Zusammenbrüche stammen aus wiederverwendeten Puffern. Einschläge unterscheiden Erde, Beton, Metallplatten und Gegnerpanzer anhand des bestätigten Trefferpunkts. Abschüsse erzeugen einen kurzen lokalen Explosionsimpuls.
- Zu künftig importierten Assets gehören Quellen-URL, Urheber, konkrete Lizenz, erforderliche Namensnennung und dokumentierte Bearbeitungen.

## Performance

Gemessen am 17. November 2026 auf AMD Ryzen 7 9700X und Radeon RX 9070 XT mit headless Chromium 153.0.8010.12, ANGLE OpenGL ES und Mesa 26.2.6. Der Ausgangsstand wurde vor den Änderungen separat gebaut. Bei gleicher Kamera, gleichem Seed (421337) und gleichen Gegnerkoordinaten liefen pro Szenario 30 Aufwärmframes und 85 Messframes. Für die CPU-Zeit wurde die synchrone Dauer von `ArenaView.draw()` gemessen. Die GPU-Spalte mittelt 22 asynchron ausgelesene WebGL-Timer-Abfragen je Szenario. Die Messung isoliert den Renderpfad. Der Vier-Client-Test prüft separat den echten Matchbetrieb.

Der Hauptvergleich lief bei 1.280 × 720 CSS-Pixeln und DPR 1. Low renderte 870 × 489, Medium 1.152 × 648. Ausgangsstand und High renderten 1.280 × 720. Die Wiedergabe war bei 60 Hz getaktet. Die P95-Frameabstände lagen durchgehend bei 16,7–16,8 ms.

| Profil | Gegner aktiv / sichtbar | FPS | CPU Ø ms | GPU Ø ms | Draw Calls | Dreiecke | Meshes / Instanzen | Geometrien / Texturen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vorher | 0 / 0 | 60 | 0,28 | 0,040 | 32 | 2.238 | 24 / 184 | 21 / 1 |
| Vorher | 100 / 44 | 60 | 0,28 | 0,043 | 34 | 4.418 | 24 / 228 | 21 / 1 |
| Vorher | 500 / 204 | 60 | 0,32 | 0,049 | 34 | 12.718 | 24 / 388 | 21 / 1 |
| Vorher | 1.000 / 388 | 60 | 0,36 | 0,052 | 34 | 22.098 | 24 / 572 | 21 / 1 |
| Low | 0 / 0 | 60 | 0,37 | 0,040 | 37 | 75.492 | 10 / 1.622 | 23 / 17 |
| Low | 100 / 44 | 60 | 0,35 | 0,042 | 40 | 81.016 | 10 / 1.668 | 23 / 17 |
| Low | 500 / 204 | 60 | 0,40 | 0,046 | 40 | 100.502 | 10 / 1.831 | 23 / 17 |
| Low | 1.000 / 388 | 60 | 0,38 | 0,052 | 40 | 122.050 | 10 / 2.019 | 23 / 17 |
| Medium | 0 / 0 | 60 | 0,37 | 0,121 | 41 | 75.646 | 10 / 1.644 | 25 / 21 |
| Medium | 100 / 44 | 60 | 0,42 | 0,124 | 44 | 83.456 | 10 / 1.693 | 25 / 21 |
| Medium | 500 / 204 | 60 | 0,39 | 0,132 | 44 | 111.740 | 10 / 1.875 | 25 / 21 |
| Medium | 1.000 / 388 | 60 | 0,40 | 0,143 | 44 | 143.474 | 10 / 2.076 | 25 / 21 |
| High | 0 / 0 | 60 | 0,45 | 0,202 | 51 | 78.597 | 10 / 1.809 | 26 / 23 |
| High | 100 / 44 | 60 | 0,41 | 0,208 | 54 | 90.899 | 10 / 1.864 | 26 / 23 |
| High | 500 / 204 | 60 | 0,44 | 0,221 | 54 | 137.069 | 10 / 2.069 | 26 / 23 |
| High | 1.000 / 388 | 60 | 0,45 | 0,234 | 54 | 185.825 | 10 / 2.301 | 26 / 23 |

Zusatztest bei 1.920 × 1.080 mit allen 1.000 Gegnern im sichtbaren Bereich.

| Profil | Gegner aktiv / sichtbar | FPS | CPU Ø ms | GPU Ø ms | Draw Calls | Dreiecke | Meshes / Instanzen | Geometrien / Texturen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vorher | 1.000 / 1.000 | 60 | 0,41 | 0,131 | 34 | 120.438 | 24 / 1.184 | 21 / 1 |
| High | 1.000 / 1.000 | 60 | 0,60 | 0,537 | 53 | 549.685 | 10 / 3.703 | 26 / 23 |

Die Geometrie- und Texturspalten zählen WebGL-Ressourcen. Der treiberseitige VRAM-Verbrauch in Bytes bleibt offen. Die Instanzzahl umfasst Kulisse, Gegner, Kontaktschatten und sichtbare Effekte. Statische Schatten wurden nach dem Aufwärmen aus der fertigen Schattenkarte gelesen.

Im separaten SwiftShader-Lauf erreichte der Ausgangsstand 59,3 FPS ohne Gegner und 48,0 FPS bei 1.000 Gegnern. Low erreichte im selben Fenster 24,6 beziehungsweise 19,8 FPS. Der Overhaul ist für hardwarebeschleunigtes WebGL ausgelegt.

Im Produktionsbuild traten vier Chromium-Clients demselben Raum bei und erhielten bytegleiche Horden-Snapshots mit 1.000 Gegnern. Geprüft wurden Profilwechsel, Pointer Lock, replizierter Sprint, serverbestätigter Abschuss, Tod, Respawn, Abweisung eines fünften Clients und Host-Übergabe. In einem aktiven High-Client zeigte das HUD im Gefecht 60 FPS, 250 von 1.000 Gegnern und 43 Draw Calls. Die weiteren Clients liefen auf demselben Rechner. Low und die DPR-Begrenzung wurden zusätzlich in der Touch-Emulation geprüft. Build, Typprüfung und alle neun vorhandenen Tests sind erfolgreich. Der GLB-/Textur-Loader wurde mit temporären eigenen Testdateien einschließlich Cache und Wiederholung nach einem Ladefehler geprüft.

## Grenzen und nächste Schritte

Die Figuren sind prozedurale Ersatzmodelle. Der nächste visuelle Schritt sind lizenzierte oder eigens erstellte GLB-Modelle mit Lauf-, Treffer- und Todesanimationen sowie feinere Materialvarianten für Stoff, Beton und lackiertes Metall. Für künftige Deckung innerhalb der Arena braucht die autoritative Simulation gemeinsame Hindernisdaten für Bewegung und Trefferstrahlen. Als Nächstes sollten integrierte GPUs und echte Mobilgeräte vermessen werden. Die Steuerung setzt weiterhin Desktop-Eingabe mit Pointer Lock voraus. Vite meldet für den Hauptchunk rund 1,10 MB JavaScript beziehungsweise 309 kB gzip eine Größenwarnung.

## Vergleichsbilder

- Extraktionszone bei gleicher Kameraposition. [Vorher](visual-style/arena-vorher.jpg) · [Nachher](visual-style/arena-nachher.jpg)
- Zufahrt zur Relaisstation bei gleicher Kameraposition. [Vorher](visual-style/relais-vorher.jpg) · [Nachher](visual-style/relais-nachher.jpg)
- [Treffereffekt im kontrollierten Rendertest](visual-style/treffereffekt.jpg) · [Gefechtsaufnahme mit vier verbundenen Clients](visual-style/vier-clients.jpg)
