import { identityName } from './arena.js';
import { pct } from './presentation.js';
import { battleSummaryHTML } from './log.js';
import { buffIcons } from './status.js';
import { escapeHTML } from '../../utils/html.js';
import { gameSocket } from '../../net/socket.js';
import { navigate } from '../../app/router.js';
import { trapFocus } from '../../utils/a11y.js';

export function createBattleResults({ actions, viewLifecycle, appendOverlay }) {
  function showGameOver(s, meta = {}) {
    if (!s || typeof s !== 'object') return;
    meta = meta && typeof meta === 'object' ? meta : {};
    if (document.querySelector('.game-over-screen')) return;
    const o = document.createElement('div');
    o.className = 'game-over-screen';

    let isWin = false;
    let statusStr = '';

    if (s.gameMode === '1v1') {
      isWin = s.winner === s.myIndex;
      const isDraw = s.winner === 'draw';
      statusStr = isDraw ? '平 局' : (isWin ? '胜 利' : '败 北');
    } else {
      // FFA
      if (s.winner === 'lord') {
        isWin = s.me?.identity === 'lord' || s.me?.identity === 'loyalist';
        statusStr = isWin ? '胜 利 (主公/忠臣 赢)' : '败 北 (主公/忠臣 赢)';
      } else if (s.winner === 'rebel') {
        isWin = s.me?.identity === 'rebel';
        statusStr = isWin ? '胜 利 (反贼 赢)' : '败 北 (反贼 赢)';
      } else if (s.winner === 'spy') {
        isWin = s.me?.identity === 'spy';
        statusStr = isWin ? '胜 利 (内奸 赢)' : '败 北 (内奸 赢)';
      }
    }

    const statusClass = (s.gameMode === '1v1' && s.winner === 'draw') ? 'draw' : (isWin ? 'win' : 'lose');
    const endReason = meta.reason || s.endReason;
    const surrenderedPlayer = s.players?.find(player => player.id === (meta.surrenderedId || s.surrenderedId));
    const reasonText = endReason === 'surrender'
      ? `${surrenderedPlayer?.nickname || '一名玩家'} 投降`
      : (endReason === 'red_heat'
        ? '红温伤害致死'
        : (endReason === 'dice_self_damage'
          ? '掷骰自伤致死'
          : (endReason === 'tactical_card' ? '战术卡造成致命伤害' : '对局结束')));

    function renderPlayer(p, index) {
      if (!p) return '';
      const isMe = index === s.myIndex;
      const card = p.card && typeof p.card === 'object'
        ? p.card
        : { name: '未知角色', image: '' };
      const isYzx = (p.cardId === 'char_10' || p.stealthActive) && !isMe;
      const hpText = isYzx ? '??' : p.hp;
      const maxHpText = isYzx ? '??' : p.maxHp;
      const hpPercent = isYzx ? 100 : pct(Number(p.hp), Number(p.maxHp));
      const identityHtml = s.gameMode === 'sanguosha' ? `<div style="color:var(--accent);font-size:0.8rem;margin-top:4px;">身份: ${escapeHTML(p.identity === '?' ? '未知' : identityName(p.identity))}</div>` : '';

      return `
        <div class="player-box ${isMe ? 'me' : 'op'} ${isYzx ? 'stealth' : ''}" style="${s.gameMode === 'sanguosha' ? 'width:45%; margin-bottom:10px;' : ''}">
          <div class="avatar-area">
            ${card.image ? `<img src="${escapeHTML(card.image)}" class="avatar" alt="${escapeHTML(card.name || '角色')}" onerror="this.remove()" />` : ''}
            ${isMe ? `<div class="badge-me">我</div>` : ''}
          </div>
          <div class="player-info">
            <div class="name-row">
              <span class="nickname">${escapeHTML(p.nickname)}</span>
              <span class="card-name">${escapeHTML(card.name)}</span>
            </div>
            ${identityHtml}
            <div class="hp-container">
              <div class="hp-bar">
                <div class="hp-bar-fill" style="width:${hpPercent}%"></div>
              </div>
              <div class="hp-text">${escapeHTML(hpText)} / ${escapeHTML(maxHpText)}</div>
            </div>
            <div class="buffs-row">${buffIcons(p, s)}</div>
          </div>
        </div>
      `;
    }

    let statsHtml = '';
    if (s.gameMode === '1v1') {
      statsHtml = `
        ${renderPlayer(s.me, s.myIndex)}
        <div class="go-vs">VS</div>
        ${renderPlayer(s.opponent, (s.myIndex + 1) % 2)}
      `;
    } else {
      statsHtml = `<div style="display:flex; flex-wrap:wrap; justify-content:space-between; max-height:400px; overflow-y:auto; width:100%;">`;
      (s.players || []).forEach((p, idx) => {
        statsHtml += renderPlayer(p, idx);
      });
      statsHtml += `</div>`;
    }

    o.innerHTML = `
      <div class="go-content ${statusClass}" role="dialog" aria-modal="true" aria-labelledby="game-over-title" style="${s.gameMode==='sanguosha'?'width:90%; max-width:800px;':''}">
        <h1 id="game-over-title" class="go-title">${statusStr}</h1>
        <p class="go-reason">${escapeHTML(reasonText)}</p>
        <div class="go-stats" style="${s.gameMode==='sanguosha'?'flex-direction:row; flex-wrap:wrap;':''}">
          ${statsHtml}
        </div>
        ${battleSummaryHTML(s)}
        <div class="go-footer">
          ${s.gameMode === '1v1' ? '<button class="btn btn-primary btn-lg" id="btn-rematch">再来一局</button>' : ''}
          <button class="btn btn-secondary btn-lg" id="btn-back">返回大厅</button>
        </div>
      </div>
    `;
    appendOverlay(o);
    const dialog = o.querySelector('[role="dialog"]');
    o.addEventListener('keydown', event => trapFocus(event, dialog));
    dialog.querySelector('button')?.focus();
    viewLifecycle.listen(document.getElementById('btn-rematch'), 'click', () => {
      const button = document.getElementById('btn-rematch');
      button.disabled = true;
      button.textContent = s.opponent?.id?.startsWith('AI_') ? '正在重开…' : '等待对手（1/2）';
      gameSocket.requestRematch((result) => {
        if (!viewLifecycle.active) return;
        if (!result?.ok) {
          button.disabled = false;
          button.textContent = '再来一局';
          actions.showToast(result?.error || '无法重赛');
        }
      });
    });
    viewLifecycle.listen(document.getElementById('btn-back'), 'click', event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '正在返回…';
      gameSocket.leaveRoom(result => {
        if (result?.ok) {
          o.remove();
          navigate('lobby');
          return;
        }
        button.disabled = false;
        button.textContent = '返回大厅';
        actions.showToast(result?.error || '返回失败，请重试');
      });
    });
  }
  return { showGameOver };
}
