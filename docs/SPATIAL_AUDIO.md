# Räumliches Audio 7.7D

Ein nativer Web-Audio-Listener folgt der gerenderten Position des lokalen Operators. Die Haltungshöhe kommt aus dem vorhandenen Posture-Collider und geht weich in die Hörerhöhe ein. Der Blickwinkel entspricht der lokalen Kamera-Yaw. Das Hörmodell bleibt beim Operator, auch wenn die Kamera an Cover nach vorne zieht oder für eine Cinematic auf einen anderen Blickpunkt wechselt.

Neue Mono-Quellen gehen über `PannerNode` mit linearer 3D-Distanzdämpfung. Kurze Effekte verwenden Equal-Power-Panning für klare Seitenortung und begrenzte CPU-Kosten. Bewegliche Fahrzeug-Loops nutzen HRTF. Die Einheit ist ein Meter, entsprechend der bestehenden Terrain-Geometrie und Albatross-Abmessung. Wind und Grundbett sind Stereo. Die ältere Waffenräumlichkeit erhält Pan, Distanzfilter und Schalllaufzeit.

| Quelle | Referenz / Ende der Dämpfung |
| --- | --- |
| Remote-Foley | 2,4 / 29 m |
| Schabenbewegung | 3 / 17 m |
| Schabenangriff | 4 / 27 m |
| Ferne Schwarmgruppe | 22 / 105 m |
| Umwelt-Akzente | 5–13 / 38–82 m, je nach Material und Gelände |
| Bewegliche Luftfahrzeuge | 3 × Albatross-Halbbreite / 152 m |

Kurze feindliche Angriffsstimmen verfolgen die gerenderten Koordinaten aus der Horde-Timeline. Albatross 02 und der Bergungsjäger verwenden die Position ihrer tatsächlich animierten Root/Flight-Meshes. Umgebungsquellen bevorzugen Landmarken in Windrichtung. Bewegliche Operator-Foley beginnt an der interpolierten Fußposition. Eine optionale Abschattung per Raycast ist offen. Der aktuelle Mix setzt auf Distanzabfall und ein begrenztes HRTF-Budget.

## Prüfung 7.7E

Im Browservergleich lag das Verhältnis der direkten zur gegenüberliegenden Seite bei etwa 4,2 zu 1 bei ±8 m. Die Quellseite lag bei +29 m noch bei rund 23 % des +8-m-Werts. Subjektive HRTF-Richtungs- und Höhenauflösung bleiben offen. [Rohdaten](playtest/7-7e/audio.json)

Firefox 159 stellte in der lokalen Probe nur die älteren AudioListener-Setter bereit. Der Client nutzt in diesem Fall `setPosition` und `setOrientation`. Chromium interpoliert Position und Orientierung weiterhin über AudioParams. [Browser-Nachweis](playtest/7-7e/browser-compatibility.json)
