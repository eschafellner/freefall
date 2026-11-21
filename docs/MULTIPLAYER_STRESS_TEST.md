# Multiplayer-Stresstest 7.3E

## Tatsächlich ausgeführte Tests

| Ebene | Prüfungen | Ergebnis |
| --- | --- | --- |
| Vier echte Colyseus-WebSockets, Boreal Relay | Fünfter Client abgelehnt, Hosttransfer, vier identische 1.000er-Hordeframes, gleichzeitiges Ducken, vier Dives und beide Landungen, vier Kriech- und Schussaktionen, vier Reloads mit doppeltem Paket, vier Aufsteh-Übergänge | PASS |
| Echte Missions-WebSockets | Boarding und Deployment mit vier Verbindungen, übereinstimmende Waffen- und Missionszustände, SUPINE-Reconnect beim Rettungsballon, Join-in-Progress abgelehnt, Rückkehr. Separater wiederholter Disconnect in PRONE und GETTING_UP mit identischer Session und unverändertem Endtick | PASS |
| Server-Simulationssuite | Reconnect im Flug, Reload-Fortsetzung, Stim- und Nachschub-Abbruch, bestätigte Ressourcen bleiben erhalten. Vier gleichzeitige Dives während einer aktiven Granate und Tod im Flug/auf dem Weg zum Stand | PASS |
| Vier Client-Instanzen mit echter Prediction und virtueller Netzwerkuhr | Fünf Profile, Vorwärts-/Rückwärts-Dive, beide Landungen, Bewegung, Feuer, Reload, Stim, Get-up und Tod bei einem weiteren Dive. Alle vier Clients am Ende positionsgleich mit der Autorität, keine offenen Eingaben, ein Stim und ein Ersatzmagazin je Operator | PASS |
| Vier gerenderte Clients, reguläre Mission unter Labor-Netzstörungen | Synchronisierte Spielaufzeichnung aus vier Blickwinkeln inklusive tatsächlicher TCP-Störung und Reconnect unter Last | NOT RUN |

## Virtuelle Netzprofile

Jeder Test verwendet 375 Simulationsticks bei 30 Hz, vier Operatoren und Eingangskanäle in Sequenzreihenfolge. Die Laufzeiten sind konfigurierte Einwegzeiten. Die RTT ergibt sich nominal aus beiden Einwegverzögerungen. Im Replayprofil simuliert der Test Lücken und späte Kopien auf Anwendungsebene. Colyseus verwendet verlässliches, geordnetes WebSocket über TCP.

| Profil | Einwegzeit | Spieler-JSON gesendet je Client | Verworfen / abgewiesen | Korrekturen gesamt / größte | Snaps |
| --- | --- | ---: | ---: | ---: | ---: |
| LAN | 1 Tick, ca. 33 ms | 488.067 B | 0 / 0 | 0 / 0 cm | 0 |
| WAN | 3 Ticks, 100 ms | 488.442 B | 0 / 0 | 0 / 0 cm | 0 |
| Hohe Latenz | 8 Ticks, ca. 267 ms | 485.578 B | 0 / 0 | 0 / 0 cm | 0 |
| Geordneter Jitter und Sendestau | 3–7 Ticks, zusätzlich 9 Ticks Eingabestau in der Feuerphase | 485.525 B | 0 / 0 | 6 / 1,55 cm | 0 |
| Snapshot-Lücken und Replay | 3–5 Ticks, Auslassung von Snapshots an durch sieben teilbaren Ticks im aktiven Szenario, späte Kopien und doppelte Action-Pakete | 430.391 B | 108 / 192 | 0 / 0 cm | 0 |

Die 108 verworfenen Kopien sind an vier Empfänger adressierte Snapshot-Auslassungen. Die 192 Ablehnungen zählen doppelte Eingaben und verspätete Snapshot-Kopien im Anwendungstest. Der Snap-Zähler erfasst große Desyncs. Der beabsichtigte Snap bei Tod ist davon ausgenommen. Die Bytewerte zählen gesendete JSON-Spielerzustände ohne Horde, Events oder Transport-Overhead. Der Browser-Benchmark erfasst zusätzlich RTT und Netzlast am lokalen Socket. [Performance-Messung](PERFORMANCE_BENCHMARK_7_3.md)

## Wiederholen

```bash
node --conditions=development --test --test-isolation=none apps/client/test/tactical-network.test.ts
node --conditions=development --test --test-isolation=none apps/server/test/multiplayer.test.ts
node --conditions=development scripts/motion-bench.ts 60,144 lan,wan,jitter --json /tmp/freefall-motion.json
```

Für die ausstehende Sichtprüfung vier Browser auf der Zielkonfiguration in denselben Bodenbruch-Raum verbinden. Alle vier Operatoren bereit melden und Alpha/Bravo regulär abschließen. Bei beiden Landungen, vier gleichzeitigen Get-ups und einem Reconnect die F2-Ansicht und die Screenshots aller Beteiligten mit dem Serverzustand vergleichen. Einen TCP-Stau, erhöhte RTT und eine kurze Unterbrechung über einen lokalen Labor-Proxy auf jeweils einer der vier Verbindungen wiederholen. Referenzpunkte und optische Kriterien stehen im [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md).
