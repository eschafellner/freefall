import { useEffect, useState } from 'react';
import { ACTION_LABELS, INPUT_ACTIONS, bindings, keyboardCode } from '../input/Bindings.ts';
import type { InputAction } from '../input/Bindings.ts';
import { cameraPreferences, setCameraPreferences } from '../rendering/CameraPreferences.ts';

export function ControlSettings({ onChange }: { onChange: () => void }) {
  const [editing, setEditing] = useState<InputAction>();
  const [notice, setNotice] = useState('');
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!editing) return;
    const choose = (code: string) => {
      const error = bindings.rebind(editing, code);
      setNotice(error ?? '');
      if (!error) {
        setEditing(undefined);
        onChange();
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.code === 'Tab') { setEditing(undefined); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') { setEditing(undefined); setNotice(''); }
      else if (!event.repeat) choose(keyboardCode(event.code));
    };
    const mouse = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose(`Mouse${event.button}`);
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('mousedown', mouse, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('mousedown', mouse, true);
    };
  }, [editing, onChange]);

  return <details className="control-settings" onContextMenu={(event) => { if (editing) event.preventDefault(); }}>
    <summary>Steuerung und Kamera</summary>
    <div className="binding-grid">
      {INPUT_ACTIONS.map((action) => <button key={action} type="button" className="binding-button"
        aria-label={`${ACTION_LABELS[action]} (${bindings.label(action)})`} aria-pressed={editing === action}
        onClick={() => { setEditing(action); setNotice(''); }}>
        <span>{ACTION_LABELS[action]}</span><kbd>{editing === action ? 'Eingabe …' : bindings.label(action)}</kbd>
      </button>)}
    </div>
    {(editing || notice) && <p role="status">{notice || 'Taste oder Maustaste drücken. Esc bricht ab.'}</p>}
    <button type="button" className="text-button" onClick={() => {
      bindings.reset(); setEditing(undefined); setNotice(''); onChange();
    }}>Standardbelegung wiederherstellen</button>
    <fieldset className="audio-settings"><legend>Kamera</legend>
      <label>Wackeln <input type="range" min={0} max={100} value={cameraPreferences.shake * 100}
        onChange={(e) => { setCameraPreferences('shake', Number(e.target.value) / 100); refresh((n) => n + 1); }}/></label>
      <label>Glättung <input type="range" min={50} max={200} step={5} value={cameraPreferences.smoothing * 100}
        onChange={(e) => { setCameraPreferences('smoothing', Number(e.target.value) / 100); refresh((n) => n + 1); }}/></label>
      <label className="reduced-motion"><input type="checkbox" checked={cameraPreferences.reducedMotion}
        onChange={(e) => { setCameraPreferences('reducedMotion', e.target.checked); refresh((n) => n + 1); }}/> Reduzierte Bewegung</label>
    </fieldset>
  </details>;
}
