import { escapeHTML } from '../../utils/html.js';
import { SUBJECTS, getSkillMultiplier } from '../../../shared/rules.js';

export function pct(c,m) {
  if (!Number.isFinite(c) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(c / m * 100)));
}

export function getM(p,subj) {
  if (!p?.card) return 1;
  const base = getSkillMultiplier(p.card.subjects, subj);
  return subj === 'geography' && base === 2
    && (p.activeBlessings || []).some(card => card.id === 'card_geo_1')
    ? 3
    : base;
}

export function getAuraClass(p) {
  if (!p) return '';
  if (p.lgpyForm) return 'aura-gpy-rage';
  if (p.inDreamState) return 'aura-dream-domain';
  if (p.chargeStacks > 0) return 'aura-zxs-water';
  if (p.cardId === 'char_19') return 'aura-yzm-gold';
  if (p.redHeat > 0) return 'aura-wyc-redheat';
  if (p.buffs && p.buffs.find(b => b.id === 'sugar_crash')) return 'aura-whd-sugar';
  return '';
}

export function multiTag(m) {
  if (m===3) return '<span class="multiplier x3">×3</span>';
  if (m===2) return '<span class="multiplier x2">×2</span>';
  if (m===0.5) return '<span class="multiplier x05">×½</span>';
  return '<span class="multiplier x1">×1</span>';
}

export function waitingNames(s, ids) {
  return (ids || []).map(id => s.players?.find(player => player.id === id)?.nickname || '玩家').join('、');
}

export function phasePrompt(s) {
  if (s.me?.isDead) return '你已淘汰，正在观战';
  if (s.draftShop?.active) {
    const ready = s.draftShop.players?.[s.me?.id]?.ready;
    const names = escapeHTML(waitingNames(s, s.draftShop.pendingPlayerIds));
    return ready ? `补给已完成，等待${names || '其他玩家'}选牌…` : '课间补给：购买卡牌后点击完成选牌';
  }
  const attacker = escapeHTML(s.players?.[s.attackerIdx]?.nickname || '攻击方');
  if (s.turnPhase === 'def_rolled' && s.aoeDefenses) {
    const pending = Object.keys(s.aoeDefenses).filter(id => !s.aoeDefenses[id].confirmed && !s.players?.find(p => p.id === id)?.isDead);
    const names = escapeHTML(waitingNames(s, pending));
    if (s.isMyDefendTurn) return '群攻防御：选择骰子后确认';
    const prefix = s.aoeDefenses[s.me?.id]?.confirmed ? '防御已确认，' : '';
    return `${prefix}等待${names || '其他玩家'}完成防御…`;
  }
  let p = '';
  if (s.turnPhase === 'choose_target') p = s.isMyAttackTurn ? '选择目标' : `等待${attacker}选择目标…`;
  if (s.turnPhase === 'waiting_atk') {
    if (s.isMyAttackTurn) {
      // 检查是否需要等待梦境盲选
      if (isDreamBlocking(s)) {
        p = '<span style="color:var(--accent);">等待对手完成梦境盲选…</span>';
      } else {
        p = '你的攻击回合';
      }
    } else {
      p = `等待${attacker}攻击…`;
    }
  }
  if (s.turnPhase === 'atk_rolled') p = s.isMyAttackTurn ? '选择骰子重投或确认' : `等待${attacker}确认攻击骰…`;
  if (s.turnPhase === 'def_rolled') p = s.isMyDefendTurn ? '你的防御 — 重投或确认' : `等待${escapeHTML(s.players?.[s.defenderIdx]?.nickname || '防守方')}完成防御…`;

  if (s.allergyTriggered && s.isMyAttackTurn) {
    p = `<span style="color:var(--red); font-weight:bold;">过敏发作 — 伤害已锁定</span><br/>${p}`;
  }
  return p;
}

export function isDreamBlocking(s) {
  if (!s || !s.players) return false;
  const fxr = s.players.find(p => (p.card?.positiveSkill?.id === 'dream_king' || p.cardId === 'char_fxr')
    && !p.isDead && p.hp > 0);
  return fxr && fxr.inDreamState && !fxr.lgpyForm && fxr.dreamTargetChoice == null;
}

export function actionButtons(s) {
  if (s.turnPhase === 'waiting_atk' && s.isMyAttackTurn) {
    if (isDreamBlocking(s)) {
      return '<button id="btn-roll" data-battle-action="roll" class="btn btn-primary btn-lg" disabled style="opacity:0.5;">等待盲选…</button>';
    }
    return '<button id="btn-roll" data-battle-action="roll" class="btn btn-primary btn-lg">掷骰</button>';
  }
  if (s.turnPhase === 'atk_rolled' && s.isMyAttackTurn) {
    const attackSlots = s.me.effectiveAtkSlots ?? s.me.card.atkSlots;
    const buyBtn = (s.me.cardId === 'char_14' && !s.me.skillsSealed && !s.hasAttackerRerolled && s.me.chargeStacks < 2)
      ? '<button id="btn-buy-water" data-battle-action="buyWater" class="btn btn-secondary" style="margin-left:8px;">买水</button>'
      : '';
    return `<div class="action-stack"><small class="dice-purpose">选择计入攻击的骰子</small>
          <button id="btn-confirm" data-battle-action="confirmDice" class="btn btn-success" disabled>✓ 确认</button>
          ${buyBtn}
        </div>`;
  }
  if (s.turnPhase === 'def_rolled' && s.isMyDefendTurn) {
    const defenseSlots = s.me.effectiveDefSlots ?? s.me.card.defSlots;
    const sacBtn = s.me.cardId === 'char_8' && !s.me.skillsSealed ? '<button id="btn-sacrifice" class="btn btn-secondary" style="display:none;" data-battle-action="showSacrifice">献祭回血</button>' : '';
    return `<div class="action-stack"><small class="dice-purpose">选择计入防御的骰子</small>
          <button id="btn-confirm" data-battle-action="confirmDice" class="btn btn-primary" disabled>✓ 确认</button>
          ${sacBtn}
        </div>`;
  }
  return `<span style="color:var(--text-muted);font-size:.88rem">${phasePrompt(s)}</span>`;
}

export function portraitInitials(name) {
  const cleaned = Array.from(String(name || '?').replace(/[\[\]\s]/g, ''));
  return cleaned.slice(-2).join('') || '?';
}

export function portraitHTML(name, image) {
  const safeName = escapeHTML(name || '角色');
  return `
    <span class="portrait-fallback" aria-hidden="true">${escapeHTML(portraitInitials(name))}</span>
    ${image ? `<img src="${escapeHTML(image)}" alt="${safeName}" onerror="this.remove()">` : ''}
  `;
}

export function battleTopbarHTML(s) {
  s = s && typeof s === 'object' ? s : {};
  const canReschedule = !!s.me?.hasReschedule;
  const day = Number.isInteger(s.currentDay) && s.currentDay > 0 ? s.currentDay : 1;
  return `
    <div class="battle-day">
      <span>对局进度</span>
      <strong>第 ${day} 天</strong>
    </div>
    <div class="battle-schedule-track">${scheduleHTML(s)}</div>
    ${canReschedule ? '<button id="btn-reschedule" data-battle-action="reschedule" class="btn btn-secondary battle-reschedule">调课</button>' : ''}
  `;
}

export function scheduleHTML(s) {
  const schedule = Array.isArray(s?.schedule) ? s.schedule : [];
  return schedule.map((subj, i) => {
    const info = SUBJECTS[subj];
    const active = i === s.currentClassIndex;
    const past = i < s.currentClassIndex;
    return `<div class="sch-item${active ? ' active' : ''}${past ? ' past' : ''}" data-class-index="${i}">
      <span>${escapeHTML(info?.icon || '📝')}</span><span class="sch-label">${escapeHTML(info?.label || subj || '未知课程')}</span>
    </div>`;
  }).join('');
}
