import { useEffect, useRef, useState } from 'react';
import { planetWeather } from '@freefall/shared';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { AudioLayers, SOUNDSCAPES } from '../audio/Soundscape.ts';
import { PRIORITY } from '../audio/VoiceBudget.ts';

const MATERIALS = ['snow', 'ice', 'sand', 'grass', 'dirt', 'rock', 'forest-floor'];

export function AudioLab() {
  const engineRef = useRef<AudioEngine | null>(null);
  const layersRef = useRef<AudioLayers | null>(null);
  const [planet, setPlanet] = useState('ice');
  const [weather, setWeather] = useState('clear-cold');
  const [surface, setSurface] = useState('snow');
  const [side, setSide] = useState(10);
  const [message, setMessage] = useState('');
  const [audition, setAudition] = useState<'off' | 'mix' | 'wind'>('off');
  const profile = SOUNDSCAPES[planet]!;
  const states = planetWeather(planet);

  function audio(): AudioEngine {
    const engine = engineRef.current ??= new AudioEngine();
    engine.settings.enabled = true;
    engine.resume();
    return engine;
  }

  useEffect(() => () => { layersRef.current?.clear(); engineRef.current?.close(); }, []);

  function listen(mode: 'mix' | 'wind'): void {
    audio();
    setMessage('Audio wird vorbereitet …');
    setAudition(mode);
  }

  useEffect(() => {
    if (audition === 'off' || !engineRef.current) return;
    const engine = engineRef.current;
    const layers = layersRef.current ??= new AudioLayers(engine);
    const timer = window.setInterval(() => {
      layers.set('bed', audition === 'mix' ? profile.bed : undefined, 'ambience', profile.baseLevel, 2);
      layers.set('weather', profile.wind, 'weather', profile.weather[weather] ?? .15, 2);
      const stats = engine.metrics();
      setMessage(`${stats.context} · ${stats.voices}/${stats.budget} Stimmen · ${stats.pcmMiB.toFixed(1)} MiB · ${stats.errors} Fehler${stats.duck ? ' · Ducking' : ''}`);
    }, 150);
    return () => window.clearInterval(timer);
  }, [audition, profile, weather]);

  async function sample(id: string, kind: 'step' | 'attack' | 'spatial' | 'stress'): Promise<void> {
    const engine = audio();
    if (!engine.context) return;
    const buffer = await engine.assets.load(engine.context, id);
    if (!buffer) { setMessage('Audio konnte nicht geladen werden.'); return; }
    engine.listener({ x: 0, y: 1.4, z: 0 }, 0);
    if (kind === 'stress') {
      for (let i = 0; i < 1000; i++) engine.play(id, { bus: 'environment', owner: 'test:' + i,
        level: .045, priority: PRIORITY.detail });
      const urgent = await engine.assets.load(engine.context, 'confirm');
      if (urgent) engine.play('confirm', { bus: 'ui', owner: 'test:alert', level: .66, priority: PRIORITY.alert });
    } else engine.play(id, {
      bus: kind === 'attack' ? 'weapons' : 'environment', level: .84,
      priority: kind === 'attack' ? PRIORITY.threat : PRIORITY.world,
      position: kind === 'spatial' ? { x: side, y: 1, z: -4 } : undefined, range: [3, 36],
    });
    if (kind === 'attack') engine.duck(.55);
    const stats = engine.metrics();
    setMessage(`${stats.context} · ${stats.voices}/${stats.budget} Stimmen · ${stats.dropped} verworfen`);
  }

  return <main className="panel audio-lab">
    <h1>Audio-Test</h1>
    <fieldset><legend>Soundscape</legend>
      <label>Planet <select value={planet} onChange={({ target }) => {
        setPlanet(target.value); setWeather(planetWeather(target.value)[0].id);
      }}>{Object.keys(SOUNDSCAPES).map((id) => <option key={id}>{id}</option>)}</select></label>
      <label>Wetter <select value={weather} onChange={({ target }) => setWeather(target.value)}>
        {states.map((state) => <option key={state.id}>{state.id}</option>)}</select></label>
      <button onClick={() => listen('mix')}>Soundscape spielen</button>
      <button onClick={() => listen('wind')}>Wetter einzeln spielen</button>
      <button onClick={() => { setAudition('off'); layersRef.current?.clear(); setMessage('Gestoppt'); }}>Stoppen</button>
    </fieldset>
    <fieldset><legend>Foley und Raumklang</legend>
      <label>Oberfläche <select value={surface} onChange={({ target }) => setSurface(target.value)}>
        {MATERIALS.map((name) => <option key={name}>{name}</option>)}</select></label>
      <button onClick={() => void sample(surface + '-1', 'step')}>Schritt spielen</button>
      <label>Position (m) <input type="range" min={-34} max={34} value={side} onChange={({ target }) => setSide(+target.value)}/></label>
      <button onClick={() => void sample(profile.details + '-1', 'spatial')}>3D-Quelle spielen</button>
      <button onClick={() => void sample('schabe-hiss-1', 'attack')}>Windup spielen</button>
      <button onClick={() => void sample('schabe-chitter-1', 'stress')}>1.000 Audioereignisse testen</button>
    </fieldset>
    <output aria-live={audition === 'off' ? 'polite' : 'off'}>{message}</output>
  </main>;
}
