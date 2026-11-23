import { RESOURCES, formatResourceAmounts, hasResources } from '@freefall/shared';
import type { ResourceAmounts, ResourceBalance, ResourceId } from '@freefall/shared';

const number = new Intl.NumberFormat('de-DE');

/** Guthaben je Ressource. `ids`: Auswahl (Standard: alle), `max`: Obergrenze mit anzeigen. */
export function ResourceBar({ balance, ids, max = false }: { balance?: Partial<ResourceBalance>; ids?: readonly ResourceId[]; max?: boolean }) {
  const shown = RESOURCES.filter(({ id }) => !ids || ids.includes(id));
  return <ul className="resource-bar" aria-label="Ressourcen">
    {shown.map(({ id, displayName, shortName, description, max: limit }) => {
      const amount = balance?.[id] ?? 0;
      return <li key={id} className={`resource ${id}${amount >= limit ? ' full' : ''}`} title={`${displayName}: ${description}`}>
        <i aria-hidden="true"/>
        <b>{number.format(amount)}{max && <small>/{number.format(limit)}</small>}</b>
        <span>{max ? displayName : shortName}</span>
      </li>;
    })}
  </ul>;
}

/** Gutschrift eines Einsatzes, mit dem an der Obergrenze verfallenen Teil. */
export function ResourceGain({ credited, forfeited }: { credited?: ResourceAmounts; forfeited?: ResourceAmounts }) {
  if (!hasResources(credited) && !hasResources(forfeited)) return null;
  return <span className="resource-gain">
    {hasResources(credited) && <span>+{formatResourceAmounts(credited)}</span>}
    {hasResources(forfeited) && <em>Maximum erreicht, verfallen: {formatResourceAmounts(forfeited)}</em>}
  </span>;
}
