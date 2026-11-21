# Kolbenstoß · 7.8C

**VERIFIED** · **V** löst den bestehenden `melee.weapon_strike` aus. Die Server-State-Machine prüft Lebens-ID, Aktion, Haltung, HP und Cooldown. Der Stoß löst am vorhandenen Impact-Tick aus. Stand, Hocke und Slide sind zulässig. Dive, PRONE, SUPINE und GETTING_UP sperren die Aktion. Ein Abbruch in der Windup-Phase verhindert die Ausführung und damit den Schwungton und Trefferfeedback.

Die vorhandene prozedurale Oberkörper- und Waffenbewegung zieht die Waffe zurück und schiebt sie am bestätigten `actionAt` nach vorne. Der Remote- und lokale Aktionsanteil verwenden die Spielersnapshot-Zeitachse. Der zugehörige Schwungton folgt dem ausgerechneten Tick. Die übrige lokale Bewegung und das Zielen behalten ihre Zeitbasis. Der Miss klingt als kurzer Schwung mit leichtem optionalem Kameraimpuls. Ein bestätigter Treffer ergänzt einen separaten Impact an seiner Kontaktposition.

**MISSING** im Ausgangsstand · Es gibt keinen dedizierten Kolbenstoß-Clip im Operator-GLB. Die vorhandene prozedurale Bewegung bleibt der integrierte Animationspfad.

[Gameplay-Werte und Stagger](MELEE_SYSTEM.md) · [Trefferfeedback](MELEE_HIT_FEEDBACK.md)
