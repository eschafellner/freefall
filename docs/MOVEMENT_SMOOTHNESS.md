# Bewegungsqualität (Milestone 7.1)

Der erste Playtest meldete, dass Laufen und Bild „nicht flüssig“ wirken. Dieses Dokument hält fest, welche Ursachen tatsächlich gefunden wurden, was geändert wurde und was offen bleibt. Messverfahren und alle Zahlen stehen in [PERFORMANCE_BASELINE_7_1.md](PERFORMANCE_BASELINE_7_1.md). Netzwerk und Kamera haben eigene Dokumente: [NETWORK_INTERPOLATION.md](NETWORK_INTERPOLATION.md) und [CAMERA_SYSTEM.md](CAMERA_SYSTEM.md).

## Kurzfassung

Das Ruckeln war **kein Rendering-Engpass**. Es hatte zwei Hauptursachen und mehrere Folgeeffekte.

1. **Zeitmanagement zwischen Simulation und Darstellung.** Die lokale Figur und damit die Kamera sprangen im 30-Hz-Raster der Vorhersage. Bei 60 Hz bewegte sich das Bild nur in jedem zweiten Frame, bei 144 Hz in etwa jedem fünften. Weil die Kamera der Figur folgt, ruckelte die ganze Welt.
2. **Eingabeverarbeitung auf dem Server.** Der Server wandte pro Tick die zuletzt empfangene Eingabe an. Kamen zwei Eingaben in einem Tick an, entfiel eine. Kam keine an, wurde die letzte wiederholt. Die Client-Vorhersage verarbeitet jede Eingabe genau einmal. Dadurch entstanden laufend Korrekturen von genau ein oder zwei Bewegungsschritten (19,3 / 38,7 cm beim Gehen, 30,7 / 61,3 cm im Sprint). Im LAN waren es bis zu 9,4 Korrekturen pro Sekunde.

Folgeeffekte waren eine verrauschte Geschwindigkeitsschätzung der Animation, flackernde Locomotion-Zustände und Foot Sliding. Hinzu kamen eine Remote-Interpolation, die unter Jitter stockte, und eine Kamerakollision, die an Kanten sprang.

| Kategorie | Befund | Anteil am Ruckeln |
| --- | --- | --- |
| A · Rendering | CPU 0,2–0,6 ms und GPU 0,1–0,3 ms pro Frame. Ohne Vsync liefen 2.300–4.800 FPS mit P99 unter 1 ms und höchstens 4,7 ms Einzelframe. Pro Frame entstehen keine Geometrien oder Materialien, das Schattenupdate läuft nur bei Szenenwechsel, das HUD aktualisiert sich mit 4 Hz. GC und Shader-Kompilierung wurden nicht separat profiliert. Bei den gemessenen Spitzen wären sie aber höchstens im Bereich weniger Millisekunden aufgetreten. | Auf der Testhardware keiner |
| B · Netzwerk | Doppelte oder ausgelassene Server-Bewegungsschritte erzeugten Korrekturen. Die Timeline hatte eine feste Verzögerung, keine Extrapolation und einen monotonen Clamp, der unter Jitter Standbilder erzeugte. | Hoch (lokal: Korrekturen; remote: Stocken unter Jitter) |
| C · Animation | Das Tempo wurde aus 30-Hz-Treppen abgeleitet. Daraus folgten 14–22 % Tempo-Schwankung, bis zu 90 Locomotion-Wechsel bei konstanter Bewegung und Foot Sliding. | Mittel (Folge von A und B) |
| D · Kamera | Die Kamera folgte der 30-Hz-Treppenposition. Kollision zog sie sofort ein und ließ sie sofort wieder los. | Hoch (Folge von A) plus Pumpen an Kanten |

## Gefundene Ursachen im Detail

### Render Loop und Zeitmanagement

`Game.draw()` ist die einzige `requestAnimationFrame`-Schleife. Es gibt keine doppelten Updates. Jeder `AnimationMixer` beziehungsweise jedes prozedurale Rig wird genau einmal pro Frame mit demselben `dt` aktualisiert. Die Vorhersage lief korrekt im festen 30-Hz-Schritt. `Prediction.sample()` zeigte aber immer den Zustand nach dem **letzten** Schritt plus Korrekturoffset. Zwischen zwei Schritten stand die Figur still. Dieselbe Treppenposition ging an Rig, Kontaktschatten und Kamera.

Gemessen mit dem Headless-Benchmark bei konstanter Laufgeschwindigkeit:

- Die Geschwindigkeit pro Frame schwankte bei 60 Hz um 83–97 % (Variationskoeffizient), bei 144 Hz um 168–192 %.
- Bei 144 Hz zeigten 45–67 % der Frames dieselbe Position wie der vorige Frame.

### Server-Eingaben

`Battlefield.step()` setzte `ack = input.seq` und bewegte mit `player.input`, also der jeweils neuesten Eingabe. Client und Server takten unabhängig, der Client per rAF, der Server per Node-Timer. Deshalb kamen pro Servertick 0, 1 oder 2 Eingaben an. Die Bestätigung passte danach nicht mehr zur tatsächlichen Zahl ausgeführter Schritte. Die Vorhersage replayte ab einer Serverposition, die einen Schritt zu viel oder zu wenig enthielt. Die gemessenen Korrekturen waren exakt Vielfache eines Schritts. Das bestätigt die Ursache.

### Animation

`PlayerVisualController` leitet das Tempo aus der Positionsänderung pro Frame ab. Ein früherer Fix hatte deshalb eine Dämpfung eingebaut (Kommentar in `CharacterAnimation`). Bei Treppenpositionen bleibt das Signal trotzdem verrauscht. Die Folgen waren ein schwankender Schrittzyklus und ein Sprint, der zu Run zurückfiel. Die Schrittweite des prozeduralen Rigs ist aus Tempo, Standphase und Kadenz so berechnet, dass der Standfuß exakt mit dem Bodentempo zurückläuft. Bei korrektem Tempo entsteht kein Foot Sliding. Der Fehler lag also im Eingangssignal, nicht im Rig.

`CharacterClipPlayer` (Pfad für importierte GLB-Rigs) startete jeden Locomotion-Wechsel bei Clipzeit 0 und spielte alle Clips mit fester Rate. **Derzeit ist kein Soldaten-GLB registriert** (`ASSETS.soldier` ist leer). Im Spiel läuft das prozedurale Rig, Clips gibt es nicht. Eine qualitative Bewertung von Produktionsclips ist deshalb nicht möglich.

## Umgesetzte Änderungen

| Bereich | Änderung | Datei |
| --- | --- | --- |
| Lokale Darstellung | `rendered` interpoliert zwischen vorletztem und letztem Vorhersageschritt mit dem Akkumulator-Anteil. Die sichtbare Figur folgt damit stetig der bereits festgelegten Trajektorie, die auch der Server mit denselben Eingaben berechnet. Korrekturen verschieben das Interpolationssegment und landen in einem Offset, der in etwa 55 ms abklingt. Korrekturen über 2 m sowie neue Leben werden sofort übernommen. | `apps/client/src/game/Prediction.ts`, `Game.ts` |
| Server-Eingaben | Jede Eingabe bewegt genau einmal, in Reihenfolge. `ack` ist die zuletzt **ausgeführte** Sequenz. Ein adaptiver Puffer von 0–3 Eingaben fängt kurze Lücken ab. Ein Budget von höchstens 3 Schritten pro Tick und eine Warteschlange von 10 Einträgen begrenzen das Tempo. Lange Pausen (verdeckter Tab, Menü) vergrößern den Puffer nicht. Waffen, Ausrüstung, Feuer, Blickrichtung und Nachladen verwenden weiterhin die neueste Eingabe. | `apps/server/src/simulation/Battlefield.ts`, `Player.ts`, `mission/MissionInstance.ts`, `packages/shared/src/config/arena.ts` |
| Remote-Timeline | Die Verzögerung passt sich an Snapshot-Abstand und gemessenen Jitter an. Die Wiedergabe läuft in Echtzeit mit höchstens ±8 % Ratenkorrektur statt Sprüngen oder Halten. Remote-Operatoren werden höchstens 3 Ticks begrenzt extrapoliert. Respawns und Teleports werden nicht interpoliert. | `apps/client/src/game/Timeline.ts`, `RemoteInterpolation.ts`, `rendering/Agents.ts` |
| Kamera | Die Kollision zieht sofort ein und gibt mit 7/s gedämpft wieder frei. Der Sprint-Rückzug ist von 0,40 auf 0,28 m reduziert, die Sprint-FOV von +3,8° auf +3°. Die Werte stehen in `CAMERA_TUNING`. Yaw und Pitch bleiben ungeglättet. | `apps/client/src/rendering/ThirdPersonCamera.ts` |
| Clips (GLB-Pfad) | Wechsel zwischen Gangarten übernehmen die normierte Schrittphase und blenden über 220 ms. Optionale `clipSpeeds` im Asset passen die Abspielrate an das gerenderte Tempo an (0,6–1,6×). | `CharacterClipPlayer.ts`, `AssetRegistry.ts` |
| Animation bei sehr hoher Bildrate | Die Untergrenze für `dt` in der Tempoableitung liegt jetzt bei 0,1 statt 1 ms. Ab etwa 1.000 FPS wurde das Tempo vorher unterschätzt. | `PlayerVisualController.ts` |
| Telemetrie | F2 zeigt ein zweites Panel „Bewegung“ und Bodenmarker für Serverposition (orange) und Vorhersage (cyan). Erfasst wird nur bei offenem Panel. | `Game.ts`, `ui/App.tsx`, `ArenaView.ts` |
| Kleinkram | Das Array für Flugphasen pro Frame ist jetzt ein konstantes `Set`. Granaten werden nicht extrapoliert. | `ArenaView.ts` |

Unverändert blieben die Waffen- und Schadensberechnung, das Gegner-ECS, Patrouillen, Schwarmnester, Convict-AI, Albatross, die Missions-Zustandsmaschine, Extraktion, Belohnungen und Ausrüstung. Die Netzwerkverträge behalten dieselben Nachrichten und Felder. Nur die Bedeutung von `ack` ist jetzt präzise (zuletzt ausgeführte Bewegungseingabe). Die Server-Benchmarks liefern identische Schuss- und Abschusszahlen wie vorher.

## Wirkung (Headless-Benchmark, Mittel über die gleichförmigen Szenarien)

| Anzeige / Netz | Lokal v-CV | Kamera v-CV | Remote v-CV | Korrekturen/s | Größte Korrektur | Foot Sliding lokal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 Hz / LAN | 82,6 % → 0,0 % | 75,2 % → 0,1 % | 1,1 % → 0,6 % | 9,4 → 0 | 38,7 → 0 cm | 4,89 → 0,00 m/s |
| 144 Hz / LAN | 187,1 % → 0,0 % | 171,2 % → 0,1 % | 1,8 % → 0,3 % | 2,4 → 0 | 38,7 → 0 cm | 9,20 → 0,00 m/s |
| 60 Hz / WAN 35+15 ms | 97,2 % → 0,0 % | 87,3 % → 0,1 % | 3,3 % → 0,9 % | 1,5 → 0 | 38,7 → 0 cm | 5,40 → 0,00 m/s |
| 144 Hz / Jitter 60+40 ms | 168,0 % → 0,0 % | 153,5 % → 0,1 % | 15,9 % → 4,8 % | 7,1 → 0 | 92,0 → 0 cm | 8,62 → 0,00 m/s |

„v-CV“ ist die Schwankung der sichtbaren Geschwindigkeit von Frame zu Frame bei konstanter Eingabe. 0 % bedeutet: In jedem Frame legt die Figur exakt dieselbe Strecke zurück. Foot Sliding ist die mittlere Differenz zwischen Animationstempo und sichtbarem Tempo pro Frame.

### Reaktionszeit

| Anzeige | Taste → erste Bewegung | Loslassen → Stillstand | Richtungsumkehr sichtbar | Mausblick |
| --- | ---: | ---: | ---: | ---: |
| 60 Hz | 32,4 → 32,4 ms | 16–433 → 49 ms | 16–32 → 49 ms | unverändert im selben Frame |
| 144 Hz | 33,8 → 33,8 ms | 6–110 → 13 ms | 3,2 → 7,2 ms | unverändert im selben Frame |

Anlaufen ist gleich schnell geblieben. Stoppen ist deterministisch geworden: Vorher rutschte die Figur bei Korrekturen bis zu 433 ms nach. Eine **Richtungsumkehr** wird bei 60 Hz etwa einen Frame später sichtbar. Das ist der Preis der stetigen Darstellung. Vorher sprang die Figur beim Simulationsschritt sofort an dessen Endposition und stand dann still. Jetzt läuft sie diesen 33-ms-Schritt stetig ab. Die Eingabe selbst wirkt in beiden Ständen zum selben 30-Hz-Schritt, auf dem Client wie auf dem Server.

Verworfen wurde eine Variante, die den laufenden Teilschritt mit der Live-Eingabe vorausberechnet. Sie reagierte bei der Umkehr im selben Frame. Beim Loslassen schoss die Figur aber bis zu einen Schritt über die festgelegte Position hinaus und rutschte zurück, gemessen mit 330 ms Stopp-Median. Das ist genau das Rubber-Banding, das dieser Meilenstein beseitigen soll.

## Offene Punkte

- **Echte Clips fehlen.** Locomotion, Strafing und Rückwärtslauf sind prozedural. Starre Segmente, begrenztes Abrollen der Stiefel und fehlende Oberkörper-Layer sind sichtbar. Für ein Skinned-Rig braucht es In-Place-Clips für Idle, Walk, Run, Sprint, Strafe L/R und Backward. Die zugehörigen Bodentempi gehören in `clipSpeeds`. Dazu kommen maskierte Oberkörperclips für Fire und Reload, damit diese beim Laufen nicht den ganzen Körper überschreiben.
- **30-Hz-Simulation.** Die Eingabe wirkt erst am nächsten 33-ms-Schritt, im Mittel nach 17 ms. Eine niedrigere Latenz erfordert eine höhere Tickrate auf Client und Server. Das ist eine Architekturentscheidung mit Serverkosten.
- **Richtungsumkehr.** Auf 60-Hz-Displays wird sie etwa 17 ms später sichtbar als vorher (siehe oben).
- **Snapshot-Takt.** Der Server-Timer läuft mit 33 statt 33,33 ms. Alle ~3,3 s entfällt ein Callback-Schritt. Das erzeugt auf Loopback rund 31 ms Ankunftsversatz, den die adaptive Verzögerung abfängt. Ein präziser Server-Takt würde die Interpolationsverzögerung um etwa einen Tick senken.
- **Schwächere GPUs und WAN.** Gemessen wurde nur auf einer RX 9070 XT und mit simuliertem Netz. Es fehlen Messungen auf Mittelklasse-Hardware, mit Software-Rendering als Untergrenze und über echtes WAN.
- **Gegner-Timeline.** Gegner werden weiterhin nicht extrapoliert, sondern bei fehlendem Snapshot gehalten. Sie laufen mit eigener, adaptiver Verzögerung (ca. 3,6 Ticks bei 10 Hz). Spieler liegen bei ca. 2,6–3,5 Ticks.
