# Granatenwurf · 7.8C

**VERIFIED** · Die Ausrüstung enthält eine Sprenggranate, `equipment.frag_grenade`. Der Standardoperator trägt zwei. **G** sendet den vorhandenen Ausrüstungsbefehl mit der aktuellen Lebens-ID. Die serverseitige Ausrüstungslogik prüft Haltung, Inventar und laufende Aktionen. Am Release-Tick zieht sie genau eine Granate ab und übergibt an `Grenades.launch`. Ausrüstung und Nachladen verwenden dieselben Abbruchregeln.

| Standardkonfiguration | Wert |
| --- | ---: |
| Aktion | 0,52 s, im Server aufgerundet auf 16 Ticks |
| Release ab Aktionsstart | 7 Ticks |
| Zünder ab Release | 50 Ticks |
| Basiswurfgeschwindigkeit | 13 m/s |
| Schwerkraft der Granate | 13 m/s² |
| Auslösehöhe im Stand | 1,35 m |
| Explosionsradius | 10,5 m |
| Maximaler Grundschaden | 165, linearer Abfall bis zum Radius |

Die vorhandene prozedurale Wurfbewegung verwendet `equipment.actionAt`. Die Hand hält das Modell bis zu diesem Tick. Die ersten Flug-Snapshots enthalten den Release-Punkt, damit der Renderer beim Eintritt in die Flugbahn von der autoritativen Startposition interpoliert. Der Ton folgt demselben Wiedergabetick. Die Flugbahn endet auf dem vorhandenen kontinuierlich geprüften Terrain- oder Hindernis-Collider. Sobald der Server-Tick die Detonation erreicht, verschwindet die Flugdarstellung. Das zugehörige Blast-Ereignis blendet die Flugdarstellung auch bei verzögerten Snapshots aus.

Stand, Hocke und Slide erlauben den Wurf. Dive, PRONE, SUPINE und GETTING_UP sperren ihn. Tod oder Haltungswechsel können einen Wurf vor dem Release abbrechen. Eine freigegebene Granate behält ihren Zünder und ihren Eigentümer, auch wenn der Werfer ausfällt.

[Explosion und Schaden](EXPLOSION_EVENT_ARCHITECTURE.md) · [Netzwerk und Reconnect](EXPLOSION_MULTIPLAYER.md)
