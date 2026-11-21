# Terrain und Kollision

Die Serverbewegung, Clientvorhersage, Strahlen und Meshes tasten dasselbe triangulierte Höhenfeld ab. Bodenhaltung nutzt die lokale Höhe. Der Dive läuft mit einem relativen Bogen über der Oberfläche und reserviert mit dem vorhandenen Sweep Raum für die Landung. Prone und Supine beziehen die Höhen der Körperzonen bei Beschuss und Gegnerkontakt ein. Die Rig-Animation verwendet weiterhin die vorhandenen Bewegungsclips.

Hitscan, Granaten, Sichtprüfungen und die Kamera schneiden das Höhenfeld entlang der Gitter- und Dreieckskanten. Gegner- und Nest-Trefferkörper werden an der Bodenhöhe positioniert. Die Hordenposition bleibt als X/Z im ECS. Felsen, Eis und Stämme verwenden getrennte AABB-Proxies. Der Sandsteinbogen besitzt seitliche Stützen und einen erhöhten Span, unter dem Bodenbewegung möglich ist. Markante Felsen sind bewusst konservativ kollidierbar. Bodendetails und Kronen sind visuell.

Die Kollisionsgrenze liegt bei 240 m vom Zentrum. Hindernis- und Navigationsdaten stammen aus dem aktiven WorldPlan. Die vorhandenen ebenen Szenen behalten ihre Bodenhöhe von null. [Navigation](WORLD_NAVIGATION.md)
