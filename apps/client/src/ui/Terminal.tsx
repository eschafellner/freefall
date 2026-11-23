import type { ReactNode } from 'react';

/**
 * Carrier-Terminal im Stil der Einsatzinfo (TAB): Kopf mit Ort und Titel, zweispaltiger Inhalt, Fußzeile mit den
 * Aktionen. Wird für die Missionskonsole, die Ausrüstung und das Pausenmenü verwendet.
 */
export function Terminal({ kicker, title, state, className = '', children, actions, fault, onClose, closeLabel = 'Zurück an Deck', closeKey }: {
  kicker: string; title: string; state?: ReactNode; className?: string; children: ReactNode; actions?: ReactNode;
  fault?: string; onClose?: () => void; closeLabel?: string; closeKey?: string;
}) {
  return <section className={`terminal ${className}`} aria-label={title}>
    <header className="terminal-head">
      <div><span>{kicker}</span><h1>{title}</h1></div>
      {state && <em className="terminal-state">{state}</em>}
    </header>
    <div className="terminal-body">{children}</div>
    {fault && <div className="fault terminal-fault" role="alert">{fault}</div>}
    <footer className="terminal-foot">
      {actions}
      {onClose && <button className="terminal-close" type="button" onClick={onClose}>{closeKey && <kbd>{closeKey}</kbd>}{closeLabel}</button>}
    </footer>
  </section>;
}
