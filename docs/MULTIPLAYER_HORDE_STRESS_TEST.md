# Vier-Spieler-Horden-Stresstest · 7.4E

## Ausgeführte Profile

| Profil | Prüfpfad | Geprüft |
| --- | --- | --- |
| Vier echte Colyseus-Verbindungen über Loopback | `apps/server/test/multiplayer.test.ts` | Raumlimit, Hostwechsel, Deployment, Live-Refill und eindeutige Gegner-IDs, parallele Ausrüstung, Bodenhaltungen und Reconnect in der Extraktion |
| FREEFALL mit 1.000 aktiven Schaben | Derselbe WebSocket-Test startet im Missionsraum eine regulär validierte Welle und setzt danach eine feste Lastkohorte ein | Alle vier Peers dekodieren 1.000 eindeutige IDs. Zwei Reconnects behalten Operator-ID, Missionsinstanz, Wellen-ID und Gegnerbestand. Genau ein Start und ein Ende derselben Welle. Nachschub beansprucht einmal eine Containerladung und gibt die Reservierung frei. |
| 140 ms emulierte RTT | `server.simulateLatency(140)` im WebSocket-Test, vier SDK-Clients | Angriffsbeginn, Lebens-ID und Treffer stimmen zwischen den Peers überein. Reconnect erhält den sichtbaren Zustand eines laufenden Angriffs. |
| Vier Client-Simulationen bei Latenz und Zustelllücken | `apps/client/test/tactical-network.test.ts`, 30 Hz | Verzögerungen von 1, 3 oder 8 Ticks je Richtung. Jitterprofil mit 3–7 Ticks und 300 ms Pause. Das Replay-Profil lässt alle sieben Ticks ausgewählte Anwendungssnapshots aus und liefert Duplikate verspätet. |
| Vier gerenderte Chromium-Clients bei 1.000 | Lokal auf demselben Host, SwiftShader, 1.280 × 720 Medium, 12,4 s | Vier Ansichten bestätigten die replizierte Population im F2-HUD. 29,97 Hz im Messfenster, null verworfene Serverschritte und null Browserfehler. Die Software-Frametime lag bei etwa 283 ms P95. |
| Vier gerenderte Chromium-Clients mit Hardware-GPU bei 1.000 | Radeon RX 9070 XT auf demselben Host, ANGLE OpenGL, 1.280 × 720 Medium, 60 s | Je 3.601 Frames bei 60 FPS. Frame-P95 maximal 16,8 ms über die vier Ansichten. 29,99 Hz, null verworfene Serverschritte und null Browserfehler. |
| Verzögerung, Jitter und TCP-Paketverlust | Linux-Netem auf privatem Loopback, 20 ± 5 ms pro Durchlauf und 1 % Paketverlust, Seed 421337 | Angriffssynchronisierung und zweimaliger Reconnect mit 1.000 IDs bestanden. Die Angriffsprobe setzte zusätzlich die SDK-Testlatenz von 140 ms RTT ein. Der 12-s-Vier-Browser-Lauf hielt 1.000 Gegner bei 60 FPS ohne verworfene Serverschritte. |
| Manuelle Zielhardware und WAN bei 1.000 | **NOT TESTED** | Vier unabhängige Geräte, echte Leitungsbedingungen, Transportmessung und subjektive Lesbarkeit |

Im virtuellen Jitterprofil traten sechs Reconciliation-Korrekturen auf. Die größte betrug 1,55 cm. Das Auslassungsprofil verwarf 108 Snapshot-Zustellungen und wies 192 verspätete oder wiederholte Zustellungen ab. Beide Profile endeten ohne Snap. Die Auslassungsprobe arbeitet auf Anwendungsebene. Der separate Netem-Lauf erfasste nach den zwei WebSocket-Tests 17 verworfene Pakete und nach Zusatzausführung des Browserlaufs 80 insgesamt. Der erste Netem-Anlauf deckte auf, dass der Angriffstest den aktuellen Tick als Index in eine Route mit einem Wegpunkt einsetzte. Der Test verwendet seither den vorgesehenen Wegpunkt 0.

Der Server veröffentlicht vollständige binäre Horde-Frames mit Entity-ID, Position, Yaw, Typ und bedarfsweise Attack-Start. Vergangene Treffer werden beim Wiederverbinden nicht erneut ausgeteilt. Autoritative HP, Posture und Mission kommen per regulärer Replikation zurück. Der Director führt die Welle im selben Serverraum weiter. Die Debug-Regression startet den Server mit `NODE_ENV=production` und gesetztem Debug-Schalter. Der Host bleibt trotz `land` und `horde-wave` im Carrier, und die Tick-Telemetrie enthält keine AI- oder Director-Debugdaten.

## Reproduktion

```sh
node --conditions=development --test --test-isolation=none apps/server/test/multiplayer.test.ts
node --conditions=development --test --test-isolation=none apps/client/test/tactical-network.test.ts
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
  FREEFALL_BROWSER_PEERS=4 node --conditions=development scripts/playtest-horde-director.mjs
PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs CHROMIUM_EXECUTABLE=/pfad/zu/chromium \
  FREEFALL_BROWSER_PEERS=4 FREEFALL_BROWSER_ANGLE=gl FREEFALL_BROWSER_SAMPLE_MS=60000 \
  node --conditions=development scripts/playtest-horde-director.mjs
```

Das Paketverlustprofil in einem eigenen Linux-Netzwerk-Namespace ausführen. Dort `lo` aktivieren, bevor der lokale Testserver startet. Die Netzkonfiguration endet mit dem Namespace.

```sh
unshare --user --map-root-user --net bash
ip link set dev lo up
tc qdisc add dev lo root netem delay 20ms 5ms loss 1% seed 421337
node --conditions=development --test --test-isolation=none \
  --test-name-pattern='four clients receive one authoritative wave|four Colyseus peers share authoritative enemy timing' \
  apps/server/test/multiplayer.test.ts
# Den Radeon-Browserbefehl oben auch in dieser Shell ausführen (12 s für den Netem-Lauf).
tc -s qdisc show dev lo
exit
```

Für weitere Zielgeräte `FREEFALL_BROWSER_ANGLE` auf das vor Ort verfügbare ANGLE-Backend setzen und den gemeldeten Renderer, Auflösung, Grafikqualität und Netzwerkprofil protokollieren. Für den WAN-Test den Produktionsbuild auf einem dedizierten Host laufen lassen. Vier getrennte Clients in denselben Raum aufnehmen. Je eine Messung im LAN und unter zusätzlicher RTT, Jitter, Wiederverbindung und paketverlustbedingter TCP-Wiederholung durchführen. Dabei Wellen-ID, aktive Gegner, Hordenframes, Tickspitzen, empfangene Bytes und Reconciliation nach dem Wiederbeitritt vergleichen. [Server- und Browser-Messwerte](ENEMY_AI_PERFORMANCE.md)
