with open('src/style/index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Remove duplicate Aura block starting from line 1087 to 1280
dup_str = """/* 角色 Aura 光环 (高质感微光) */
.aura-gpy-rage {
  box-shadow: 0 0 16px rgba(220, 38, 38, 0.6), inset 0 0 10px rgba(220, 38, 38, 0.4) !important;
  border-color: #ef4444 !important;
  animation: auraPulseRed 1.8s infinite ease-in-out;
}
@keyframes auraPulseRed {
  0%, 100% { box-shadow: 0 0 12px rgba(220, 38, 38, 0.5); }
  50% { box-shadow: 0 0 24px rgba(220, 38, 38, 0.9); }
}

.aura-dream-domain {
  box-shadow: 0 0 16px rgba(168, 85, 247, 0.6), inset 0 0 10px rgba(168, 85, 247, 0.4) !important;
  border-color: #c084fc !important;
  animation: auraPulsePurple 2s infinite ease-in-out;
}
@keyframes auraPulsePurple {
  0%, 100% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.5); }
  50% { box-shadow: 0 0 22px rgba(168, 85, 247, 0.85); }
}

.aura-zxs-water {
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.6) !important;
  border-color: #38bdf8 !important;
  animation: auraPulseBlue 2s infinite ease-in-out;
}
@keyframes auraPulseBlue {
  0%, 100% { box-shadow: 0 0 10px rgba(56, 189, 248, 0.4); }
  50% { box-shadow: 0 0 20px rgba(56, 189, 248, 0.8); }
}

.aura-yzm-gold {
  box-shadow: 0 0 14px rgba(234, 179, 8, 0.6) !important;
  border-color: #facc15 !important;
}

.aura-wyc-redheat {
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.7) !important;
  border-color: #ef4444 !important;
  animation: auraPulseRedHeat 1.5s infinite ease-in-out;
}
@keyframes auraPulseRedHeat {
  0%, 100% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }
  50% { box-shadow: 0 0 24px rgba(239, 68, 68, 0.9); }
}

.aura-whd-sugar {
  box-shadow: 0 0 16px rgba(236, 72, 153, 0.6) !important;
  border-color: #ec4899 !important;
  animation: auraGlitchPink 0.3s infinite;
}
@keyframes auraGlitchPink {
  0% { transform: translate(0) }
  20% { transform: translate(-1px, 1px) }
  40% { transform: translate(-1px, -1px) }
  60% { transform: translate(1px, 1px) }
  80% { transform: translate(1px, -1px) }
  100% { transform: translate(0) }
}

/* 梦境盲选弹窗 (移动端高度适配) */
.dream-target-modal-panel {
  max-width: 440px;
  width: 92%;
  padding: 24px 16px;
  background: rgba(23, 15, 38, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1.5px solid rgba(168, 85, 247, 0.5);
  border-radius: 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: #fff;
  text-align: center;
  margin: auto;
}

.dream-target-cards-container {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 18px 0;
}

.dream-target-btn {
  flex: 1;
  padding: 16px 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1.5px solid rgba(168, 85, 247, 0.4);
  border-radius: 14px;
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.dream-target-btn:active {
  transform: scale(0.95);
  background: rgba(168, 85, 247, 0.3);
}

@media (max-width: 480px) {
  .dream-target-cards-container {
    gap: 8px;
  }
  .dream-target-btn {
    padding: 14px 4px;
    font-size: 0.85rem;
  }
}

/* ══════════════════════════════════════════════
   Buff 状态标签 — 纯文字色彩标签 (无 emoji)
   ══════════════════════════════════════════════ */
.buff-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin: 1px 2px;
  white-space: nowrap;
  line-height: 1.3;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}
.buff-label {
  font-family: var(--font-mono, 'Consolas', monospace);
}
.buff-neutral {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  border-color: rgba(100, 116, 139, 0.3);
}
.buff-debuff {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.25);
}
.buff-sugar {
  background: rgba(236, 72, 153, 0.15);
  color: #f9a8d4;
  border-color: rgba(236, 72, 153, 0.3);
}
.buff-heat {
  background: rgba(220, 38, 38, 0.2);
  color: #fca5a5;
  border-color: rgba(220, 38, 38, 0.4);
  animation: buffHeatPulse 2s infinite ease-in-out;
}
@keyframes buffHeatPulse {
  0%, 100% { background: rgba(220, 38, 38, 0.15); }
  50% { background: rgba(220, 38, 38, 0.3); }
}
.buff-charge {
  background: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
  border-color: rgba(56, 189, 248, 0.3);
}
.buff-sticker {
  background: rgba(251, 146, 60, 0.15);
  color: #fdba74;
  border-color: rgba(251, 146, 60, 0.3);
}
.buff-dream {
  background: rgba(107, 33, 168, 0.2);
  color: #c4b5fd;
  border-color: rgba(139, 92, 246, 0.3);
}
.buff-dream-active {
  background: rgba(88, 28, 135, 0.35);
  color: #fef08a;
  border-color: rgba(168, 85, 247, 0.5);
  animation: buffDreamGlow 2.5s infinite ease-in-out;
}
@keyframes buffDreamGlow {
  0%, 100% { box-shadow: 0 0 4px rgba(168, 85, 247, 0.3); }
  50% { box-shadow: 0 0 10px rgba(168, 85, 247, 0.6); }
}
.buff-gpy {
  background: rgba(153, 27, 27, 0.35);
  color: #fca5a5;
  border-color: rgba(220, 38, 38, 0.5);
  animation: buffGpyPulse 1s infinite;
}
@keyframes buffGpyPulse {
  0%, 100% { opacity: 1; }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}"""

if dup_str in css:
    css = css.replace(dup_str, '')
    print("Duplicate CSS block removed.")
else:
    print("Duplicate string not found exact match, skipping dup removal")

# 2. Add summary details marker styling
summary_style = """
summary::-webkit-details-marker { display: none; }
summary { list-style: none; }
"""

if "summary::-webkit-details-marker" not in css:
    css += "\n" + summary_style
    print("Summary details marker styling added.")

with open('src/style/index.css', 'w', encoding='utf-8') as f:
    f.write(css)
