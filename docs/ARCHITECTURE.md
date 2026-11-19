# Architektur

## Pakete

| Paket | Verantwortlichkeit |
| --- | --- |
| `packages/shared` | Nachrichtenverträge, Binärformat, Konfiguration, Waffen- und Gegnerdefinitionen, reine Bewegungs- und Kameramathematik |
| `apps/server` | Colyseus-Rooms, autoritative Arena und Missionen, Gegnerkomponenten, Systeme, Snapshots und Telemetrie |
| `apps/client` | Eingabe, Colyseus-SDK, Vorhersage, Snapshot-Verlauf, WebGL-2-Darstellung und React-HUD |

Node.js 24 führt erasierbares TypeScript im Entwicklungs- und Testmodus aus. Der Build kompiliert Shared und Server nach JavaScript und bündelt den Client mit Vite. Beide Laufzeiten greifen auf dieselben Bewegungsregeln zu. Die Simulation und das Shared-Paket kennen weder DOM noch Three.js. Die flache Arena braucht für Bewegung, Reichweite und Trefferabfragen nur begrenzte 2D-Bewegung, einen Boden und analytische 3D-Trefferkugeln.

## Spielmodi

Der gemeinsame `Battlefield`-Tick betreibt zwei getrennte Room-Einstiege. Boreal Relay verwendet `Arena` für Randspawns und Respawns. Operation Bodenbruch verwendet `MissionInstance` für Carrier, Deployment, Missionsziele und Extraktion. Beide Modi nutzen dasselbe Gegner-ECS, Movement, Waffen und Rendering. [Missionssystem](MISSION_SYSTEM.md)

## Autoritative Arena

`FreefallRoom` verwaltet maximal vier Verbindungen, hält Matchmaking-Metadaten und ruft die transportunabhängige `Arena` auf. Colyseus taktet den Callback. `FixedLoop` sammelt die über `performance.now()` gemessene Zeit zwischen den Aufrufen. Ein Schritt entspricht 1/30 Sekunde. Pro Callback sind höchstens vier Schritte zulässig. Ältere Ganzschritte werden verworfen und gezählt, der Fraktionsrest bleibt für den nächsten Callback erhalten.

Die Arena verarbeitet jeden Schritt in dieser Reihenfolge.

1. **Spawn und Despawn.** Gegner entstehen in einem durch den Room-Seed bestimmten Randbereich. Änderungen der Host-Vorgabe wirken im nächsten Tick. Ersatz für eliminerte Gegner erscheint nach kurzer Verzögerung. Aktive Slots werden dicht geführt und per Swap-Remove entfernt. Ein neu belegter Slot erhält eine neue Gegner-ID.
2. **Spielerbewegung.** Der Server prüft Eingaben, normalisiert die Diagonale, begrenzt das Tempo und klemmt Positionen auf die Arena. Jede gültige Eingabe bewegt genau einmal, in Sequenzreihenfolge. Normal ist eine pro Tick. Ein adaptiver Puffer von 0–3 Eingaben fängt Jitter ab, ein Budget begrenzt den Abbau von Rückständen. `ack` ist die zuletzt ausgeführte Eingabe. Feuer, Blick, Ausrüstung und Nachladen verwenden die neueste Eingabe. Nach acht Ticks ohne Eingabe gilt der Spieler als inaktiv. [Netzwerk und Interpolation](NETWORK_INTERPOLATION.md)
3. **Targeting.** Bis zu vier lebende Spieler werden nach Entfernung verglichen. Gültige Ziele werden alle sechs Ticks phasenversetzt neu ausgewählt. Ein fehlendes oder totes Ziel wird sofort neu bewertet.
4. **Steering und Bewegung.** Ein Uniform Grid mit 1,9-m-Zellen indiziert aktive Slots über verkettete Indizes. In einem 3×3-Zellfenster werden pro Zelle maximal zwölf Slots betrachtet. Seek und Separation werden pro Gegner jeden zweiten Tick aktualisiert, die Position in jedem Tick. Bei sehr dichtem Gedränge approximiert die begrenzte Auswahl die Nachbarschaft.
5. **Kampf und Schaden.** Die Testwaffe verwendet einen serverseitigen Kamerastrahl, der zum Fadenkreuz passt und erst ab der Distanz zum Spieler trifft. Bodenschnitt und Reichweite begrenzen den Strahl. Der Server prüft die nächste Trefferkugel, berechnet Schaden und Feuerrate und entfernt Gegner bei null HP. Nahkampf prüft Distanz und individuellen Cooldown. Bei null Spieler-HP wird Respawn geplant. Nach dem Respawn besteht zwei Sekunden Schutz.

`HordeManager` hält Position, Geschwindigkeit, Blickrichtung, HP, Zielslot, Typ, ID und Nahkampf-Timer in TypedArrays. Aktive Liste und Freiliste bilden den Lebenszyklus ab. Es gibt pro Gegner weder eine Objektinstanz noch einen individuellen Timer. Pro Tick ist die Nachbarschaftsarbeit durch das Stichprobenlimit linear in der Gegnerzahl begrenzt. Das Hitscan-Verfahren läuft pro abgegebenem Schuss einmal über die aktive Liste.

## Netzwerk und Identitäten

Colyseus 0.18 mit WebSocket-Transport verwaltet Matchmaking, Room-Lebenszyklus und Nachrichten. Der Host ist der erste verbundene Spieler. Beim Disconnect wird dessen Platz freigegeben, Gegner wählen andere gültige Ziele, und der älteste verbleibende Teilnehmer übernimmt gegebenenfalls den Host. Ein erneuter Beitritt ist eine neue Sitzung. [Colyseus Room API](https://docs.colyseus.io/room) · [Client SDK](https://docs.colyseus.io/sdk)

| Kanal | Inhalt | Rate |
| --- | --- | --- |
| `input` | Sequenz, Bewegungstasten, Blickwinkel, Sprint, Feuer, optional Aim und Reload | Ziel 30 Hz |
| `players` | Tick, Host-ID, Spielerwerte, bestätigte Eingabesequenz, Lebensnummer, Aim/Sprint-Bits, Pitch, Munition und Reload-Endtick | 20 Hz |
| `horde` | Vollständiger binärer Frame aller aktiven Gegner | 10 Hz |
| `shot` | Autoritatives Ereignis mit Start, Ende, Treffer-ID und Eliminierung | Pro abgegebenem Schuss |
| `metrics` | Gemessene Tickrate, Tickzeiten, Spieler- und Gegnerzahlen | 2 Hz |
| `horde-size` | Hostbefugnis und Wert aus der festen Größenliste | Bei Änderung |

Die Raten stehen in `packages/shared/src/config/arena.ts` und sollten höchstens so hoch wie die Tickrate sein. Die Gameplay-Ereignisse laufen zuverlässig und geordnet über denselben WebSocket wie die Snapshots. Nachrichten mit ungültigen Achsen, Winkeln, Typen oder Sequenzen werden verworfen. Clients melden nur Eingabeabsichten. Treffer und Schaden entstehen ausschließlich auf dem Server.

Ein Hordenframe verwendet Little Endian. Auf sechs Headerbytes mit `u32 tick` und `u16 count` folgen je zehn Bytes pro Gegner.

| Feld | Repräsentation |
| --- | --- |
| Gegner-ID | u32, pro Spawn vergeben |
| X und Z | je i16, 256 Einheiten pro Meter in der Arena und 128 in Bodenbruch |
| Blickrichtung | u8, ein Umlauf in 256 Stufen |
| Gegnertyp | u8 |

Ein Frame ist eigenständig. Neue Gegner erscheinen mit ihrer ID, entfernte IDs entfallen im nächsten Frame. Die kompakte Arena sendet denselben Frame an alle Spieler. Das erleichtert die Koop-Prüfung und spart Kodierung pro Empfänger. Räumliche Relevanzfilterung ist für größere Karten vorgesehen.

## Darstellung und Vorhersage

Der Client führt einen kurzen Tick-Verlauf für Spieler und Horde. Die Renderverzögerung passt sich an Snapshot-Abstand und gemessenen Ankunftsjitter an, typisch sind 3,5 Ticks. Die Wiedergabe läuft in Echtzeit mit sanfter Ratenkorrektur. Gegner werden anhand ihrer IDs verglichen, Position und Winkel werden interpoliert. Bei einer fehlenden Identität hält der Client den letzten Wert bis zum Wechsel des Framepaares. Remote-Operatoren werden höchstens 100 ms extrapoliert, Respawns und Teleports werden nicht interpoliert. Die lokale Figur reagiert mit einer direkten Bewegungsprognose auf Basis derselben Bewegungsfunktion. Ihre sichtbare Position interpoliert zwischen den letzten beiden 30-Hz-Schritten. Bestätigte Eingaben fallen aus der Prognose. Noch offene Eingaben werden ab der Serverposition erneut angewandt. Kleine Abweichungen werden in etwa 55 ms ausgeblendet, bei Tod, einem neuen Leben oder über 2 m springt die Anzeige auf den bestätigten Zustand. Der Renderer enthält keine Gegnerlogik. [Bewegungsqualität](MOVEMENT_SMOOTHNESS.md) · [Kamera](CAMERA_SYSTEM.md)

Die Hordenanzeige nutzt bis zu drei `InstancedMesh`-Draws. Eine Entfernungsschwelle wechselt zwischen naher und vereinfachter Geometrie. Frustum-Tests füllen nur die sichtbaren Bereiche der vorbereiteten Matrix- und Farbpuffer. Spielerfarben, Schusstracer, Trefferpartikel und Textanzeigen sind getrennt vom Simulationsmodell. Das React-HUD erhält zusammengefasste Werte aus dem Spielloop.

Weitere Gegner- und Waffenwerte gehören in die vorhandenen Definitionstabellen. Neue Gegnerformen benötigen zusätzlich einen Renderpfad für den jeweiligen Typ. Missions- und Fortschrittsdaten können später nach einem Match in einem separaten Dienst verarbeitet werden. Die autoritative Echtzeitschleife benötigt dafür keinen Datenbankzugriff.

[Charakter](CHARACTER_SYSTEM.md) · [Animation](ANIMATION_SYSTEM.md) · [Waffenpräsentation](WEAPON_VISUAL_SYSTEM.md) · [Gegnerfraktionen](FACTIONS.md) · [Missionsarchitektur](ROADMAP_MISSION_GAMEPLAY.md)
