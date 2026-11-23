/**
 * Levelkurve der Operator. Vorläufige Werte für die Testphase: Der Schritt von Level n auf n + 1 kostet
 * `firstStep + stepIncrease · (n − 1)` EP. Mit 400 bis 500 EP je erfolgreichem Einsatz liegt Level 2 nach einem bis zwei
 * Einsätzen, Level 10 nach rund 27 und die Obergrenze nach rund 640 Einsätzen.
 * Level werden nie gespeichert, sondern immer aus den Gesamt-EP abgeleitet. Eine geänderte Kurve gilt damit sofort
 * für alle Accounts.
 */
export const PROGRESSION = { maxLevel: 50, firstStep: 500, stepIncrease: 250 } as const;

/** Gesamt-EP, ab denen ein Level erreicht ist (Level 1: 0 EP). */
export function experienceForLevel(level: number): number {
  const steps = Math.max(0, Math.min(PROGRESSION.maxLevel, Math.floor(level)) - 1);
  return steps * PROGRESSION.firstStep + PROGRESSION.stepIncrease * steps * (steps - 1) / 2;
}

export function levelForExperience(experience: number): number {
  let level = 1;
  while (level < PROGRESSION.maxLevel && experience >= experienceForLevel(level + 1)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** EP seit Beginn des aktuellen Levels. */
  current: number;
  /** EP, die das aktuelle Level bis zum nächsten umfasst; 0 auf der Obergrenze. */
  needed: number;
}

export function levelProgress(experience: number): LevelProgress {
  const level = levelForExperience(experience);
  if (level >= PROGRESSION.maxLevel) return { level, current: 0, needed: 0 };
  const start = experienceForLevel(level);
  return { level, current: experience - start, needed: experienceForLevel(level + 1) - start };
}
