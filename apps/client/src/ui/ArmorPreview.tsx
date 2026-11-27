import { useEffect, useRef } from 'react';
import * as T from 'three';
import type { OperatorLook } from '@freefall/shared';
import { PlayerRigBatches } from '../rendering/characters/PlayerRigBatches.ts';
import { PlayerVisualController } from '../rendering/characters/PlayerVisualController.ts';
import { createOperatorWardrobe } from '../rendering/characters/operator/Catalog.ts';
import { TONE_MAPPING } from '../rendering/ToneMapping.ts';
import { createKestrel } from '../rendering/weapons/Kestrel.ts';

/**
 * Turntable of one operator in a look (Rüstkammer). Own small renderer, created while the terminal is open and fully
 * released on close; the operator idles with the standard rifle while the camera swings around it.
 */
export function ArmorPreview({ look, team }: { look: OperatorLook; team: number }) {
  const host = useRef<HTMLDivElement>(null);
  const operator = useRef<PlayerVisualController>(undefined);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = TONE_MAPPING;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = T.SRGBColorSpace;
    element.append(renderer.domElement);
    const scene = new T.Scene();
    const fill = new T.HemisphereLight(0xc9d8dc, 0x2a2620, 1.7);
    const key = new T.DirectionalLight(0xffedda, 2.1);
    key.position.set(2.5, 4, 3);
    const rim = new T.DirectionalLight(0x8fc7ff, 1.1);
    rim.position.set(-3, 2.5, -3);
    const floor = new T.Mesh(new T.CircleGeometry(.9, 40), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(fill, key, rim, floor);
    const camera = new T.PerspectiveCamera(28, 1, .1, 30);
    camera.position.set(0, 1.25, 4.3);
    camera.lookAt(0, .92, 0);
    const wardrobe = createOperatorWardrobe();
    const rifle = createKestrel();
    const model = new PlayerVisualController(wardrobe, rifle, team);
    operator.current = model;
    model.setLook(look);
    scene.add(model.root);
    const batches = new PlayerRigBatches(scene, [model.root], false);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame = 0, tick = 0, last = performance.now(), running = true;
    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      tick += dt * 30;
      // Turntable: the camera circles the operator, who stands at ease facing it.
      const angle = .3 + Math.sin(now / 1000 * .28) * .75;
      camera.position.set(Math.sin(angle) * 4.3, 1.25, Math.cos(angle) * 4.3);
      camera.lookAt(0, .92, 0);
      model.draw('preview', 1, 100, 0, 0, Math.PI * .92, -.04, false, false, 0, Math.floor(tick), now, dt, true);
      scene.updateMatrixWorld();
      batches.draw(camera);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      batches.dispose();
      model.dispose();
      operator.current = undefined;
      wardrobe.dispose();
      for (const part of [rifle.body, rifle.optic, rifle.magazine, rifle.pistol.body, rifle.pistol.optic, rifle.pistol.magazine]) part.dispose();
      rifle.pistol.slide?.dispose();
      rifle.finish.dispose();
      floor.geometry.dispose();
      (floor.material as T.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [team]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { operator.current?.setLook(look); }, [look.armor, look.helmet, look.pack]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="armor-preview" ref={host} aria-hidden="true"/>;
}
