import { FRAG, NET, PLAYER, STIM, WEAPONS } from '@freefall/shared';
import type { PlayerState } from '@freefall/shared';

export function VitalSigns({ player, tick }: { player: PlayerState; tick: number }) {
  const gear = player.equipment;
  const applying = gear?.action === 'stim';
  const recent = gear?.stimResult && tick - gear.stimResultAt < NET.tickHz * 1.5;
  const critical = player.hp > 0 && player.hp <= PLAYER.health * .35;
  return <section className={`vitals ${critical ? 'critical' : ''}`} aria-label="Vitalstatus">
    <div className="vital-heading"><strong>{player.hp}<small> HP</small></strong>
      <span>{player.hp <= 0 ? 'Gefallen' : critical ? 'Kritisch' : 'Einsatzfähig'}</span></div>
    <meter aria-label="Gesundheit" min={0} max={PLAYER.health} value={player.hp}/>
    {gear && <div className="kit-line"><span><kbd>H</kbd> Heilstim</span><b>{gear.stims}/{STIM.capacity}</b></div>}
    {applying && <ActionProgress label="Stim anwenden" remaining={gear.until - tick} ticks={gear.until - gear.started}/>}
    {!applying && recent && <small role="status">{gear.stimResult === 'completed' ? 'Heilung bestätigt' : 'Anwendung abgebrochen'}</small>}
  </section>;
}

function ActionProgress({ label, remaining, ticks }: { label: string; remaining: number; ticks: number }) {
  return <div className="kit-progress" role="status"><span>{label}</span>
    <progress aria-label={label} max={ticks} value={Math.max(0, Math.min(ticks, ticks - remaining))}/></div>;
}

export function WeaponReadout({ player, tick }: { player: PlayerState; tick: number }) {
  const gear = player.equipment;
  const slot = gear?.slot ?? 'primary';
  const other = slot === 'primary' ? 'secondary' : 'primary';
  const weapon = WEAPONS[slot];
  const switching = gear?.action === 'primary' || gear?.action === 'secondary';
  return <section className="weapon readout" aria-label="Bewaffnung">
    <span><kbd>{slot === 'primary' ? '1' : '2'}</kbd> {weapon.name}</span>
    <strong>{player.ammo ?? '–'} <small>/ {slot === 'primary' ? '∞' : gear?.pistolReserve} Reserve</small></strong>
    {gear && <>
      <div className="kit-line"><span><kbd>{other === 'primary' ? '1' : '2'}</kbd> {WEAPONS[other].name}</span><b>{gear.inactiveAmmo}</b></div>
      <div className="kit-line"><span><kbd>G</kbd> Sprenggranate</span><b>{gear.grenades}/{FRAG.capacity}</b></div>
      {(switching || gear.action === 'grenade') && <ActionProgress label={switching ? 'Waffenwechsel' : 'Granatenwurf'}
        remaining={gear.until - tick} ticks={gear.until - gear.started}/>}
    </>}
    {!!player.reloadUntil && <ActionProgress label="Nachladen" remaining={player.reloadUntil - tick} ticks={Math.ceil(weapon.reloadSeconds * NET.tickHz)}/>}
  </section>;
}
