import { escapeHTML } from '../../utils/html.js';
import { SUBJECTS } from '../../../shared/rules.js';

function damageExplanationHTML(calculation) {
  if (!calculation || !Array.isArray(calculation.steps)) return '';
  return `<details class="damage-explanation"><summary>查看伤害计算</summary>
    <p>攻击 ${escapeHTML(calculation.attack)} · 防御 ${escapeHTML(calculation.defense)}</p>
    <ol>${calculation.steps.map(step => `<li>${escapeHTML(step.label)}：<strong>${escapeHTML(step.value)}</strong></li>`).join('')}</ol>
    <p>本次攻击伤害：${escapeHTML(calculation.damage)}。独立自伤、反击及治疗另行结算。</p>
  </details>`;
}

export function getLogSummary(entry) {
  if (!entry) return '尚无战斗记录';
  const details = entry.details || {};
  if (entry.type === 'turn' && Array.isArray(details.targets)) {
    const totalDamage = details.targets.reduce((sum, target) => sum + (Number(target.damage) || 0), 0);
    return `${details.actorName || '攻击方'} · ${details.targets.length} 个目标 · ${totalDamage > 0 ? `共 ${totalDamage} 伤害` : '未造成伤害'}`;
  }
  if (entry.type === 'turn') {
    return `${details.actorName || '攻击方'} → ${details.targetName || '防守方'} · ${(Number(details.damage) || 0) > 0 ? `${details.damage} 伤害` : '未造成伤害'}`;
  }
  return entry.text || '战斗记录';
}

export function logEntryHTML(entry) {
  const details = entry.details || {};
  const entryAttrs = `data-log-id="${escapeHTML(entry.id || '')}" data-log-type="${escapeHTML(entry.type || 'system')}" data-actor-id="${escapeHTML(entry.actorId || '')}"`;
  if (entry.type === 'turn') {
    const notes = [];
    if (details.pierce) notes.push('穿透');
    if (Number(details.selfDamage) > 0) notes.push(`攻击方自伤 ${details.selfDamage}`);
    if (Number(details.counterDamage) > 0) notes.push(`反击 ${details.counterDamage}`);
    if (Number(details.healAmount) > 0) notes.push(`回复 ${details.healAmount}`);

    if (Array.isArray(details.targets)) {
      const targets = details.targets.map(target => {
        const targetNotes = [];
        if (Number(target.counterDamage) > 0) targetNotes.push(`反击 ${target.counterDamage}`);
        if (Number(target.healAmount) > 0) targetNotes.push(`回复 ${target.healAmount}`);
        return `
          <div class="log-target-result">
            <span>${escapeHTML(details.actorName || '攻击方')} → ${escapeHTML(target.targetName || '目标')}</span>
            <strong class="${Number(target.damage) > 0 ? 'damage' : 'miss'}">${Number(target.damage) > 0 ? `-${target.damage} HP` : '无伤害'}</strong>
            ${targetNotes.length ? `<small>${escapeHTML(targetNotes.join(' · '))}</small>` : ''}
            ${damageExplanationHTML(target.damageBreakdown)}
          </div>
        `;
      }).join('');
      return `<article class="log-entry log-entry-turn" ${entryAttrs}>${targets}${notes.length ? `<div class="log-entry-notes">${escapeHTML(notes.join(' · '))}</div>` : ''}</article>`;
    }

    const damage = Number(details.damage) || 0;
    return `
      <article class="log-entry log-entry-turn" ${entryAttrs}>
        <div class="log-entry-main">
          <span>${escapeHTML(details.actorName || '攻击方')} → ${escapeHTML(details.targetName || '防守方')}</span>
          <strong class="${damage > 0 ? 'damage' : 'miss'}">${damage > 0 ? `-${damage} HP` : '无伤害'}</strong>
        </div>
        ${notes.length ? `<div class="log-entry-notes">${escapeHTML(notes.join(' · '))}</div>` : ''}
        ${damageExplanationHTML(details.damageBreakdown)}
      </article>
    `;
  }

  const typeLabel = entry.type === 'tactical' ? '战术' : (entry.type === 'skill' ? '技能' : '系统');
  return `
    <article class="log-entry log-entry-${escapeHTML(entry.type || 'system')}" ${entryAttrs}>
      <span class="log-type">${typeLabel}</span>
      <span class="log-entry-text">${escapeHTML(entry.text || '')}</span>
    </article>
  `;
}

export function battleLogContentHTML(state) {
  const entries = [...(state?.log || [])].reverse();
  if (entries.length === 0) return '<div class="battle-log-empty">第一轮结算后会在这里留下记录</div>';

  const classGroups = new Map();
  for (const entry of entries) {
    const classKey = Number.isInteger(entry.classIndex)
      ? `${Number.isInteger(entry.day) ? entry.day : 1}:${entry.classIndex}`
      : 'legacy';
    if (!classGroups.has(classKey)) classGroups.set(classKey, []);
    classGroups.get(classKey).push(entry);
  }

  return [...classGroups.entries()].map(([classKey, classEntries]) => {
    const first = classEntries[0];
    const subject = SUBJECTS[first.subject];
    const [dayNumber, classIndex] = classKey === 'legacy'
      ? [null, null]
      : classKey.split(':').map(Number);
    const classTitle = classKey === 'legacy'
      ? '早期记录'
      : `第 ${dayNumber} 天 · 第 ${classIndex + 1} 节 · ${subject?.label || first.subject || '课程'}`;
    const roundGroups = new Map();
    for (const entry of classEntries) {
      const roundKey = Number.isInteger(entry.totalRound) ? entry.totalRound : 'legacy';
      if (!roundGroups.has(roundKey)) roundGroups.set(roundKey, []);
      roundGroups.get(roundKey).push(entry);
    }

    const rounds = [...roundGroups.entries()].map(([roundKey, roundEntries]) => {
      const subRound = roundEntries[0].subRound;
      const roundTitle = roundKey === 'legacy'
        ? '记录'
        : `第 ${Number.isInteger(subRound) ? subRound + 1 : roundKey} 回合`;
      return `
        <section class="battle-log-round">
          <h4>${escapeHTML(roundTitle)}</h4>
          <div class="battle-log-entries">${roundEntries.map(logEntryHTML).join('')}</div>
        </section>
      `;
    }).join('');

    return `<section class="battle-log-class"><h3>${escapeHTML(classTitle)}</h3>${rounds}</section>`;
  }).join('');
}

export function battleLogHTML(state) {
  const entries = state?.log || [];
  const latest = entries[entries.length - 1];
  return `
    <details class="battle-log" id="battle-log">
      <summary class="battle-log-summary">
        <span class="battle-log-heading">战斗记录 <span id="battle-log-count">${entries.length}</span></span>
        <span class="battle-log-latest" id="battle-log-latest">${escapeHTML(getLogSummary(latest))}</span>
        <span class="battle-log-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="battle-log-content" id="battle-log-content">${battleLogContentHTML(state)}</div>
    </details>
  `;
}

export function buildBattleSummary(state, playerId) {
  const summary = {
    damageDealt: 0,
    damageTaken: 0,
    flawlessDefenses: 0,
    tacticalCards: 0,
    highestHit: 0,
    skillTriggers: 0,
  };
  const player = state.players?.find(candidate => candidate.id === playerId);

  for (const entry of (Array.isArray(state?.log) ? state.log : [])) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'tactical' && entry.actorId === playerId) summary.tacticalCards += 1;
    if (entry.type === 'skill' && (entry.actorId === playerId || (!entry.actorId && player?.nickname && entry.text?.includes(player.nickname)))) {
      summary.skillTriggers += 1;
    }
    if (entry.type !== 'turn') continue;

    const details = entry.details || {};
    if (entry.actorId === playerId) summary.damageTaken += Number(details.selfDamage) || 0;

    if (Array.isArray(details.targets)) {
      for (const target of details.targets) {
        const damage = Number(target.damage) || 0;
        const counterDamage = Number(target.counterDamage) || 0;
        if (entry.actorId === playerId) {
          summary.damageDealt += damage;
          summary.damageTaken += counterDamage;
          summary.highestHit = Math.max(summary.highestHit, damage);
        }
        if (target.playerId === playerId) {
          summary.damageTaken += damage;
          summary.flawlessDefenses += damage === 0 ? 1 : 0;
          summary.damageDealt += counterDamage;
          summary.highestHit = Math.max(summary.highestHit, counterDamage);
        }
      }
      continue;
    }

    const damage = Number(details.damage) || 0;
    const counterDamage = Number(details.counterDamage) || 0;
    if (entry.actorId === playerId) {
      summary.damageDealt += damage;
      summary.damageTaken += counterDamage;
      summary.highestHit = Math.max(summary.highestHit, damage);
    }
    if (entry.targetId === playerId) {
      summary.damageTaken += damage;
      summary.flawlessDefenses += damage === 0 ? 1 : 0;
      summary.damageDealt += counterDamage;
      summary.highestHit = Math.max(summary.highestHit, counterDamage);
    }
  }

  return summary;
}

export function battleSummaryHTML(state) {
  state = state && typeof state === 'object' ? state : {};
  const summary = buildBattleSummary(state, state.me?.id);
  const metrics = [
    ['造成伤害', summary.damageDealt],
    ['承受伤害', summary.damageTaken],
    ['无伤防守', summary.flawlessDefenses],
    ['战术卡', summary.tacticalCards],
    ['最高单次', summary.highestHit],
    ['技能触发', summary.skillTriggers],
  ];
  return `
    <section class="go-review" aria-label="本局复盘">
      <h2>本局复盘</h2>
      <div class="go-review-grid">
        ${metrics.map(([label, value]) => `
          <div class="go-review-metric">
            <strong>${value}</strong>
            <span>${label}</span>
          </div>
        `).join('')}
      </div>
      <details class="go-battle-log">
        <summary>查看完整战斗记录 <span>${Array.isArray(state.log) ? state.log.length : 0}</span></summary>
        <div class="go-battle-log-content">${battleLogContentHTML(state)}</div>
      </details>
    </section>
  `;
}
