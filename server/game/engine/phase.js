import { settleWinner } from './outcome.js';
import { clearResolvedTurnState } from './turn-state.js';
import { removePositiveSkill } from './skills.js';
import { generateSchedule } from './preparation.js';
import { appendBattleLog } from './battle-log.js';
import { TURN } from '../../../shared/turn.js';
import { GAME_CONFIG, PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';
import { SKILL } from '../../../shared/characters.js';
import { getRandomCard } from '../../../shared/cards.js';

export function resolvePhaseEnd(state) {
  let gameOver = false, winner = null, classChanged = false, nextSubject = null;
  let dayChanged = false;
  if (!Number.isInteger(state.currentDay) || state.currentDay < 1) state.currentDay = 1;
  const phaseAttacker = Number.isInteger(state.turnData?.attackerIdx)
    ? state.players[state.turnData.attackerIdx]
    : null;
  
  // Handle deaths
  state.players.forEach(p => {
    if (p.hp <= 0) {
      p.hp = 0;
      if (!p.isDead) {
        p.isDead = true;
        // Lord kills Loyalist penalty
        if (state.gameMode === GAME_MODE.MODE_FFA && phaseAttacker?.identity === IDENTITY.LORD
          && phaseAttacker.id !== p.id && p.identity === IDENTITY.LOYALIST) {
          removePositiveSkill(phaseAttacker);
          appendBattleLog(state, {
            text: `【系统】主公 ${phaseAttacker.nickname} 误杀忠臣，失去了正面技能！`,
            type: 'system',
            actorId: phaseAttacker.id,
            targetId: p.id,
          });
        }
      }
    }
  });

  ({ gameOver, winner } = settleWinner(state));

  if (!gameOver) {
    if (phaseAttacker && state.schedule[state.currentClassIndex] === 'study'
      && (phaseAttacker.activeBlessings || []).some(card => card.id === 'card_stu_1')
      && (phaseAttacker.handCards || []).length < 3) {
      phaseAttacker.handCards.push(getRandomCard('study', phaseAttacker.card?.subjects || []));
      appendBattleLog(state, { text: `【自习-祝福】${phaseAttacker.nickname} 攻击回合结束，获得 1 张战术卡！`, type: 'skill', actorId: phaseAttacker.id });
    }
    clearResolvedTurnState(state);
    let extraTurnSet = false;
    while (state.extraTurnQueue && state.extraTurnQueue.length > 0) {
      const nextExtra = state.extraTurnQueue.shift();
      const atkIdx = state.players.findIndex(p => p.id === nextExtra.attackerId);
      const defIdx = state.players.findIndex(p => p.id === nextExtra.targetId);
      if (atkIdx !== -1 && defIdx !== -1 && !state.players[atkIdx].isDead && !state.players[defIdx].isDead) {
        state.totalRound++;
        state.turnData = { 
          attackerIdx: atkIdx, 
          defenderIdx: defIdx, 
          attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false, isExtraTurn: true 
        };
        state.turnPhase = TURN.WAITING_ATK; // Skip CHOOSE_TARGET since the target is locked
        extraTurnSet = true;
        break;
      }
    }

    if (!extraTurnSet) {
      state.totalRound++;
      state.currentSubRound++;
      
      if (state.currentSubRound >= GAME_CONFIG.SUBROUNDS_PER_CLASS) {
        const completedSubject = state.schedule[state.currentClassIndex];
        state.currentSubRound = 0;
        state.currentClassIndex++;
        const completedClassNumber = state.currentClassIndex;
        
        let nextFirst = (state.firstAttacker + 1) % state.players.length;
        let attempts = 0;
        while (state.players[nextFirst]?.isDead && attempts < state.players.length) {
          nextFirst = (nextFirst + 1) % state.players.length;
          attempts++;
        }
        state.firstAttacker = nextFirst;
        
        classChanged = true;
        state.players.forEach(p => {
          // 每节课结束获得 1 TP
          p.tp = Math.min(10, (p.tp || 0) + 1);
          p.tempSlotBonus = 0;
          p.stealthActive = false;
          p.activeBlessings = (p.activeBlessings || []).filter(card => card.subject !== completedSubject);
          if (p.copiedPositiveSkill) {
            p.card.positiveSkill = p.copiedPositiveSkill.original || null;
            p.copiedPositiveSkill = null;
          }
          if (p.card?.positiveSkill?.id === SKILL.DREAM_KING) {
            if (p.pendingDreamState && !p.lgpyForm) {
              p.inDreamState = true;
              p.pendingDreamState = false;
              p.dreamTargetChoice = null;
              p.realTargetIdx = Math.floor(Math.random() * 3);
              appendBattleLog(state, { text: `【梦境之王】${p.nickname} 展开梦境领域！`, type: 'skill', actorId: p.id });
            } else if (p.inDreamState && !p.lgpyForm) {
              p.dreamTargetChoice = null;
              p.realTargetIdx = Math.floor(Math.random() * 3);
            }
          }
        });

        const reachedDayEnd = state.currentClassIndex >= GAME_CONFIG.CLASSES_PER_GAME;
        if (reachedDayEnd && state.gameMode === GAME_MODE.MODE_1V1) {
          state.currentDay++;
          state.currentClassIndex = 0;
          state.schedule = generateSchedule();
          dayChanged = true;
          state.players.forEach(p => {
            p.rerolls = GAME_CONFIG.REROLLS_PER_GAME;
            p.hasReschedule = true;
          });
          appendBattleLog(state, {
            type: 'system',
            text: `第 ${state.currentDay} 天开始，双方继续对决`,
          });
        }

        // 每天第 2/4/6 节课后触发三选一战术卡商店。
        if (completedClassNumber === 2 || completedClassNumber === 4 || completedClassNumber === 6) {
          const nextSubj = state.schedule[state.currentClassIndex] || 'chinese';
          state.draftShop = {
            active: true,
            players: Object.fromEntries(state.players.map(p => [
              p.id, {
                ready: !!p.isDead,
                slots: [
                  { card: getRandomCard(nextSubj, p.card?.subjects || []), refreshesLeft: 2 },
                  { card: getRandomCard(nextSubj, p.card?.subjects || []), refreshesLeft: 2 },
                  { card: getRandomCard(nextSubj, p.card?.subjects || []), refreshesLeft: 2 },
                ]
              }
            ]))
          };
        }

        if (reachedDayEnd && state.gameMode !== GAME_MODE.MODE_1V1) {
          gameOver = true;
          state.phase = PHASE.GAME_OVER;
          if (state.gameMode === GAME_MODE.MODE_1V1) {
            const h0 = state.players[0].hp, h1 = state.players[1].hp;
            state.winner = h0 > h1 ? 0 : (h1 > h0 ? 1 : 'draw');
          } else {
            state.winner = 'lord'; // Simplified timeout winner
          }
          winner = state.winner;
        } else {
          nextSubject = state.schedule[state.currentClassIndex];
        }
      }
      
      if (!gameOver) {
        let ni;
        if (state.gameMode === GAME_MODE.MODE_1V1) {
          ni = (state.firstAttacker + state.currentSubRound) % 2;
        } else {
          let offset = state.currentSubRound;
          ni = state.firstAttacker;
          while(offset > 0 || state.players[ni].isDead) {
            if (state.players[ni].isDead && offset == 0) {
               // If we are at offset 0 but the player is dead, keep advancing without decrementing offset
               ni = (ni + 1) % state.players.length;
            } else {
               ni = (ni + 1) % state.players.length;
               if (!state.players[ni].isDead) offset--;
            }
          }
        }
        
        state.turnData = { 
          attackerIdx: ni, 
          defenderIdx: state.gameMode === GAME_MODE.MODE_FFA ? null : (1 - ni), 
          attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false 
        };
        state.turnPhase = state.gameMode === GAME_MODE.MODE_FFA ? TURN.CHOOSE_TARGET : TURN.WAITING_ATK;
      }
    }
  }

  return {
    gameOver,
    winner,
    classChanged,
    nextSubject,
    dayChanged,
    currentDay: state.currentDay,
  };
}

