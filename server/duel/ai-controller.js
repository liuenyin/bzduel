import { selectCard, rollAttack, rerollDice, confirmAttack, confirmDefense, chooseDreamTarget, playTacticalCard, buyDraftCard, confirmDraftReady, getCurrentAttackerId, getCurrentDefenderId, getStateView, getAttackConfirmationView, getEffectiveDicePool, getAllowedSlotCount, TURN } from '../game/engine.js';
import { aiSelectCard, aiChooseKeepIndices, aiChooseRerollIndices, aiChooseTacticalCard, aiChooseDraftSlot } from '../game/ai.js';
import { SKILL } from '../../shared/characters.js';

import { recordMatch } from '../statsManager.js';

export function createAiController({
  scheduleFinishedRoomCleanup, emitImmediateTurnResolution, emitSkippedAttackResolution, emitTacticalGameOver, emitStateToAll, emitToAll, rooms, io
}) {
  function scheduleAiAction(room, key, delay, action) {
    if (!room || room.aiActionKey === key) return;
    if (room.aiActionTimer) clearTimeout(room.aiActionTimer);
    room.aiActionKey = key;
    room.aiActionTimer = setTimeout(() => {
      room.aiActionTimer = null;
      room.aiActionKey = null;
      action();
    }, delay);
  }

  function triggerAiPhase(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isAI || room.game.phase !== 'battle') return;
    const g = room.game;

    // AI 自动盲选目标（梦境）
    const fxr = g.players.find(p => p.card?.positiveSkill?.id === SKILL.DREAM_KING);
    if (fxr && !fxr.isDead && fxr.hp > 0 && fxr.inDreamState && !fxr.lgpyForm && fxr.dreamTargetChoice === null) {
      // 找到非 FXR 的 AI 玩家来盲选
      const nonFxrAi = fxr.id === room.aiId ? null : room.aiId;
      if (nonFxrAi) {
        const aiTargetIdx = Math.floor(Math.random() * 3);
        chooseDreamTarget(g, nonFxrAi, aiTargetIdx);
        emitStateToAll(room);
      }
    }

    // AI 选卡商店自动补牌与确认
    if (g.draftShop && g.draftShop.active) {
      const aiDraft = g.draftShop.players?.[room.aiId];
      if (aiDraft && !aiDraft.ready) {
        const aiPlayer = g.players.find(p => p.id === room.aiId);
        if (aiPlayer) {
          let slotIndex = aiChooseDraftSlot(g, room.aiId);
          while (slotIndex !== null && (aiPlayer.handCards || []).length < 3) {
            const result = buyDraftCard(g, room.aiId, slotIndex);
            if (!result.ok) break;
            slotIndex = aiChooseDraftSlot(g, room.aiId);
          }
        }
        confirmDraftReady(g, room.aiId);
        emitStateToAll(room);
      }
    }

    // AI 打出战术卡策略 (在自己攻防回合自动打出可用卡)
    const aiPlayer = g.players.find(p => p.id === room.aiId);
    if (aiPlayer && !aiPlayer.isDead && aiPlayer.handCards && aiPlayer.handCards.length > 0) {
      const playableCard = aiChooseTacticalCard(g, room.aiId);
      if (playableCard) {
        const result = playTacticalCard(g, room.aiId, playableCard.id);
        if (result.ok) {
          emitToAll(room, 'tactical_card_played', () => ({ playerId: room.aiId, card: result.card }));
          emitStateToAll(room);
          if (result.gameOver) {
            emitTacticalGameOver(room, result);
            return;
          }
          if (result.defeatedIds?.length) {
            emitImmediateTurnResolution(room, result);
            return;
          }
        }
      }
    }

    // 1. 等待攻击阶段 (掷骰)
    if (g.turnPhase === TURN.WAITING_ATK && getCurrentAttackerId(g) === room.aiId) {
      scheduleAiAction(room, `roll:${g.totalRound}:${g.turnData?.attackerIdx}`, 900, () => {
        if (!rooms.has(roomId)) return;
        if (g.phase !== 'battle' || g.turnPhase !== TURN.WAITING_ATK) return;
        const rollRes = rollAttack(g);
        if (!rollRes.ok) return;
        emitStateToAll(room);

        if (rollRes.skipped) {
          emitSkippedAttackResolution(room, rollRes);
          return;
        }
        if (rollRes.selfKill) {
          emitImmediateTurnResolution(room, rollRes);
          return;
        }
        // 掷骰完自动进入下个子阶段处理
        triggerAiPhase(roomId);
      });
    }

    // 2. 已掷攻击骰阶段 (重投或确认)
    if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === room.aiId) {
      scheduleAiAction(room, `attack:${g.totalRound}:${g.turnData?.hasAttackerRerolled ? 1 : 0}`, 850, () => {
        if (!rooms.has(roomId)) return;
        if (g.phase !== 'battle' || g.turnPhase !== TURN.ATK_ROLLED) return;
        const atk = g.players[g.turnData.attackerIdx];
        const rolls = g.turnData.attackRolls;
        const faces = getEffectiveDicePool(g, atk.id);
        const slots = getAllowedSlotCount(g, atk.id, 'attack');

        const rerollIndices = aiChooseRerollIndices({
          player: atk,
          rolls,
          faces,
          slots,
          phase: 'attack',
        });
        if (rerollIndices.length > 0) {
          const rerollResult = rerollDice(g, atk.id, rerollIndices);
          if (rerollResult.ok) {
            emitStateToAll(room);
            if (rerollResult.selfKill) {
              emitImmediateTurnResolution(room, rerollResult);
              return;
            }
            triggerAiPhase(roomId);
            return;
          }
        }

        const skillId = atk.card?.positiveSkill?.id || atk.card?.neutralSkill?.id;
        const indices = aiChooseKeepIndices({ rolls, faces, slots, phase: 'attack', skillId });
        const res = confirmAttack(g, indices);
        if (!res.ok) { console.error("AI confirmAttack failed", res, indices, atk.card); return; }
        if (res.selfKill) {
          emitImmediateTurnResolution(room, res);
          return;
        }
        emitToAll(room, 'atk_confirmed', (pid) => getAttackConfirmationView(g, pid));
        // 这里不需要 triggerAiPhase，因为确认后进入玩家防御
      });
    }

    // 3. 已掷防御骰阶段 (重投或确认)
    if (g.turnPhase === TURN.DEF_ROLLED && getCurrentDefenderId(g) === room.aiId) {
      scheduleAiAction(room, `defense:${g.totalRound}:${g.turnData?.hasDefenderRerolled ? 1 : 0}`, 850, () => {
        if (!rooms.has(roomId)) return;
        if (g.phase !== 'battle' || g.turnPhase !== TURN.DEF_ROLLED) return;
        const def = g.players[g.turnData.defenderIdx];
        const rolls = g.turnData.defenseRolls;
        const faces = getEffectiveDicePool(g, def.id);
        const slots = getAllowedSlotCount(g, def.id, 'defense');
        const targetValue = Number(g.turnData?.atkResult?.finalAtk) || 0;

        const rerollIndices = aiChooseRerollIndices({
          player: def,
          rolls,
          faces,
          slots,
          phase: 'defense',
          targetValue,
        });
        if (rerollIndices.length > 0) {
          const rerollResult = rerollDice(g, def.id, rerollIndices);
          if (rerollResult.ok) {
            emitStateToAll(room);
            if (rerollResult.selfKill) {
              emitImmediateTurnResolution(room, rerollResult);
              return;
            }
            triggerAiPhase(roomId);
            return;
          }
        }

        const skillId = def.card?.neutralSkill?.id || def.card?.positiveSkill?.id;
        const indices = aiChooseKeepIndices({ rolls, faces, slots, phase: 'defense', skillId, targetValue });

        let options = {};
        if (def.card.id === 'char_8' && def.hp < def.maxHp * 0.5) {
          let bestSac = indices[0];
          let maxVal = -1;
          for (let idx of indices) {
            if (rolls[idx] > maxVal) { maxVal = rolls[idx]; bestSac = idx; }
          }
          if (maxVal >= 4) options.sacrificeIndex = bestSac;
        }

        const res = confirmDefense(g, def.id, indices, options);
        if (!res.ok) { console.error("AI confirmDefense failed", res, indices, def.card); return; }
        emitToAll(room, 'turn_resolved', (pid) => ({ ...res, state: getStateView(g, pid) }));

        if (res.gameOver) {
          if (g.gameMode === '1v1' && g.winner !== null && g.winner !== 'draw') {
            const winnerCardId = g.players[g.winner].cardId;
            const loserIdx = g.winner === 0 ? 1 : 0;
            const loserCardId = g.players[loserIdx].cardId;
            const isPvE = g.players[0].id.startsWith('AI_') || g.players[1].id.startsWith('AI_');
            recordMatch(winnerCardId, loserCardId, isPvE);
          }
          scheduleFinishedRoomCleanup(room);
        } else if (res.classChanged) {
          emitToAll(room, 'class_change', () => ({
            subject: res.nextSubject,
            index: g.currentClassIndex,
            day: res.currentDay || g.currentDay || 1,
            dayChanged: !!res.dayChanged,
          }));
          setTimeout(() => triggerAiPhase(roomId), 5000);
        } else {
          triggerAiPhase(roomId);
        }
      });
    }
  }

  // ── 辅助 ──
  function scheduleAiSelection(roomId, humanPlayerId) {
    const room = rooms.get(roomId);
    if (!room?.isAI) return;
    const game = room.game;

    setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom?.isAI || currentRoom.game !== game || game.phase !== 'preparation') return;
      const aiCardId = currentRoom.aiCardId || aiSelectCard(game.schedule);
      selectCard(game, currentRoom.aiId, aiCardId);
      console.log(`[PVE] AI ${currentRoom.aiId} 已选卡: ${aiCardId}`);
      io.to(humanPlayerId).emit('opponent_selected');
    }, 1000);
  }

  return { triggerAiPhase, scheduleAiSelection };
}
