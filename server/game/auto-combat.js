// ============================================================
// 校园战力党 - 货币战争自动战斗
// ============================================================

function rollDie(faces) {
  const safeFaces = Math.max(1, Math.floor(Number(faces) || 1));
  return Math.floor(Math.random() * safeFaces) + 1;
}

function rollDice(pool) {
  return pool.map(rollDie);
}

function skillId(fighter, kind) {
  return fighter.skillsDisabled ? null : fighter.coreSkills?.[kind]?.id;
}

function courseMultiplier(fighter, opts = {}) {
  const value = fighter.courseMultiplier ?? opts.courseMultiplier ?? 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function selectDice(rolls, faces, slots, limitD10 = false) {
  const count = slots === -1
    ? rolls.length
    : Math.max(0, Math.min(rolls.length, Math.floor(Number(slots) || 0)));
  const ordered = rolls
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const selected = [];
  let d10Selected = false;
  for (const die of ordered) {
    if (selected.length >= count) break;
    const isD10 = faces[die.index] === 10;
    if (limitD10 && isD10 && d10Selected) continue;
    selected.push(die.index);
    if (isD10) d10Selected = true;
  }
  return selected.sort((a, b) => a - b);
}

function selectedValues(rolls, indices) {
  return indices.map(index => rolls[index]);
}

function preventMaximumRolls(rolls, faces) {
  for (let index = 0; index < rolls.length; index++) {
    if (rolls[index] >= faces[index]) rolls[index] = Math.max(1, faces[index] - 1);
  }
}

function invertMinimumRoll(rolls, faces) {
  if (rolls.length === 0) return false;
  let minIndex = 0;
  for (let index = 1; index < rolls.length; index++) {
    if (rolls[index] < rolls[minIndex]) minIndex = index;
  }
  const face = Math.max(1, Math.floor(Number(faces[minIndex]) || 1));
  rolls[minIndex] = Math.max(1, Math.min(face, face + 1 - rolls[minIndex]));
  return true;
}

function applyMinimumBoost(rolls, boost, faces = []) {
  if (rolls.length === 0 || boost <= 0) return;
  let minIndex = 0;
  for (let index = 1; index < rolls.length; index++) {
    if (rolls[index] < rolls[minIndex]) minIndex = index;
  }
  const face = Math.max(1, Math.floor(Number(faces[minIndex]) || rolls[minIndex] + boost));
  rolls[minIndex] = Math.min(face, rolls[minIndex] + boost);
}

function reduceMaximumSelected(values, amount) {
  if (values.length === 0 || amount <= 0) return false;
  const maxIndex = values.indexOf(Math.max(...values));
  values[maxIndex] = Math.max(1, values[maxIndex] - amount);
  return true;
}

function addEntryDamage(entry, field, value) {
  if (value > 0) entry[field] = (entry[field] || 0) + value;
}

function rollFlatAttackBonus(effect) {
  if (!effect || typeof effect !== 'object') return 0;
  const sources = Array.isArray(effect.sources) && effect.sources.length > 0
    ? effect.sources
    : [{ chance: effect.chance ?? 1, value: effect.value }];
  return sources.reduce((total, source) => {
    const chance = Math.max(0, Math.min(1, Number(source?.chance) || 0));
    const value = Math.max(0, Number(source?.value) || 0);
    if (value <= 0 || chance <= 0) return total;
    return total + (chance >= 1 || Math.random() < chance ? value : 0);
  }, 0);
}

function applyRollSelfDamage(fighter, rolls, entry) {
  if (skillId(fighter, 'negative') !== 'royal_etiquette') return 0;
  const ones = rolls.filter(value => value === 1).length;
  if (ones > 0) {
    fighter.hp = Math.max(0, fighter.hp - ones);
    addEntryDamage(entry, 'royalEtiquetteDamage', ones);
  }
  return ones;
}

function reviveIfNeeded(fighter, supportBuffs, entry, label) {
  if (fighter.hp > 0) return false;

  if (fighter === fighter.supportOwner && supportBuffs?.revive && !fighter.supportRevived) {
    fighter.supportRevived = true;
    fighter.hp = Math.min(fighter.maxHp, Math.max(1, supportBuffs.revive.hp));
    entry[`supportRevived${label}`] = fighter.hp;
    if (supportBuffs.revive.diceBoost) {
      const count = supportBuffs.revive.diceCount || 2;
      for (let index = 0; index < Math.min(count, fighter.dicePool.length); index++) {
        fighter.dicePool[index] += supportBuffs.revive.diceBoost;
      }
    }
    return true;
  }

  if (skillId(fighter, 'positive') === 'nine_lives' && !fighter.nineLivesUsed) {
    fighter.nineLivesUsed = true;
    fighter.hp = Math.min(fighter.maxHp, 9);
    fighter.dicePool = fighter.dicePool.map(() => 10);
    entry[`nineLives${label}`] = true;
    return true;
  }
  return false;
}

function buildFighter(config, buffs = {}, opts = {}, side) {
  const dicePool = Array.isArray(config.dicePool)
    ? config.dicePool.map(face => Math.max(1, Math.floor(Number(face) || 1)))
    : [];
  const hp = Math.max(1, Number(config.hp) || 1);
  const sourceId = config.id || config.charId || config.name || 'unknown';
  const fighter = {
    id: `${side || 'fighter'}:${sourceId}`,
    sourceId,
    side,
    name: config.name || '未知',
    hp,
    maxHp: hp,
    dicePool,
    atkSlots: Number.isInteger(config.atkSlots) ? config.atkSlots : dicePool.length,
    defSlots: Number.isInteger(config.defSlots) ? config.defSlots : dicePool.length,
    coreSkills: config.coreSkills || { positive: null, negative: null },
    rerollAll: !!config.rerollAll,
    courseMultiplier: config.courseMultiplier ?? opts.courseMultiplier ?? 1,
    supportBuffs: side === 'p1' ? buffs : {},
    rerolls: 1 + (side === 'p1' ? (buffs.extraRerolls || 0) : 0),
    chargeStacks: Math.max(0, Math.floor(Number(config.chargeStacks) || 0)),
    nodeType: config.nodeType || 'normal',
    redHeat: 0,
    stickers: 0,
    selfStickers: 0,
    permanentDefPenalty: 0,
    nineLivesUsed: false,
    supportRevived: false,
    hasTakenDamage: false,
    extraTurnQueued: false,
    dreamStacks: 0,
    dreamState: false,
    skillsDisabled: false,
  };
  const positive = fighter.coreSkills.positive?.id;
  if (positive === 'no_reroll_bonus' || positive === 'invert_die') fighter.rerolls += 1;
  if (positive === 'star_showoff') fighter.rerolls += 2;
  fighter.supportOwner = side === 'p1' ? fighter : null;
  return fighter;
}

function applyPreAttackDamage(attacker, entry, supportBuffs) {
  let damage = 0;
  if (attacker.redHeat > 0) {
    const heat = attacker.redHeat;
    damage += heat;
    attacker.hp = Math.max(0, attacker.hp - heat);
    attacker.redHeat = Math.max(0, attacker.redHeat - 1);
    entry.redHeatDmg = heat;
  }
  const multi = courseMultiplier(attacker);
  if (skillId(attacker, 'negative') === 'sugar_crash' && attacker.sugarCrash) {
    const sugarDamage = Math.floor(4 * multi);
    attacker.hp = Math.max(0, attacker.hp - sugarDamage);
    damage += sugarDamage;
    entry.sugarCrashDmg = sugarDamage;
    attacker.sugarCrash = false;
  }
  if (skillId(attacker, 'negative') === 'unsustainable') {
    const unsustainableDamage = Math.floor(2 * multi);
    attacker.hp = Math.max(0, attacker.hp - unsustainableDamage);
    damage += unsustainableDamage;
    entry.unsustainableDmg = unsustainableDamage;
  }
  if (attacker.hp <= 0) reviveIfNeeded(attacker, supportBuffs, entry, attacker.side === 'p1' ? 'P1' : 'P2');
  return damage;
}

function finishReviveChecks(p1, p2, entry, buffs) {
  reviveIfNeeded(p1, buffs, entry, 'P1');
  reviveIfNeeded(p2, {}, entry, 'P2');
}

/**
 * 执行一场完整的自动战斗。
 * @param {object} fighter1 阵眼角色 (玩家)
 * @param {object} fighter2 AI 对手
 * @param {object} buffs 辅阵增益
 * @param {object} opts 额外选项，例如 { courseMultiplier, atkBonusThisPlane }
 */
export function autoResolveMatch(fighter1, fighter2, buffs = {}, opts = {}) {
  const p1 = buildFighter(fighter1, buffs, opts, 'p1');
  const p2 = buildFighter(fighter2, {}, {}, 'p2');
  const log = [];
  const MAX_ROUNDS = 50;
  let round = 0;
  let attacker = p1;
  let defender = p2;
  let currentExtraTurn = false;

  while (p1.hp > 0 && p2.hp > 0 && round < MAX_ROUNDS) {
    round++;
    const entry = {
      round,
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerSide: attacker.side,
      defenderSide: defender.side,
      attacker: attacker.name,
      defender: defender.name,
    };
    const attackerMulti = courseMultiplier(attacker, opts);
    const defenderMulti = courseMultiplier(defender, opts);
    if (currentExtraTurn && skillId(attacker, 'positive') === 'extra_turn') {
      attacker.rerolls += 2;
      entry.extraTurnFaceBoost = 2;
    }
    applyPreAttackDamage(attacker, entry, attacker.supportBuffs);
    if (attacker.hp <= 0) {
      finishReviveChecks(p1, p2, entry, buffs);
      entry.p1HP = p1.hp;
      entry.p2HP = p2.hp;
      log.push(entry);
      break;
    }

    const atkFaces = [...attacker.dicePool].map(face => (
      currentExtraTurn && skillId(attacker, 'positive') === 'extra_turn' ? face + 2 : face
    ));
    let atkRolls = rollDice(atkFaces);
    applyRollSelfDamage(attacker, atkRolls, entry);
    if (attacker.hp <= 0 && !reviveIfNeeded(attacker, attacker.supportBuffs, entry, attacker.side === 'p1' ? 'P1' : 'P2')) {
      entry.selfKill = attacker.side;
      entry.p1HP = p1.hp;
      entry.p2HP = p2.hp;
      log.push(entry);
      break;
    }
    if (skillId(defender, 'positive') === 'invert_die') preventMaximumRolls(atkRolls, atkFaces);
    if (skillId(attacker, 'positive') === 'invert_die') invertMinimumRoll(atkRolls, atkFaces);
    if (attacker === p1) applyMinimumBoost(atkRolls, buffs.minDieBoost || 0, atkFaces);

    let hasAttackerRerolled = false;
    const initialAtkKept = selectedValues(atkRolls, selectDice(atkRolls, atkFaces, attacker.atkSlots));
    const shouldPreserveOddRoll = skillId(attacker, 'positive') === 'no_reroll_bonus'
      && initialAtkKept.length > 0
      && initialAtkKept.every(value => value % 2 === 1);
    while (attacker.rerolls > 0 && !attacker.sugarCrash && atkRolls.length > 0 && !shouldPreserveOddRoll) {
      const rerollIndices = attacker.rerollAll
        ? atkRolls.map((_, index) => index)
        : [atkRolls.indexOf(Math.min(...atkRolls))];
      for (const index of rerollIndices) atkRolls[index] = rollDie(atkFaces[index]);
      hasAttackerRerolled = true;
      applyRollSelfDamage(attacker, rerollIndices.map(index => atkRolls[index]), entry);
      attacker.rerolls--;
      if (attacker.hp <= 0 && !reviveIfNeeded(attacker, attacker.supportBuffs, entry, attacker.side === 'p1' ? 'P1' : 'P2')) {
        entry.selfKill = attacker.side;
        entry.p1HP = p1.hp;
        entry.p2HP = p2.hp;
        log.push(entry);
        break;
      }
      if (skillId(defender, 'positive') === 'invert_die') preventMaximumRolls(atkRolls, atkFaces);
      if (skillId(attacker, 'positive') === 'invert_die') {
        invertMinimumRoll(atkRolls, atkFaces);
        if (skillId(attacker, 'negative') === 'deep_thought') defender.permanentDefPenalty++;
      }
      if (attacker === p1) applyMinimumBoost(atkRolls, buffs.minDieBoost || 0, atkFaces);
      const currentKept = selectedValues(atkRolls, selectDice(atkRolls, atkFaces, attacker.atkSlots));
      if (skillId(attacker, 'positive') === 'no_reroll_bonus'
        && currentKept.length > 0
        && currentKept.every(value => value % 2 === 1)) break;
    }

    if (attacker.hp <= 0) {
      entry.selfKill = attacker.side;
      entry.p1HP = p1.hp;
      entry.p2HP = p2.hp;
      log.push(entry);
      break;
    }

    if (skillId(attacker, 'positive') === 'no_reroll_bonus') {
      const growthIndices = selectDice(atkRolls, atkFaces, attacker.atkSlots);
      const growthKept = selectedValues(atkRolls, growthIndices);
      if (growthKept.length > 0 && growthKept.every(value => value % 2 === 1)) {
        growthIndices.forEach(index => { attacker.dicePool[index] += 2; });
        entry.diceGrowthIndices = growthIndices;
        entry.diceGrowth = 2;
      }
    }

    const atkIndices = selectDice(atkRolls, atkFaces, attacker.atkSlots);
    const atkKept = selectedValues(atkRolls, atkIndices);
    const rawAtkKept = [...atkKept];
    let atkTotal = skillId(attacker, 'positive') === 'liberal_arts'
      ? atkKept.reduce((sum, value) => sum + Math.floor(value * attackerMulti), 0)
      : atkKept.reduce((sum, value) => sum + value, 0);
    if (attacker === p1 && buffs.allOddAtkBonus > 0 && atkKept.length > 0 && atkKept.every(value => value % 2 === 1)) {
      atkTotal += buffs.allOddAtkBonus;
      entry.oddBonus = buffs.allOddAtkBonus;
    }
    if (attacker === p1) {
      const flatAtkBonus = rollFlatAttackBonus(buffs.flatAtkChance);
      if (flatAtkBonus > 0) {
        atkTotal += flatAtkBonus;
        entry.flatAtkBonus = flatAtkBonus;
      }
    }
    if (attacker === p1) atkTotal += opts.atkBonusThisPlane || 0;
    if (skillId(attacker, 'positive') === 'stealth_strike') {
      const stealthBonus = Math.floor(2 * attackerMulti);
      atkTotal += stealthBonus;
      entry.stealthBonus = stealthBonus;
    }
    if (attacker.nodeType === 'boss') {
      atkTotal += round;
      entry.bossRage = round;
    }
    if (skillId(attacker, 'negative') === 'hjc_neg' && Math.random() < 0.1) {
      atkTotal = Math.floor(4 * attackerMulti);
      entry.allergy = true;
    }

    const defFaces = [...defender.dicePool];
    let defRolls = rollDice(defFaces);
    applyRollSelfDamage(defender, defRolls, entry);
    if (defender.hp <= 0 && !reviveIfNeeded(defender, defender.supportBuffs, entry, defender.side === 'p1' ? 'P1' : 'P2')) {
      entry.selfKill = defender.side;
      entry.p1HP = p1.hp;
      entry.p2HP = p2.hp;
      log.push(entry);
      break;
    }
    if (skillId(attacker, 'positive') === 'invert_die') preventMaximumRolls(defRolls, defFaces);
    if (skillId(defender, 'positive') === 'invert_die') invertMinimumRoll(defRolls, defFaces);
    if (defender === p1) applyMinimumBoost(defRolls, buffs.minDieBoost || 0, defFaces);

    let hasDefenderRerolled = false;
    if (skillId(defender, 'positive') === 'mama') defender.rerolls += 1;
    while (defender.rerolls > 0 && !defender.sugarCrash && defRolls.length > 0) {
      const currentDefIndices = selectDice(
        defRolls,
        defFaces,
        defender.defSlots,
        skillId(defender, 'negative') === 'd10_limit',
      );
      const currentDefTotal = selectedValues(defRolls, currentDefIndices)
        .reduce((sum, value) => sum + value, 0);
      if (currentDefTotal >= atkTotal) break;

      const rerollIndices = defender.rerollAll
        ? defRolls.map((_, index) => index)
        : [defRolls.indexOf(Math.min(...defRolls))];
      for (const index of rerollIndices) defRolls[index] = rollDie(defFaces[index]);
      defender.rerolls--;
      hasDefenderRerolled = true;
      applyRollSelfDamage(defender, rerollIndices.map(index => defRolls[index]), entry);
      if (defender.hp <= 0 && !reviveIfNeeded(defender, defender.supportBuffs, entry, defender.side === 'p1' ? 'P1' : 'P2')) {
        entry.selfKill = defender.side;
        entry.p1HP = p1.hp;
        entry.p2HP = p2.hp;
        log.push(entry);
        break;
      }
      if (skillId(attacker, 'positive') === 'invert_die') preventMaximumRolls(defRolls, defFaces);
      if (skillId(defender, 'positive') === 'invert_die') invertMinimumRoll(defRolls, defFaces);
      if (defender === p1) applyMinimumBoost(defRolls, buffs.minDieBoost || 0, defFaces);
    }
    if (defender.hp <= 0) {
      entry.selfKill = defender.side;
      entry.p1HP = p1.hp;
      entry.p2HP = p2.hp;
      log.push(entry);
      break;
    }
    if (hasDefenderRerolled) entry.defenderRerolled = true;
    const defIndices = selectDice(
      defRolls,
      defFaces,
      defender.defSlots,
      skillId(defender, 'negative') === 'd10_limit',
    );
    const defKept = selectedValues(defRolls, defIndices);
    let defTotal = skillId(defender, 'positive') === 'liberal_arts'
      ? defKept.reduce((sum, value) => sum + Math.floor(value * defenderMulti), 0)
      : defKept.reduce((sum, value) => sum + value, 0);
    if (defender === p1) defTotal += buffs.flatDef || 0;
    if (skillId(defender, 'negative') === 'sleepy' && round <= 2) defTotal = Math.max(0, defTotal - 3);
    if (skillId(attacker, 'negative') === 'sleepy' && round <= 2) atkTotal = Math.max(0, atkTotal - 3);
    if (defender.nodeType === 'boss') {
      defTotal += 5;
      entry.bossArmor = 5;
    }
    if (hasDefenderRerolled && skillId(defender, 'negative') === 'reroll_penalty') {
      defender.permanentDefPenalty += 2;
    }
    if (defender.permanentDefPenalty > 0) {
      defTotal = Math.max(0, defTotal - defender.permanentDefPenalty);
    }

    if (skillId(defender, 'positive') === 'eat_it') {
      reduceMaximumSelected(atkKept, Math.max(0, Math.max(...atkKept) - 2));
      atkTotal = skillId(attacker, 'positive') === 'liberal_arts'
        ? atkKept.reduce((sum, value) => sum + Math.floor(value * attackerMulti), 0)
        : atkKept.reduce((sum, value) => sum + value, 0);
      entry.eatIt = true;
    }
    if (defender === p1 && buffs.reduceMaxDie > 0) {
      reduceMaximumSelected(atkKept, buffs.reduceMaxDie);
      atkTotal = skillId(attacker, 'positive') === 'liberal_arts'
        ? atkKept.reduce((sum, value) => sum + Math.floor(value * attackerMulti), 0)
        : atkKept.reduce((sum, value) => sum + value, 0);
      entry.reduceMaxDie = buffs.reduceMaxDie;
    }

    entry.atkRolls = [...atkRolls];
    entry.atkKept = [...atkKept];
    entry.atkTotal = atkTotal;
    entry.defRolls = [...defRolls];
    entry.defKept = [...defKept];
    entry.defTotal = defTotal;

    let attackMultiplier = 1;
    if (skillId(attacker, 'positive') === 'star_showoff' && rawAtkKept.length >= 4) {
      const range = Math.max(...rawAtkKept) - Math.min(...rawAtkKept);
      if (range <= 2) {
        attackMultiplier = 0.5 + attackerMulti;
        entry.showoff = attackMultiplier;
      }
    }
    if (skillId(attacker, 'positive') === 'timeless_grace') {
      const frequency = {};
      for (const value of atkKept) frequency[value] = (frequency[value] || 0) + 1;
      entry.timelessGrace = Math.max(0, ...Object.values(frequency));
      if (entry.timelessGrace >= 5) attacker.extraTurnQueued = true;
    }

    let damage = Math.max(0, atkTotal - defTotal);
    if (defender === p1 && buffs.flatReduction > 0) damage = Math.max(0, damage - buffs.flatReduction);
    damage = Math.floor(damage * attackMultiplier);
    if (damage > 0 && skillId(defender, 'positive') === 'talented') {
      const ratio = defenderMulti === 2 ? 0.5 : defenderMulti === 1 ? 0.75 : 1;
      damage = Math.floor(damage * ratio);
    }
    if (damage > 0 && skillId(defender, 'negative') === 'vulnerable') damage += Math.floor(2 * defenderMulti);
    if (damage > 0 && skillId(defender, 'negative') === 'caught' && defender.chargeStacks > 0) {
      damage += defender.chargeStacks * 3;
    }

    if (atkTotal <= defTotal && skillId(attacker, 'negative') === 'red_heat_detonate' && defender.redHeat > 0) {
      let detonateDamage = defender.redHeat;
      if (skillId(defender, 'positive') === 'talented') {
        const ratio = defenderMulti === 2 ? 0.5 : defenderMulti === 1 ? 0.75 : 1;
        detonateDamage = Math.floor(detonateDamage * ratio);
      }
      defender.redHeat = 0;
      damage += detonateDamage;
      entry.detonateDamage = detonateDamage;
    }
    if (damage > 1 && skillId(attacker, 'negative') === 'mama_neg' && defender.hp > 0 && defender.hp < defender.maxHp * 0.2) {
      damage = 1;
      entry.mamaMercy = true;
    }

    const overflow = Math.max(0, defTotal - atkTotal);
    let heal = 0;
    if (overflow > 0 && skillId(defender, 'positive') === 'mama') heal += Math.floor(overflow * defenderMulti);
    if (defender === p1 && buffs.healOnOverflow > 0) heal += Math.min(overflow, buffs.healOnOverflow);
    if (heal > 0) {
      defender.hp = Math.min(defender.maxHp, defender.hp + heal);
      entry.healed = heal;
    }

    defender.hp = Math.max(0, defender.hp - damage);
    entry.damage = damage;
    if (!isFinite(entry.damage)) entry.damage = 0;

    if (defender !== attacker && defTotal > atkTotal && skillId(defender, 'positive') === 'gal_player') {
      const counterDamage = defTotal - atkTotal;
      attacker.hp = Math.max(0, attacker.hp - counterDamage);
      entry.counterDamage = counterDamage;
    }
    if (atkTotal < defTotal && skillId(attacker, 'negative') === 'hjc_neg') {
      attacker.hp = Math.max(0, attacker.hp - Math.floor(attacker.hp / 2));
      entry.noob = true;
    }

    if (!hasDefenderRerolled && skillId(defender, 'positive') === 'commander_recruit') {
      const newFace = defenderMulti >= 2 ? 8 : defenderMulti <= 0.5 ? 4 : 6;
      defender.dicePool.push(newFace);
      entry.commanderRecruit = newFace;
    }
    if (damage > 0 && skillId(attacker, 'positive') === 'red_heat_apply') {
      const heat = 1 + Math.floor(2 * attackerMulti);
      defender.redHeat += heat;
      entry.redHeatApplied = heat;
    }
    if (attacker === p1 && (damage > 0 || buffs.redHeatNoDmg) && buffs.redHeatPerHit > 0) {
      defender.redHeat += buffs.redHeatPerHit;
      entry.redHeatApplied = (entry.redHeatApplied || 0) + buffs.redHeatPerHit;
    }

    if (damage > 0 && skillId(attacker, 'positive') === 'sticker') {
      defender.stickers++;
      if (defender.stickers >= 2) {
        const stickerDamage = Math.floor(defender.hp * 0.35);
        defender.hp = Math.max(0, defender.hp - stickerDamage);
        defender.redHeat += 3;
        defender.stickers = 0;
        entry.stickerExplode = stickerDamage;
      }
    }
    if (damage > 0 && attacker === p1 && buffs.sticker) {
      defender.stickers++;
      if (defender.stickers >= buffs.sticker.threshold) {
        const stickerDamage = Math.floor(defender.hp * buffs.sticker.pct / 100);
        defender.hp = Math.max(0, defender.hp - stickerDamage);
        defender.stickers = 0;
        addEntryDamage(entry, 'stickerExplode', stickerDamage);
      }
    }
    if (damage >= 8 && skillId(defender, 'negative') === 'sticker_neg') {
      defender.selfStickers++;
      if (defender.selfStickers >= 2) {
        const selfStickerDamage = Math.floor(defender.hp * 0.3);
        defender.hp = Math.max(0, defender.hp - selfStickerDamage);
        defender.redHeat += 3;
        defender.selfStickers = 0;
        entry.selfStickerExplode = selfStickerDamage;
      }
    }
    if (damage > 0 && skillId(defender, 'negative') === 'first_blood' && !defender.hasTakenDamage) {
      defender.hasTakenDamage = true;
      defender.defSlots = Math.max(1, defender.defSlots - 1);
      entry.firstBlood = true;
    }
    if (damage >= 8 && skillId(defender, 'positive') === 'extra_turn' && defender.hp > 0) {
      defender.extraTurnQueued = true;
      if (skillId(defender, 'negative') === 'back_pain') defender.defSlots = Math.max(1, defender.defSlots - 1);
      entry.extraTurn = true;
    }
    if (damage >= 8 && skillId(defender, 'negative') === 'sugar_crash') defender.sugarCrash = true;
    if (skillId(defender, 'positive') === 'dream_king' && defKept.reduce((sum, value) => sum + value, 0) >= 15) {
      defender.dreamStacks = Math.min(3, defender.dreamStacks + 1);
      if (defender.dreamStacks >= 3) defender.dreamState = true;
    }
    if (skillId(attacker, 'positive') === 'dream_king' && atkKept.reduce((sum, value) => sum + value, 0) >= 15) {
      attacker.dreamStacks = Math.min(3, attacker.dreamStacks + 1);
      if (attacker.dreamStacks >= 3) attacker.dreamState = true;
    }
    if (defender.dreamState && defender.hp > 0 && defender.hp < 3) defender.hp = 3;

    finishReviveChecks(p1, p2, entry, buffs);
    entry.p1HP = p1.hp;
    entry.p2HP = p2.hp;
    log.push(entry);
    if (p1.hp <= 0 || p2.hp <= 0) break;

    let nextAttacker = attacker === p1 ? p2 : p1;
    let nextExtraTurn = false;
    if (attacker.extraTurnQueued) {
      nextAttacker = attacker;
      attacker.extraTurnQueued = false;
      nextExtraTurn = true;
    } else if (defender.extraTurnQueued) {
      nextAttacker = defender;
      defender.extraTurnQueued = false;
      nextExtraTurn = true;
    }
    attacker = nextAttacker;
    defender = attacker === p1 ? p2 : p1;
    currentExtraTurn = nextExtraTurn;
  }

  let winner = 0;
  if (p1.hp > 0 && p2.hp <= 0) winner = 1;
  else if (p2.hp > 0 && p1.hp <= 0) winner = 2;
  else if (p1.hp !== p2.hp) winner = p1.hp > p2.hp ? 1 : 2;
  const totalDamageByP1 = log.reduce((sum, entry) => (
    entry.attackerId === p1.id
      ? sum + (entry.damage || 0) + (entry.stickerExplode || 0)
      : sum
  ), 0);
  return {
    log,
    winner,
    totalDamageByP1,
    finalHP: { p1: p1.hp, p2: p2.hp },
    rounds: round,
  };
}

/** 生成金矿战斗（对方 1 HP）。 */
export function createGoldMineBattle() {
  return {
    id: 'gold-mine-guard',
    name: '金矿守卫',
    hp: 1,
    dicePool: [4],
    atkSlots: 1,
    defSlots: 1,
  };
}
