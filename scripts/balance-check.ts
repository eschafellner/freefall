/**
 * Validates the balance data in packages/shared/src/balance/data and prints the effective values.
 *
 *   npm run balance:check              validate, print version and a summary per difficulty
 *   npm run balance:check -- --explain  additionally print every resolved stat with its modifiers
 */
import { BALANCE, BASE_LOADOUT, BalanceResolutionError, BalanceValidationError, explainBalance, resolveMissionBalance } from '@freefall/shared';

try {
  const explain = process.argv.includes('--explain');
  console.log(`Balance ${BALANCE.version.release} · Schema ${BALANCE.version.schemaVersion} · Hash ${BALANCE.version.hash}`);
  console.log(`${BALANCE.weapons.size} Waffen, ${BALANCE.grenades.size + BALANCE.medicalItems.size} Ausrüstung, ` +
    `${BALANCE.enemies.size} Gegner, ${BALANCE.nests.size} Nester, ${BALANCE.difficulties.length} Schwierigkeitsgrade`);
  if (explain) for (const line of explainBalance(BASE_LOADOUT.trace)) console.log('  ' + line);
  for (const difficulty of BALANCE.difficulties) {
    const balance = resolveMissionBalance(BALANCE, difficulty.id);
    console.log(`${difficulty.level} ${difficulty.displayName.padEnd(15)} Gegner ≤ ${String(balance.limits.maxActiveEnemies).padStart(4)}` +
      ` · Nest-HP ${balance.nest.maxHealth} · Nest-Intervall ${balance.nest.spawnIntervalTicks} Ticks · Sicht ${balance.patrols.sightRange.toFixed(2)} m` +
      ` · Convict-Kit ${balance.convicts.kit.id}`);
    if (explain) for (const line of explainBalance(balance.trace)) console.log('    ' + line);
  }
  console.log('OK');
} catch (error) {
  if (error instanceof BalanceValidationError || error instanceof BalanceResolutionError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
