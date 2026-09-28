import { test, expect } from '@playwright/test';

test('page cleanup preserves room tracking and removes every page subscription', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { navigate } = await import('/src/app/router.js');
    let staleCalls = 0;
    gameSocket.on('future_game_event', () => staleCalls++);
    navigate('lobby');
    gameSocket.socket.emitEvent(['future_game_event']);
    gameSocket.socket.emitEvent(['room_created', { roomId: '6789' }]);
    return { staleCalls, roomId: gameSocket.currentRoomId };
  });
  expect(result).toEqual({ staleCalls: 0, roomId: '6789' });
});

test('room chat caps retained messages without losing the newest message', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { showGlobalChat } = await import('/src/components/chat.js');
    showGlobalChat('测试');
    for (let i = 0; i < 130; i++) {
      gameSocket.socket.emitEvent(['chat_msg_receive', { sender: '测试', msg: `消息${i}`, time: '' }]);
    }
  });
  await expect(page.locator('#chat-messages > .chat-msg')).toHaveCount(100);
  await expect(page.locator('#chat-messages > .chat-msg').last()).toContainText('消息129');
});

test('leaving autochess cancels its active replay', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { navigate } = await import('/src/app/router.js');
    const run = await new Promise(resolve => {
      gameSocket.socket.once('match_found', data => resolve(data.run));
      gameSocket.emit('start_autochess', { nickname: '生命周期测试' });
    });
    gameSocket.socket.emitEvent(['ac_combat_result', {
      result: run,
      combatLog: Array.from({ length: 4 }, (_, i) => ({ round: i, attacker: 'A', defender: 'B' })),
    }]);
    navigate('lobby');
    const app = document.getElementById('app');
    let mutations = 0;
    const observer = new MutationObserver(() => mutations++);
    observer.observe(app, { childList: true, subtree: true });
    await new Promise(resolve => setTimeout(resolve, 3000));
    observer.disconnect();
    return { mutations, lobby: !!document.getElementById('nickname-input') };
  });
  expect(result).toEqual({ mutations: 0, lobby: true });
  expect(errors).toEqual([]);
});
