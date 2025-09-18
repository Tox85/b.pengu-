/**
 * Aligne un tick au spacing du pool
 * @param tick - Tick à aligner
 * @param spacing - Tick spacing du pool
 * @returns Tick aligné
 */
export function alignTick(tick: number, spacing: number): number {
  return Math.floor(tick / spacing) * spacing;
}

/**
 * Calcule les ticks inférieur et supérieur pour une position de liquidité
 * @param currentTick - Tick actuel du pool
 * @param spacing - Tick spacing du pool
 * @param pctRange - Pourcentage de range (ex: 15 pour ±15%)
 * @returns Objet avec lower, upper, startLower, startUpper
 */
export function alignTickRange(
  currentTick: number,
  spacing: number,
  pctRange: number
): {
  lower: number;
  upper: number;
  startLower: number;
  startUpper: number;
} {
  // Aligner le tick actuel au spacing
  const alignedCurrentTick = alignTick(currentTick, spacing);
  
  // Calculer la plage en ticks
  const rangeTicks = Math.floor((alignedCurrentTick * pctRange) / 100);
  
  // Calculer les ticks inférieur et supérieur
  const lower = alignTick(alignedCurrentTick - rangeTicks, spacing);
  const upper = alignTick(alignedCurrentTick + rangeTicks, spacing);
  
  // Calculer les start ticks pour les TickArrays (88 ticks par array)
  const startLower = Math.floor(lower / 88) * 88 * spacing;
  const startUpper = Math.floor(upper / 88) * 88 * spacing;
  
  return {
    lower,
    upper,
    startLower,
    startUpper
  };
}

/**
 * Calcule les ticks pour un range centré sur 0 (pour les tests)
 * @param spacing - Tick spacing du pool
 * @param pctRange - Pourcentage de range (ex: 15 pour ±15%)
 * @returns Objet avec lower, upper, startLower, startUpper
 */
export function alignTickRangeCentered(
  spacing: number,
  pctRange: number
): {
  lower: number;
  upper: number;
  startLower: number;
  startUpper: number;
} {
  return alignTickRange(0, spacing, pctRange);
}

/**
 * Vérifie si deux ticks sont dans le même TickArray
 * @param tick1 - Premier tick
 * @param tick2 - Deuxième tick
 * @param spacing - Tick spacing du pool
 * @returns true si les ticks sont dans le même TickArray
 */
export function areTicksInSameArray(
  tick1: number,
  tick2: number,
  spacing: number
): boolean {
  const start1 = Math.floor(tick1 / 88) * 88 * spacing;
  const start2 = Math.floor(tick2 / 88) * 88 * spacing;
  return start1 === start2;
}
