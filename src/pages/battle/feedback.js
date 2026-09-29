import { escapeHTML } from '../../utils/html.js';

export function buildAlerts(data) {
  let alerts = [];
  data = data && typeof data === 'object' ? data : {};
  const ar = data.atkResult && typeof data.atkResult === 'object' ? data.atkResult : {};
  const addAlert = (type, text) => alerts.push(`<div class="skill-alert ${type}">${escapeHTML(text)}</div>`);

  if (data.deathCause === 'red_heat') addAlert('negative', '红温伤害致死');

  if (ar.posTriggered) addAlert('positive', `[${ar.posName || '正面技能'}] 发动`);
  if (ar.negTriggered) addAlert('negative', `[${ar.negName || '负面技能'}] 发动`);

  const results = data.isAoE ? (Array.isArray(data.aoeResults) ? data.aoeResults : []) : [data];

  results.forEach(res => {
    if (!res || typeof res !== 'object') return;
    if (res.defPosTriggered) addAlert('positive', `[${res.defPosName || '正面技能'}] 发动`);
    if (res.defNegTriggered) addAlert('negative', `[${res.defNegName || '负面技能'}] 发动`);

    if (Number(res.lcCounterDamage) > 0) addAlert('positive', `反击伤害: ${Number(res.lcCounterDamage)}`);
    if (res.lcHealTriggered) addAlert('positive', `献祭回复: ${Number(res.healAmount) || 0}HP`);
    if (res.eatTriggered) addAlert('positive', '吃掉！攻击降为 2');
    if (res.noobTriggered) addAlert('negative', '杂鱼反噬 — 血量减半！');
    if (res.detonateTriggered) addAlert('negative', `红温引爆 — ${Number(res.detonateDamage) || 0}伤害！`);
    if (Number(res.redHeatApplied) > 0) addAlert('negative', `红温 +${Number(res.redHeatApplied)}层`);
    if (res.extraTurnTriggered) addAlert('positive', '死磕 — 获得额外攻击回合！');
    if (res.nineLivesTriggered || data.nineLivesTriggered) addAlert('positive', '九条命 — 满血复活！');
  });

  if (data.firstBloodTriggered) addAlert('negative', '偏科 — 防御选骰数 -1！');

  return [...new Set(alerts)].join('');
}

export function buildResolutionSummary(data) {
  const selfDamage = Number(data.selfDamage) || 0;
  if (selfDamage > 0 && (!data.damage || Number(data.damage) === 0)) {
    return `<div class="resolution-summary self-damage">自伤 ${selfDamage}</div>`;
  }

  if (data.isAoE && Array.isArray(data.aoeResults)) {
    const knownDamage = data.aoeResults.reduce((sum, result) => sum + (Number(result.damage) || 0), 0);
    const hitCount = data.aoeResults.filter(result => Number(result.damage) > 0).length;
    return knownDamage > 0
      ? `<div class="resolution-summary damage">命中 ${hitCount} 人 · 共 ${knownDamage} 伤害</div>`
      : '<div class="resolution-summary guarded">群体防守成功</div>';
  }

  const damage = Number(data.damage);
  if (Number.isFinite(damage) && damage > 0) {
    return `<div class="resolution-summary damage">造成 ${damage} 点伤害</div>`;
  }
  if (Number.isFinite(damage)) return '<div class="resolution-summary guarded">防守成功 · 未受伤</div>';
  return '<div class="resolution-summary">本回合结算完成</div>';
}
