# Tastenbelegung und Kamera

Die Einstellungen sind im Menü unter **Steuerung und Kamera** verfügbar. Eine Aktion auswählen und die gewünschte physische Taste oder Maustaste drücken. Bereits verwendete Eingaben zeigen die betroffene Aktion an. Esc bricht den Erfassungsmodus ab. **Standardbelegung wiederherstellen** setzt die Aktionen zurück. Der Browser speichert die Belegung lokal pro Origin.

Eine gespeicherte Belegung darf unvollständig sein, etwa wenn eine spätere Version eine Aktion ergänzt. Beim Laden bleibt jede gültige gespeicherte Taste erhalten. Fehlende oder ungültige Aktionen erhalten ihre Standardtaste, sofern diese frei ist. Ist sie bereits durch eine eigene Belegung vergeben, bleibt die Aktion **nicht belegt**, bis der Spieler eine Taste zuweist. Eine doppelt gespeicherte Taste behält die erste Aktion. Eine Taste wird nie zweimal vergeben.

Beim Belegen mit einer Maustaste werden der folgende Klick, `auxclick` und das Kontextmenü verschluckt. Sonst würde derselbe Klick den Button unter dem Mauszeiger auslösen, etwa „Standardbelegung wiederherstellen“ oder „Raum verlassen“.

| Aktion | Standard |
| --- | --- |
| Bewegen | W, A, S, D |
| Sprinten | Shift |
| Ducken | C |
| Hechtsprung | X |
| Aufstehen | Leertaste |
| Zielen / Feuern | Rechte / linke Maustaste |
| Nachladen / Nahkampf | R / V |
| Granate / Heilstim | G / H |
| Primär- / Sekundärwaffe | 1 / 2 |
| Interagieren / Rettungsballon | E / B |

Bezeichnungen im Einsatz-HUD folgen der aktiven Belegung. Shift links und rechts sind gleichwertig. Die Menü- und Telemetrietasten bleiben reserviert. Kamerawackeln, Glättung, Haltungsreaktion, Mausempfindlichkeit und reduzierte Bewegung sind im selben Menü verfügbar. [Taktische Kamera](TACTICAL_CAMERA.md)

Die Eingabeschicht unterscheidet Gameplay, Menü, Einstellungen und Rebinding. Gameplay wird bei Pointer Lock und aktivem Fenster verarbeitet. Entsperren, Ausblenden des Dokuments und Fokusverlust leeren gedrückte Tasten und einmalige Befehle und senden einen ruhenden Input. Der Menü-Kontext und die Erfassung unterbinden Gameplay-Aktionen. F2 zeigt die zuletzt verarbeitete Aktion mit ihrer physischen Zuordnung.

Der linke Stick eines Standard-Gamepads liefert einen analogen Bewegungsvektor, solange keine Tastatur-Bewegung aktiv ist. Die radiale Totzone beträgt 0,18 und die maximale Länge ist 1. Dieselben Achsen gehen an Bewegung und Dive-Intent. Gamepad-Tasten und Touch können später über denselben Action- und Netzwerkvertrag hinzugefügt werden.

Die 7.3E-Regression prüft Konflikt, Laden und Zurücksetzen der gespeicherten Belegung, Standardwerte für ältere Profile, Gameplay- und Menü-Kontext, Fokusverlust sowie begrenzte Analogachsen. Der Browser-Missionslauf verwendet C, X und Leertaste mit Pointer Lock. [Playtest](TACTICAL_MOVEMENT_PLAYTEST.md#73e--integration-und-wiederholung)
