import test from 'node:test';
import assert from 'node:assert/strict';

import { phasePrompt } from '../src/pages/battle/presentation.js';

const players = [
  { id: 'attacker', nickname: '攻击者', hp: 30, isDead: false },
  { id: 'defender-a', nickname: '甲<测试>', hp: 20, isDead: false },
  { id: 'defender-b', nickname: '乙<测试>', hp: 20, isDead: false },
  { id: 'defender-dead', nickname: '已淘汰', hp: 0, isDead: true },
];

test('FFA defense prompt names pending players and shows confirmation progress', () => {
  const prompt = phasePrompt({
    turnPhase: 'def_rolled',
    players,
    me: { id: 'attacker' },
    aoeDefenses: {
      'defender-a': { confirmed: true },
      'defender-b': { confirmed: false },
      'defender-dead': { confirmed: false },
    },
    isMyDefendTurn: false,
  });

  assert.equal(prompt, '等待乙&lt;测试&gt;完成防御（已确认 1/2）…');
});

test('FFA defender sees the same progress while choosing dice', () => {
  const prompt = phasePrompt({
    turnPhase: 'def_rolled',
    players,
    me: { id: 'defender-b' },
    aoeDefenses: {
      'defender-a': { confirmed: true },
      'defender-b': { confirmed: false },
    },
    isMyDefendTurn: true,
  });

  assert.equal(prompt, '群攻防御：选择骰子后确认（已确认 1/2）');
});
