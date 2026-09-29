

export function calculateTacticalDamage(attack, defense, pierce, tactical) {
  let damage = pierce ? attack : Math.max(0, attack - defense);
  if (!tactical.isNoFixedBonus) damage += tactical.flatPierce;
  damage = Math.min(Math.floor(damage * tactical.damageMultiplier), tactical.maxDmgCap);
  if (!tactical.isNoFixedBonus) {
    damage += tactical.finalBonusDamage;
    damage -= tactical.finalDamageReduction;
  }
  return Math.max(0, damage);
}
