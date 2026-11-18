# Permanente Schwarmnester

`SwarmNestManager` verwaltet aktive Nester mit Nest- und Fraktions-ID, Position, Rotation, Lebenspunkten, Lebensphase, Spawn-Intervall, Cooldown, Budget, Schwierigkeitsfaktor und optionaler Durchbruch-ID. Ein Nest verbleibt bis zur Zerstörung oder zum Missionsende. Unter Last bleibt ein einzelner ausstehender Spawn pro Nest vorgemerkt.

| Zustand | Verhalten |
| --- | --- |
| EMERGING | Der Server reserviert die Position. Das Nest wächst und produziert nach dem Öffnungstick. |
| ACTIVE | Das Nest erzeugt zeitlich versetzte Schaben an drei rotierenden Austrittspunkten. |
| DAMAGED | Schaden und Restleben sind synchronisiert. Die Produktion läuft fort. |
| DESTROYING | Das Nest scheidet sofort aus der aktiven Registry aus. Staub und Geröll begleiten den Einsturz. |
| DESTROYED | Der Rest ist für den Einsatz gespeichert. Bereits produzierte Schaben bleiben aktiv. |

Das Kestrel-Gewehr prüft Deckung, Gegner und Nest-Hitvolumen entlang des vorhandenen Trefferstrahls. Nester starten auf Normal mit 360 HP. Treffer und Zerstörungen senden Ereignisse. Nest-Snapshots halten Leben, Entstehung, letzten Treffer und letzten Spawn. So entstehen bei einem Beitritt weder doppelte Nester noch fehlende Ausstiegseffekte. Zerstörungen zählen zum Nebenziel und senken den Threat-Anteil aus aktiven Nestern im nächsten Tick.

Der Server produziert keine Schabe direkt neben einem lebenden Spieler am Auslass. Gegnerbudget, Tick-Budget und Nestanzahl begrenzen die Produktion. Der Hügel fängt Treffer ab. Bewegungs-Kollision und Beschattung dynamischer Hügel sind offen. [Schwarmdurchbrüche](SWARM_BREACH_SYSTEM.md)
