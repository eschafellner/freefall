# Weapon VFX · 7.8A

7.8A ergänzt die Schusspräsentation der vorhandenen Primärwaffe und Dienstpistole. Die Animation übernimmt weiterhin den vorhandenen Oberkörper-Kick und beim prozeduralen Sidearm den Schlittenzyklus. Der bestehende kurze Sichtfeldimpuls läuft beim lokalen Start des Schusses beziehungsweise bei einem gültigen Echo ohne zugehörige Prediction. Die bestehende Recoil-Vorhersage für Pitch und Yaw bleibt davon unabhängig. Schussaudio verwendet unverändert die Schussprofile und die räumliche Mischung aus 7.7D.

## Hülsenauswurf

Das Gewehr und die Pistole besitzen einen separaten `EjectionPort` am Verschluss. Ein importierter gleichnamiger Marker ersetzt den prozeduralen Socket, sofern vorhanden. Die Hülse verlässt den Port in Richtung der positiven lokalen X-Achse mit einer kleinen Aufwärtskomponente. Ein kurzer berechneter Bogen, Drehung und Ausblenden genügen für die sichtbare Bewegung. Die Hülse wird nach 640 ms freigegeben. Der Auswurf berücksichtigt den Boden und nahe Deckung.

Low zeigt bis zu vier lokale Hülsen. Medium und High zeigen auch Hülsen naher anderer Schützen. Die Kamera blendet sehr nahe Hülsen aus. Der lokale Schütze erhält bei gefülltem Pool Vorrang.

## Haltungen und Waffenwahl

Die Animation löst vor Auswertung der Sockets aus. Anschließend liefern prozedurale Pose oder GLB-Handmontage die aktuellen Welttransforms. Der Waffenslot des Schusses muss zu der tatsächlich dargestellten Waffe passen. Eine lokal interpolierte Pose darf dafür bis zu 100 ms nachziehen. Die bestehenden Aktionsregeln gewähren Schussfeedback in STANDING, CROUCHING, PRONE und SUPINE. DIVING und GETTING_UP bleiben gesperrt.

Die Regler für Mündungsfeuer und reduzierte Bewegung stehen unter **Steuerung und Kamera**. Der Regler für Mündungsfeuer skaliert die Laufhelligkeit und das optionale Lauflicht von 0 bis 100 Prozent. Er beeinflusst weder den bestätigten Tracer noch das HUD.

- [Lauftransform und Tracer](MUZZLE_FLASH_AND_TRACERS.md)
- [Netzwerkreihenfolge und Deduplication](COMBAT_VFX_MULTIPLAYER.md)
- [Pools und Messwerte](COMBAT_VFX_PERFORMANCE.md)
