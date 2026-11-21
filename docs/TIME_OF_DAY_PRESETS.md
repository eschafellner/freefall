# Tageszeit · 7.7C

Die Missionskonsole bietet vier Tageszeiten für generierte Planeten. Der Host kann sie in den Plan übernehmen, bevor Boarding freigegeben wird. Der Tageszustand gilt für die gesamte Mission. Ein Plan ohne Feld erhält `day`. Ein explizites Preset beeinflusst den Plan-Hash und lässt Weltidentität, Geometrie, Objectives und Balance aus derselben Generierung bestehen.

| Preset | Wirkung |
| --- | --- |
| `day` | Bestehende Tagespalette des Planeten, Wettermodulation über Sonne, Fülllicht und Dunst |
| `overcast-day` | Mehr diffuses Fülllicht, gedämpfte Sonne, kühleres Himmelslicht |
| `dawn` | Flacherer Sonnenwinkel, leicht kühler Dämmerungshimmel, erhaltenes Fülllicht |
| `dusk` | Tiefere Sonne, wärmeres Licht, längere Schatten und zurückhaltend gedimmter Himmel |

Die Planetfarben und der Basishimmel bleiben Ausgangspunkt. Bei Bewölkung oder Dämmerung nutzt der Sky-Blend dieselbe equirektangulare Quelltextur. Er passt Helligkeit, Himmelsfarbe, Horizontdunst und die weiche Sonnenaufhellung an. Das bestehende IBL bleibt fest. Die dynamische Füllung und die direkte Sonne bestimmen den Großteil der Lichtänderung. Fog und Himmel verwenden dieselbe lineare Dunstfarbe. Der direkte ACES-Pfad rechnet Fog wie in 7.7A für die Ausgabe um. High verarbeitet Fog im bestehenden Output-Pass.

[Profile und Ausgabepfade](PLANET_ATMOSPHERE_PROFILES.md) · [Kampflesbarkeit](WEATHER_COMBAT_READABILITY.md)
