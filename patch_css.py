import re

with open('src/style/index.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: missing animations popIn and pulse
if "@keyframes pulse" not in content:
    content += """
@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes popIn {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
"""

# Fix 2: new draft shop UI styles
if ".draft-card-star" not in content:
    content += """
.draft-slots-container {
  display: flex; gap: 15px; justify-content: center;
}
.draft-slot-card {
  width: 150px; background: var(--bg-card);
  border: 2px solid transparent; border-radius: 12px;
  padding: 10px; cursor: pointer; transition: 0.2s;
  position: relative; overflow: hidden;
}
.draft-slot-card.clickable:hover {
  transform: translateY(-5px);
  border-color: var(--gold);
  box-shadow: 0 4px 15px rgba(255,215,0,0.2);
}
.draft-slot-card.disabled {
  opacity: 0.6; cursor: not-allowed;
}
.draft-slot-card.empty {
  border: 1px dashed var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 1rem;
}
.btn-icon-refresh {
  position: absolute; right: 5px; top: 5px;
  background: var(--bg-inset); color: var(--text-main);
  border: none; border-radius: 50%;
  width: 24px; height: 24px; font-size: 12px;
  cursor: pointer; z-index: 2;
}
.btn-icon-refresh:hover:not(:disabled) {
  background: var(--primary);
}
.btn-icon-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
.draft-card-star {
  color: var(--gold); font-size: 0.8rem; margin-bottom: 4px;
}
"""

# Fix 3: KARDS Style Floating Hand UI
if ".hand-fab-container" not in content:
    content += """
/* KARDS Style Hand */
.hand-fab-container {
  position: fixed; bottom: 20px; right: 20px;
  z-index: 1000; display: flex; flex-direction: column;
  align-items: flex-end; gap: 10px;
}
.hand-fab {
  width: 60px; height: 60px; border-radius: 50%;
  background: var(--primary); color: #fff;
  border: 2px solid var(--accent);
  box-shadow: 0 4px 15px rgba(0,0,0,0.5);
  cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.hand-fab:hover, .hand-fab.active {
  transform: scale(1.1);
  background: var(--primary-dark, #3b82f6);
}
.fab-icon { font-size: 1.2rem; }
.fab-count { font-size: 0.6rem; font-weight: bold; }
.fab-tp { font-size: 0.7rem; color: var(--gold); font-weight: 900; background: rgba(0,0,0,0.5); padding: 1px 4px; border-radius: 4px; margin-top: -2px; }

.hand-fan-container {
  position: absolute; bottom: 80px; right: 0;
  width: 300px; height: 200px;
  pointer-events: none; opacity: 0;
  transition: 0.4s; transform-origin: bottom right;
  transform: translateY(50px) scale(0.5);
}
.hand-fan-container.expanded {
  pointer-events: auto; opacity: 1;
  transform: translateY(0) scale(1);
}
.hand-card-kards {
  position: absolute; bottom: 0; left: 50%;
  margin-left: -65px; /* center align */
  width: 130px; height: 180px;
  background: var(--bg-card); border-radius: 8px;
  border: 1px solid var(--bg-inset);
  padding: 8px; box-shadow: -2px -2px 10px rgba(0,0,0,0.3);
  transform-origin: bottom center;
  transition: 0.2s; cursor: pointer;
  overflow: hidden;
}
.hand-card-kards:hover:not(.disabled) {
  z-index: 10;
  box-shadow: 0 0 15px var(--gold);
  border-color: var(--gold);
}
.hand-card-kards.disabled { opacity: 0.5; filter: grayscale(1); cursor: not-allowed; }
.hand-card-kards:hover:not(.disabled) {
   /* We use !important to override the inline transform rotation temporarily if hovered */
   transform: rotate(0deg) translateY(-20px) scale(1.1) !important;
}

.blessing-badges {
  display: flex; gap: 4px; flex-wrap: wrap-reverse; max-width: 150px; justify-content: flex-end;
}
.blessing-badge {
  background: var(--bg-card); color: #a3e635;
  border: 1px solid rgba(163,230,53,0.5);
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: bold;
}
"""

# Fix 4: Toasts
if ".toast.show" not in content:
    content += """
.toast {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px);
  background: var(--primary); color: #fff; padding: 10px 20px;
  border-radius: 8px; opacity: 0; pointer-events: none; transition: 0.3s;
  z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); font-weight: bold;
}
.toast.show {
  opacity: 1; transform: translateX(-50%) translateY(0);
}
"""

with open('src/style/index.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('index.css patched successfully.')
