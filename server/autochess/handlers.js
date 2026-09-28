import { createRun, placeCharacter, removeFromBoard, buyXP, calculateSupportBuffs, processBattleResult, getCurrentNodeType, generateAIOpponent, chooseEvent, confirmInvestment, buyBeverage, getRunView } from '../game/autobattler.js';
import { buyCharacter, sellCharacter, refreshShop as shopRefresh, scaleCharStats } from '../game/shop.js';
import { autoResolveMatch, createGoldMineBattle } from '../game/auto-combat.js';
import { AC_CHAR_MAP, AC } from '../../shared/autochess-config.js';

import { payloadObject, normalizeNickname, rejectInvalidNickname } from '../validation.js';

function buildAutoCombatFighter(run, buffs) {
  const coreEntry = run.board.core;
  const coreCfg = AC_CHAR_MAP[coreEntry.charId];
  const coreStats = scaleCharStats(coreCfg, coreEntry.star);
  let dicePool = [...coreStats.dicePool];
  const growthByIndex = Array.isArray(run.coreDiceGrowthByIndex) ? run.coreDiceGrowthByIndex : [];
  dicePool = dicePool.map((face, index) => face + (Number(growthByIndex[index]) || 0));
  if (run.coreDiceGrowth > 0 && dicePool.length > 0) {
    const minIndex = dicePool.indexOf(Math.min(...dicePool));
    dicePool[minIndex] += run.coreDiceGrowth;
  }
  if (Array.isArray(run.coreExtraDice)) dicePool.push(...run.coreExtraDice);

  const luckyDice = (run.investmentBuffs || []).filter(buff => buff.id === 'lucky_dice');
  if (luckyDice.length > 0) {
    const boost = luckyDice.reduce((sum, buff) => sum + buff.value, 0);
    dicePool = dicePool.map(face => face + boost);
  }

  return {
    id: coreEntry.charId,
    name: coreCfg.name,
    hp: coreStats.hp,
    dicePool,
    atkSlots: coreStats.atkSlots,
    defSlots: coreStats.defSlots,
    coreSkills: { positive: coreCfg.corePositive, negative: coreCfg.coreNegative },
    rerollAll: !!coreCfg.rerollAll,
  };
}

function autoCombatOptions(run, buffs) {
  const scholarBonus = (run.investmentBuffs || [])
    .filter(buff => buff.id === 'scholar_aura')
    .reduce((sum, buff) => sum + buff.value, 0);
  return {
    atkBonusThisPlane: (run.atkBonusThisPlane || 0) + scholarBonus,
    courseMultiplier: 1 + (buffs.courseMult || 0),
  };
}

function persistAutoCombatGrowth(run, buffs, combatResult, coreId) {
  if (buffs.growMinDie > 0) run.coreDiceGrowth = (run.coreDiceGrowth || 0) + buffs.growMinDie;
  for (const entry of combatResult.log || []) {
    if (entry.commanderRecruit && entry.defenderSide === 'p1') {
      run.coreExtraDice ??= [];
      run.coreExtraDice.push(entry.commanderRecruit);
    }
    if (entry.attackerSide === 'p1' && Array.isArray(entry.diceGrowthIndices) && entry.diceGrowth > 0) {
      run.coreDiceGrowthByIndex ??= [];
      for (const index of entry.diceGrowthIndices) {
        if (Number.isInteger(index) && index >= 0) {
          run.coreDiceGrowthByIndex[index] = (run.coreDiceGrowthByIndex[index] || 0) + entry.diceGrowth;
        }
      }
    }
  }
}

// ============================================================
// 货币战争 (自走棋) Socket 处理
// ============================================================
export function registerAutochessHandlers(socket, { acRuns, hasActiveSession }) {
  const playerId = socket.data.playerId;

  // ── 开始货币战争 ──
  socket.on('start_autochess', (payload = {}) => {
    const nickname = normalizeNickname(payloadObject(payload).nickname);
    if (!nickname) return rejectInvalidNickname(socket);
    if (hasActiveSession(playerId)) {
      socket.emit('error_msg', { message: '你已经在其他对局中' });
      return;
    }
    const run = createRun(playerId, nickname);
    acRuns.set(playerId, run);
    const runView = getRunView(run);
    socket.emit('match_found', { roomId: 'ac_' + playerId, mode: 'autochess', run: runView });
  });

  // ── 购买角色 ──
  socket.on('ac_buy', (payload = {}) => {
    const shopIndex = payloadObject(payload).shopIndex;
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = buyCharacter(run, shopIndex);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    if (result.starUps?.length) {
      result.starUps.forEach(su => socket.emit('ac_star_up', su));
    }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 卖出角色 ──
  socket.on('ac_sell', (payload = {}) => {
    const { from, index } = payloadObject(payload);
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = sellCharacter(run, from, index);
    if (!result.ok) { socket.emit('error_msg', { message: result.error || 'sell_failed' }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 放置角色 ──
  socket.on('ac_place', (payload = {}) => {
    const { benchIndex, slot } = payloadObject(payload);
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = placeCharacter(run, benchIndex, slot);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 从棋盘移回 ──
  socket.on('ac_remove', (payload = {}) => {
    const slot = payloadObject(payload).slot;
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = removeFromBoard(run, slot);
    if (!result.ok) { socket.emit('error_msg', { message: result.error || 'remove_failed' }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 刷新商店 ──
  socket.on('ac_refresh_shop', () => {
    const run = acRuns.get(playerId);
    if (!run) return;
    if (run.phase !== 'shop') { socket.emit('error_msg', { message: 'invalid_phase' }); return; }
    let refreshCost = AC.SHOP_REFRESH_COST;
    const bargainBuff = (run.investmentBuffs || []).filter(b => b.id === 'bargain');
    if (bargainBuff.length > 0) refreshCost = Math.max(0, refreshCost - bargainBuff.reduce((s, b) => s + b.value, 0));
    if (run.gold < refreshCost) { socket.emit('error_msg', { message: 'no_gold' }); return; }
    run.gold -= refreshCost;
    run.shop = shopRefresh(run.pool, run.level);
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 买经验 ──
  socket.on('ac_buy_xp', () => {
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = buyXP(run);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 开始战斗 ──
  socket.on('ac_start_combat', () => {
    const run = acRuns.get(playerId);
    if (!run || run.phase !== 'shop' || !run.board.core) {
      socket.emit('error_msg', { message: !run?.board?.core ? '请先放置阵眼' : 'invalid_phase' });
      return;
    }

    run.phase = 'combat';
    const buffs = calculateSupportBuffs(run);

    const coreEntry = run.board.core;
    const coreCfg = AC_CHAR_MAP[coreEntry.charId];
    const playerFighter = buildAutoCombatFighter(run, buffs);

    // 生成 AI 对手
    const nodeType = getCurrentNodeType(run);
    let aiFighter;
    if (nodeType === 'event') {
      // 金矿战斗
      aiFighter = createGoldMineBattle();
    } else {
      aiFighter = generateAIOpponent(run);
    }

    // 执行自动战斗
    const combatResult = autoResolveMatch(playerFighter, aiFighter, buffs, autoCombatOptions(run, buffs));

    const won = combatResult.winner === 1;

    // 处理战后结算
    const battleResult = processBattleResult(run, won, combatResult.totalDamageByP1);
    if (!battleResult.ok) {
      socket.emit('error_msg', { message: battleResult.error || 'invalid_result' });
      return;
    }
    persistAutoCombatGrowth(run, buffs, combatResult, coreEntry.charId);

    socket.emit('ac_combat_result', {
      combatLog: combatResult.log,
      won,
      goldEarned: battleResult.goldEarned,
      commanderDamage: battleResult.commanderDamage,
      result: getRunView(run),
    });
  });

  // ── 手动战斗 ──
  socket.on('ac_start_manual_combat', () => {
    const run = acRuns.get(playerId);
    if (!run || run.phase !== 'shop' || !run.board.core) {
      socket.emit('error_msg', { message: !run?.board?.core ? '请先放置阵眼' : 'invalid_phase' });
      return;
    }

    run.phase = 'manual_combat';
    const buffs = calculateSupportBuffs(run);

    const coreEntry = run.board.core;
    const playerFighter = buildAutoCombatFighter(run, buffs);

    const nodeType = getCurrentNodeType(run);
    let aiFighter;
    if (nodeType === 'event') {
      aiFighter = createGoldMineBattle();
    } else {
      aiFighter = generateAIOpponent(run);
    }

    run._manualCombat = {
      playerFighter,
      aiFighter,
      buffs,
      opts: autoCombatOptions(run, buffs),
      coreId: coreEntry.charId,
    };

    socket.emit('ac_manual_combat_setup', {
      playerFighter,
      aiFighter,
      buffs: {
        flatReduction: buffs.flatReduction,
        flatDef: buffs.flatDef,
        extraRerolls: buffs.extraRerolls,
        healOnOverflow: buffs.healOnOverflow,
      },
      nodeType,
    });
  });

  socket.on('ac_manual_combat_done', (payload = {}) => {
    const run = acRuns.get(playerId);
    if (!run || run.phase !== 'manual_combat' || !run._manualCombat) {
      socket.emit('error_msg', { message: 'invalid_phase' });
      return;
    }

    const { playerFighter, aiFighter, buffs, opts, coreId } = run._manualCombat;
    const combatResult = autoResolveMatch(playerFighter, aiFighter, buffs, opts);
    const won = combatResult.winner === 1;
    const result = processBattleResult(run, won, combatResult.totalDamageByP1);
    if (!result.ok) {
      socket.emit('error_msg', { message: result.error || 'invalid_result' });
      return;
    }
    persistAutoCombatGrowth(run, buffs, combatResult, coreId);
    delete run._manualCombat;
    socket.emit('ac_combat_result', {
      combatLog: combatResult.log,
      won,
      goldEarned: result.goldEarned,
      commanderDamage: result.commanderDamage,
      result: getRunView(run),
    });
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 事件节点选择 ──
  socket.on('ac_event_choice', () => {
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = chooseEvent(run);
    if (!result.ok) {
      socket.emit('error_msg', { message: result.error || 'invalid_phase' });
      return;
    }
    if (result.choice === 'investment') {
      run._eventOptions = result.options;
      socket.emit('ac_event_options', { options: result.options });
    } else {
      // 金矿 → 进入shop阶段准备战斗
      socket.emit('ac_run_update', getRunView(run));
      socket.emit('error_msg', { message: '触发了金矿事件！请开始战斗。' }); 
    }
  });

  // ── 确认投资策略 ──
  socket.on('ac_confirm_investment', (payload = {}) => {
    const run = acRuns.get(playerId);
    const { buffIndex } = payloadObject(payload);
    if (!run || !Array.isArray(run._eventOptions)) {
      socket.emit('error_msg', { message: 'invalid_event' });
      return;
    }
    if (!Number.isInteger(buffIndex) || buffIndex < 0 || buffIndex >= run._eventOptions.length) {
      socket.emit('error_msg', { message: 'invalid_choice' });
      return;
    }
    const result = confirmInvestment(run, run._eventOptions[buffIndex]?.id, run._eventOptions);
    if (!result.ok) {
      socket.emit('error_msg', { message: result.error || 'invalid_choice' });
      return;
    }
    delete run._eventOptions;
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 购买饮料 ──
  socket.on('ac_buy_beverage', (payload = {}) => {
    const { beverageId } = payloadObject(payload);
    const run = acRuns.get(playerId);
    if (!run) return;
    const result = buyBeverage(run, beverageId);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

}
