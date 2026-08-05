const fs = require('fs');

let code = fs.readFileSync('src/pages/battle.js', 'utf8');

// Fix checkDraftShopModal render logic
code = code.replace(/      if \(existing\) return;\s*const overlay = document\.createElement\('div'\);/, 
`      const renderSlots = () => {
        const curSubj = s.schedule[s.currentClassIndex];
        return pDraft.slots.map((slot, idx) => {
          const c = slot.card;
          if (!c) return '<div class="draft-slot-card"><p>已领取</p></div>';
          const typeLabel = c.type === 'blessing' ? '祝福' : (c.type === 'buff' ? '增益' : (c.type === 'debuff' ? '减益' : '其他'));
          const typeClass = c.type || 'buff';
          const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
          const isHandFull = (s.me.handCards || []).length >= 3;
          const isAfford = s.me.tp >= c.tpCost;
          const buyDisabled = isHandFull || !isAfford;
          const buyReason = isHandFull ? '手牌已满' : (!isAfford ? 'TP不足' : '选择');
          return \`
          <div class="draft-slot-card">
            <div class="card-tag-row">
              <span class="card-tag-type \${typeClass}">[\${typeLabel}]</span>
              <span style="color:var(--text-secondary); font-size:0.7rem;">\${scopeLabel}</span>
              <span class="card-tp-cost">⚡\${c.tpCost} TP</span>
            </div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text-main); margin-top:2px;">\${c.name}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.3; min-height:40px;">\${c.desc}</div>
            <div class="draft-btn-row">
              <button class="btn-draft-action btn-draft-refresh" \${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="window._refreshDraftSlot(\${idx})">
                🔄刷新 (\${slot.refreshesLeft})
              </button>
              <button class="btn-draft-action btn-draft-buy" \${buyDisabled ? 'disabled' : ''} onclick="window._buyDraftCard(\${idx})">
                \${buyReason}
              </button>
            </div>
          </div>
          \`;
        });
      };

      if (existing) {
        const container = existing.querySelector('.draft-slots-container');
        if (container) container.innerHTML = renderSlots().join('');
        return;
      }

      const overlay = document.createElement('div');`);

// Remove old renderSlots definition
code = code.replace(/      const renderSlots = \(\) => {([^]*?)return `([^]*?)<\/div>[^]*?`;\s*}\);\s*};\s*/m, '');

// Make skill descriptions collapsible
code = code.replace(/<div class="skill-desc-box">([^]*?)<\/div>/g, 
`<details class="skill-details">
              <summary style="font-size:0.75rem; color:var(--text-secondary); cursor:pointer; text-align:center; padding-top:4px;">查看技能 (点击展开)</summary>
              <div class="skill-desc-box">$1</div>
            </details>`);

fs.writeFileSync('src/pages/battle.js', code);
console.log('battle.js updated');
