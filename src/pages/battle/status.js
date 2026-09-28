import { escapeHTML } from '../../utils/html.js';

export function getStatusEffects(player, state) {
  if (!player) return [];
  const effects = [];
  const currentSubject = state?.schedule?.[state.currentClassIndex];
  const add = (effect) => effects.push({
    id: effect.id,
    name: effect.name,
    description: effect.description || '暂无额外说明',
    category: effect.category || 'neutral',
    value: effect.value || '',
    durationLabel: effect.durationLabel || '',
  });

  for (const card of player.playedTurnCards || []) {
    add({
      id: `turn-card-${card.id}`,
      name: card.name,
      description: card.desc,
      category: card.type === 'debuff' ? 'debuff' : (card.type === 'other' ? 'neutral' : 'buff'),
      durationLabel: '本回合',
    });
  }

  for (const card of player.activeBlessings || []) {
    if (card.subject !== 'universal' && card.subject !== currentSubject) continue;
    add({
      id: `blessing-${card.id}`,
      name: card.name,
      description: card.desc,
      category: 'blessing',
      durationLabel: '本节课',
    });
  }

  if (player.stealthActive) add({ id: 'stealth', name: '隐蔽', description: '本回合对手无法查看你的掷骰点数与结算数值', category: 'buff', durationLabel: '本回合' });
  if (player.tempSlotBonus > 0) add({ id: 'slot-bonus', name: '选骰扩容', description: '攻击和防御可额外选择骰子', category: 'buff', value: `+${player.tempSlotBonus}`, durationLabel: '本节课' });
  if (player.chargeStacks > 0) add({ id: 'charge', name: '蓄势', description: '攻击时消耗层数强化爆发效果', category: 'buff', value: `${player.chargeStacks}层`, durationLabel: '消耗前持续' });
  if (player.invertReduction > 0) add({ id: 'damage-reduction', name: '深度思考', description: '受到的最终伤害永久降低', category: 'buff', value: `-${player.invertReduction}`, durationLabel: '永久' });

  if (player.permanentDefPenalty > 0) add({ id: 'def-penalty', name: '防御透支', description: '防御结算永久降低', category: 'debuff', value: `-${player.permanentDefPenalty}`, durationLabel: '永久' });
  const sugarCrash = (player.buffs || []).find(buff => buff.id === 'sugar_crash');
  if (sugarCrash) {
    const remaining = Number.isInteger(sugarCrash.expireRound) && Number.isInteger(state?.totalRound)
      ? Math.max(1, sugarCrash.expireRound - state.totalRound)
      : null;
    add({ id: 'sugar-crash', name: '犯糖', description: '无法重投，攻击回合开始时受到伤害', category: 'debuff', durationLabel: remaining ? `剩余 ${remaining} 回合` : '临时' });
  }
  if (player.redHeat > 0) add({ id: 'red-heat', name: '红温', description: '攻击回合开始时按当前层数失去生命，随后减少 1 层', category: 'debuff', value: `${player.redHeat}层`, durationLabel: '层数归零前' });
  if (player.stickers > 0) add({ id: 'stickers', name: '贴画', description: '身上的贴画达到 2 张时会引爆', category: 'debuff', value: `${player.stickers}/2`, durationLabel: '引爆前' });
  if (player.selfStickers > 0) add({ id: 'self-stickers', name: '暴露贴画', description: '自身贴画达到 2 张时会引爆', category: 'debuff', value: `${player.selfStickers}/2`, durationLabel: '引爆前' });
  if (player.skillsSealed) add({ id: 'skill-sealed', name: '技能封印', description: '正面、中性和负面技能暂时无法生效', category: 'debuff', durationLabel: player.skillsSealedTurnsLeft ? `剩余 ${player.skillsSealedTurnsLeft} 次攻击` : '临时' });
  if (player.pendingDreamState) add({ id: 'dream-pending', name: '梦境待命', description: '下一节课开始时进入梦境领域', category: 'neutral', durationLabel: '下节课触发' });
  if (player.dreamStacks > 0 && !player.inDreamState) add({ id: 'dream-stacks', name: '梦境记录', description: '达到 3 层后，下一节课展开梦境领域', category: 'neutral', value: `${player.dreamStacks}/3`, durationLabel: '触发前' });
  if (player.inDreamState && !player.lgpyForm) add({ id: 'dream-state', name: '梦境领域', description: '对手需要盲选本体；选中分身时本体不受伤害', category: 'buff', durationLabel: '本节课' });
  if (player.lgpyForm) add({ id: 'lgpy-form', name: '狂暴形态', description: '当前使用强化骰池进行战斗', category: 'neutral', durationLabel: player.lgpyTurnsLeft ? `剩余 ${player.lgpyTurnsLeft} 次攻击` : '临时' });
  if (player.nineLivesUsed) add({ id: 'nine-lives-used', name: '九条命已触发', description: '复活效果已经消耗，骰池已升级为 D10', category: 'neutral', durationLabel: '本局' });
  if (player.hasReschedule) add({ id: 'reschedule', name: '调课权', description: '仍可调整尚未开始的一节课程', category: 'neutral', durationLabel: '使用前' });

  const priority = { debuff: 0, buff: 1, blessing: 2, neutral: 3 };
  return effects.sort((a, b) => (priority[a.category] ?? 9) - (priority[b.category] ?? 9));
}

export function statusEffectHTML(effect) {
  const tooltip = [effect.name, effect.description, effect.durationLabel].filter(Boolean).join(' · ');
  return `
    <details class="status-effect status-${escapeHTML(effect.category)}" data-status-id="${escapeHTML(effect.id)}">
      <summary title="${escapeHTML(tooltip)}" aria-label="${escapeHTML(tooltip)}">
        <span class="status-name">${escapeHTML(effect.name)}</span>
        ${effect.value ? `<span class="status-value">${escapeHTML(effect.value)}</span>` : ''}
      </summary>
      <div class="status-popover">
        <strong>${escapeHTML(effect.name)}</strong>
        <span>${escapeHTML(effect.description)}</span>
        ${effect.durationLabel ? `<small>${escapeHTML(effect.durationLabel)}</small>` : ''}
      </div>
    </details>
  `;
}

export function buffIcons(player, state) {
  const effects = getStatusEffects(player, state);
  if (effects.length === 0) return '<span class="status-empty">暂无状态</span>';
  return effects.map(statusEffectHTML).join('');
}
