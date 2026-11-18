# Convict System

Jede Mission initialisiert vier Convicts mit instancebezogenen Entity-IDs. Sie reisen in der Kabine mit und belegen keine Operator-Slots. Nach `DEPLOYED` verlassen sie die Kabine und besetzen feste Verteidigungspositionen rund um das Schiff.

`Convicts` prüft Sicht und Reichweite, schießt auf nahe Schwarmgegner und verwendet das vorhandene Schaden- und ShotEvent-Format. Die NPCs besitzen unabhängige HP, Waffen- und Rüstungs-IDs, Magazin, Nachladezeit und einen persistierenden Todesstatus innerhalb des Einsatzes. Gegner greifen Convicts mit demselben Nahkampfsystem wie Operatoren an. Die Bewegungs-/Zielregeln bleiben auf allen Stufen gleich.

| Schwierigkeit | Ausrüstungs-ID | Waffe | HP / Schadensminderung |
| --- | --- | --- | --- |
| Leicht | `security-surplus` | `kestrel-service` | 150 / 5 |
| Normal | `field-standard` | `kestrel-standard` | 132 / 4 |
| Herausfordernd | `light-webbing` | `kestrel-reserve` | 118 / 3 |
| Schwer | `aged-infantry` | `kestrel-legacy` | 106 / 2 |
| Extrem | `worn-reserve` | `kestrel-worn` | 96 / 1 |
| Albtraum | `restricted-issue` | `kestrel-restricted` | 84 / 0 |
| FREEFALL | `minimum-issue` | `kestrel-minimum` | 72 / 0 |

Die provisorischen Datenprofile skalieren auch Waffenschaden, Feuerrate und Magazingröße. Der Server bestimmt alle Werte. Die Clientmodelle verwenden vorhandene Soldatenrigs und Waffen mit eigener Kennfarbe. Individuelle Rüstungs- und Waffenmodelle pro Profil sowie animiertes Sitzen stehen aus. Balancing und Übernahme in eine spätere Equipment-Registry sind offen.
