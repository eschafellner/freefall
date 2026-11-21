# Playtest-Loadout

Beim Erstellen einer Mission erhält jeder Operator zwei Granaten, fünf persönliche Stims, eine Kestrel AR-01 mit 45 Patronen und acht Reservemagazinen sowie eine P-01 mit 12 Patronen und vier Reservemagazinen (`weapons.json`, siehe [TACTICAL_RELOADING](TACTICAL_RELOADING.md)). Der Arenamodus vergibt beim Respawn ein neues Loadout. Die Mission hat keinen Feld-Respawn.

**1 / 2** wählen den Slot. **R** lädt die aktive Waffe. **G** wirft, **H** heilt. **B** aktiviert den Ballon. **E** interagiert und sichert. Die frühere Abstimmung über ein vorzeitiges Einsatzende ist entfallen. Das Mausrad bleibt frei.

## Zeit und Konflikte

Der Server akzeptiert nur aufsteigende Input-Sequenzen. Equipment ist ein einmaliger Impuls mit der aktuellen Lebens-/Platzierungsnummer. Zwischen zwei Ticks gilt der erste angeforderte Equipment-Impuls. Der Client meldet seinen Wunsch, Bestände und Abschlusszeit berechnet der Server. Die Reservierung über einen Verbindungsabbruch behält denselben SimPlayer. Snapshots enthalten Slot, beide Magazinbestände, Pistolenreserve, Stückzahlen, Aktion und Start-/Endtick.

Ein Wechsel dauert 0,48 s und bricht einen laufenden Reload vor dem Munitionstransfer ab. Die alte Waffe senkt sich, auf halbem Weg wird das sichtbare Modell gewechselt. Feuer wird ab Abschluss zugelassen. Nachladen hat Vorrang vor gleichzeitigem Feuer. Eine leere, gehaltene Waffe fordert automatisch einen Reload an. Während Wurf oder Wechsel verfallen weitere Equipment-Impulse.

Ein Heilstim braucht 1,2 s und heilt bei Abschluss 40 % der maximalen HP, gedeckelt auf MaxHealth. Volle HP, leerer Bestand, Sprint, Feuer oder Reload verhindern den Start. Sprint, Feuer, Reload, Slotanforderung, Tod und Disconnect unterbrechen eine laufende Anwendung. Ein bloßer Eingabe-Timeout ohne Disconnect unterbricht nicht. Nur ein erfolgreicher Abschluss verbraucht einen Stim. Normale Bewegung ist erlaubt.

Die Granate verlässt 0,22 s nach Wurfbeginn die Hand, verbraucht eine Ladung und erhält eine raumweit eindeutige Nummer. Der Server simuliert den Flug in festen Schritten, prüft Hindernisse per Segment, stoppt die Horizontalbewegung bei Kontakt und zündet nach 1,65 s. Die Wirkung nimmt linear mit der dreidimensionalen Entfernung ab. Deckung verwendet dieselbe horizontale Sichtprüfung wie der Nahkampf. Schaden betrifft Gegner und aktive Nester. Operatoren (auch der Werfer selbst) und Convicts erhalten reduzierten Schaden (30 %, siehe [FRIENDLY_FIRE](FRIENDLY_FIRE.md)). Das Schiff ist ausgenommen. Ein frischer UniformGrid-Index versorgt alle Explosionen desselben Ticks. Die bestehenden Nest-HP und die Zerstörungsroutine regeln Produktionsstopp und Missionsereignisse. Replizierte Projektilpositionen und Zündtick treiben die gepoolte Darstellung an.
