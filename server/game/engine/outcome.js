import { PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';

/** Call after revival and elimination effects. This never advances a turn. */
export function settleWinner(state) {
  const dead = player => player.isDead || player.hp <= 0;
  let winner = null;
  if (state.gameMode === GAME_MODE.MODE_1V1) {
    const [first, second] = state.players;
    if (dead(first) && dead(second)) winner = 'draw';
    else if (dead(second)) winner = 0;
    else if (dead(first)) winner = 1;
  } else if (state.gameMode === GAME_MODE.MODE_FFA) {
    const lord = state.players.find(player => player.identity === IDENTITY.LORD);
    const alive = state.players.filter(player => !dead(player));
    if (lord && dead(lord)) {
      winner = alive.length === 1 && alive[0].identity === IDENTITY.SPY ? 'spy' : 'rebel';
    } else if (!alive.some(player => [IDENTITY.REBEL, IDENTITY.SPY].includes(player.identity))) {
      winner = 'lord';
    }
  }
  if (winner !== null) {
    state.phase = PHASE.GAME_OVER;
    state.winner = winner;
  }
  return { gameOver: winner !== null, winner };
}
