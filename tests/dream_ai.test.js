import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, selectCard, setReady } from '../server/game/engine.js';
import { createAiController } from '../server/duel/ai-controller.js';
import { registerDuelHandlers } from '../server/duel/handlers.js';

for (const choiceDelay of [0, 1500]) {
  test(`human dream choice resumes AI attack after ${choiceDelay} ms without a second action`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const game = createGame([{ id: 'human', nickname: '玩家' }, { id: 'AI_test', nickname: '电脑' }]);
    selectCard(game, 'human', 'char_6');
    selectCard(game, 'AI_test', 'char_fxr');
    setReady(game, 'human');
    setReady(game, 'AI_test');
    const dreamKing = game.players[1];
    Object.assign(dreamKing, { inDreamState: true, dreamTargetChoice: null, realTargetIdx: 2 });
    game.turnPhase = 'waiting_atk';
    game.turnData = { attackerIdx: 1, defenderIdx: 0, attackRolls: null, defenseRolls: null };

    const room = { game, isAI: true, aiId: 'AI_test', playerSockets: ['human', null] };
    const rooms = new Map([['1234', room]]);
    const states = [];
    const context = {
      rooms,
      emitStateToAll: () => states.push(game.turnPhase),
      emitToAll: () => {},
      io: { sockets: { sockets: new Map() } },
    };
    const { triggerAiPhase } = createAiController(context);
    const handlers = new Map();
    const socket = { id: 'test-socket', data: {}, join() {}, on: (event, handler) => handlers.set(event, handler) };
    registerDuelHandlers(socket, {
      ...context, triggerAiPhase,
      getPersistentPlayerId: () => 'human', activeSockets: new Map(),
      socketToRoom: new Map([['human', '1234']]), getRoom: () => room,
    });

    triggerAiPhase('1234');
    t.mock.timers.tick(choiceDelay);
    assert.equal(game.turnPhase, 'waiting_atk');
    assert.equal(game.turnData.attackRolls, null);
    let reply;
    handlers.get('choose_dream_target')({ targetIndex: 2 }, result => { reply = result; });
    assert.deepEqual(reply, { ok: true, isReal: true });
    t.mock.timers.tick(900);
    assert.equal(game.turnPhase, 'atk_rolled');
    assert.equal(game.turnData.attackRolls.length, dreamKing.card.dicePool.length);
    assert.ok(states.includes('atk_rolled'));
  });
}
