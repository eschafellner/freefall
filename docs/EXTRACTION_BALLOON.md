# Extraktionsballon

`extraction.balloon` ist die Item-ID des Extraktionsballons. Der Einsatz stellt ihn nach Abschluss der Hauptziele zur Verfügung. Der Auslöser muss leben, verbunden sein und auf freiem Boden außerhalb der Schiffskabine stehen. Eine Aktivierung sendet `ExtractionBeaconActivated` samt Position an den PatrolManager, erhöht die lokale Alarmhitze und verlagert den Fokus des Directors auf das Signal.

- **Countdown.** 90 Sekunden ab Aktivierung. Der Fallback-Behälter öffnet sich, die orange Hülle steigt auf und das Signal pulsiert mit etwa 0,65 Hz.
- **Sicherung.** Andere Operator sichern sich mit **E** in der Zone. Der Server begrenzt XZ-Bewegung über Kollision und 25-Meter-Radius. Die Client-Prediction nutzt dieselbe Regel.
- **Ausfall des Auslösers.** Tod und Disconnect lösen die Sicherung vor dem Einfangen. Der nächste gesicherte Operator übernimmt. Ohne gesicherte Person bleibt der gestartete Ballon bis zum Rettungsmoment verfügbar. Ein neuer Operator kann sich anschließen. Verpasst der Jäger alle Operatoren, beginnt am selben Ballon ein neuer Countdown. Pro Einsatz kann nur ein Ballon aktiviert werden.
- **Abholung.** Nach dem Countdown fliegt der Extraction Fighter drei Sekunden auf die Hülle zu. Nach dem festen Servertick werden die gesicherten lebenden Operator in der zweisekündigen Hebephase dargestellt. Ein Abbruch der Verbindung nach dem Einfangen ändert den gutgeschriebenen Rettungsmoment nicht.

Die vier Seile verwenden kurze, geglättete Linien mit berechnetem Durchhang. Ein gepoolter mechanischer Fallback stellt Jäger, Schub und Fangvorrichtung dar. Namen, Flugkurve, Seilradius, Countdown und endgültige Audio-/Modelldaten stehen zur Designfreigabe aus.

## Musik

Mit der Aktivierung des Ballons beginnt „Last Stand“ und begleitet Countdown, Anflug und Abholung. Mit dem Missionsergebnis blendet das Stück innerhalb von 1,5 Sekunden aus, die Ergebnismusik übernimmt (siehe [DEPLOYMENT_SYSTEM](DEPLOYMENT_SYSTEM.md)). Die Albatross-Extraktion behält den regulären Mix. [Quellen](music-sources.json)
