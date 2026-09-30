

export function calculateTacticalDamage(attack, defense, pierce, tactical) {
  return calculateDamageSteps(attack, defense, pierce, tactical).damage;
}

export function calculateDamageSteps(attack, defense, pierce, tactical) {
  let damage = pierce ? attack : Math.max(0, attack - defense);
  const steps = [{ label: pierce ? '穿透，忽略防御' : '攻击减去防御（最低为 0）', value: damage }];
  const record = (label, value) => { damage = value; steps.push({ label, value }); };
  if (!tactical.isNoFixedBonus && tactical.flatPierce) record('附加穿透伤害', damage + tactical.flatPierce);
  record(`战术倍率 ×${tactical.damageMultiplier}，向下取整`, Math.floor(damage * tactical.damageMultiplier));
  if (Number.isFinite(tactical.maxDmgCap)) record(`伤害上限 ${tactical.maxDmgCap}`, Math.min(damage, tactical.maxDmgCap));
  if (!tactical.isNoFixedBonus) {
    if (tactical.finalBonusDamage) record('最终伤害加成', damage + tactical.finalBonusDamage);
    if (tactical.finalDamageReduction) record('最终固定减伤', damage - tactical.finalDamageReduction);
  }
  if (damage < 0) record('伤害最低为 0', 0);
  return { attack, defense, pierce: !!pierce, steps, damage };
}

export function finalizeDamageExplanation(calculation, resolvedDamage, attacker, defender) {
  // Public logs must not reveal hidden attack/defense values, even after stealth expires.
  if ([attacker, defender].some(p => p.cardId === 'char_10' || p.stealthActive)) return null;
  const steps = [...calculation.steps];
  if (resolvedDamage !== calculation.damage) steps.push({ label: '角色技能及状态修正合计', value: resolvedDamage });
  return { ...calculation, steps, damage: resolvedDamage };
}
