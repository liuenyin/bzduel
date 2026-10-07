import test from 'node:test';
import assert from 'node:assert/strict';

import { readableActionError } from '../server/duel/handlers.js';

test('battle action errors never expose internal dream or dice codes', () => {
  assert.equal(readableActionError('dream_target_required', 'fallback'), '梦境盲选尚未完成，请等待对手选择目标。');
  assert.equal(readableActionError('invalid_slots', 'fallback'), '请选择有效的骰子');
  assert.equal(readableActionError('zww_d10_limit', 'fallback'), '曾无畏的限制：防御时最多只能选中一个 D10 骰子！');
  assert.equal(readableActionError('当前阶段无法操作', 'fallback'), '当前阶段无法操作');
  assert.equal(readableActionError('unexpected_internal_code', 'fallback'), 'fallback');
});
