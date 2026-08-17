import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { io as createSocketClient } from 'socket.io-client';

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    function handler(data) {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }

    socket.on(event, handler);
  });
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseURL, serverProcess, getOutput) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Test server exited early:\n${getOutput()}`);
    }
    try {
      const response = await fetch(`${baseURL}/api/stats`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out starting test server:\n${getOutput()}`);
}

function connectClient(baseURL, playerSessionId) {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(baseURL, {
      auth: { playerSessionId },
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out connecting test client'));
    }, 5000);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function resumeSession(socket) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('resume_session', {}, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function emitWithAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

test('an active battle survives a socket replacement during the reconnect grace period', async () => {
  const port = await findAvailablePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      RECONNECT_GRACE_MS: '2000',
      DISABLE_STATS_WRITE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.on('data', chunk => { serverOutput += chunk; });
  serverProcess.stderr.on('data', chunk => { serverOutput += chunk; });

  const sockets = [];
  try {
    await waitForServer(baseURL, serverProcess, () => serverOutput);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sessionA = `reconnect_player_a_${suffix}`;
    const sessionB = `reconnect_player_b_${suffix}`;
    const clientA = await connectClient(baseURL, sessionA);
    const clientB = await connectClient(baseURL, sessionB);
    sockets.push(clientA, clientB);

    const roomCreated = waitForEvent(clientA, 'room_created');
    clientA.emit('create_room', { nickname: 'Reconnect A' });
    const { roomId } = await roomCreated;

    const matchA = waitForEvent(clientA, 'match_found');
    const matchB = waitForEvent(clientB, 'match_found');
    clientB.emit('join_room', { nickname: 'Reconnect B', roomId });
    const [initialA, initialB] = await Promise.all([matchA, matchB]);

    const selectedA = waitForEvent(clientA, 'state_update', state => state.phase === 'preparation');
    clientA.emit('select_card', { cardId: 'char_6' });
    await selectedA;

    const selectedB = waitForEvent(clientB, 'state_update', state => state.phase === 'preparation');
    clientB.emit('select_card', { cardId: 'char_6' });
    await selectedB;

    const readyA = waitForEvent(clientA, 'state_update', state => state.me.ready === true);
    clientA.emit('ready');
    await readyA;

    const battleA = waitForEvent(clientA, 'state_update', state => state.phase === 'battle');
    const battleB = waitForEvent(clientB, 'state_update', state => state.phase === 'battle');
    clientB.emit('ready');
    const [stateA, stateB] = await Promise.all([battleA, battleB]);

    assert.equal(initialA.roomId, roomId);
    assert.equal(initialB.roomId, roomId);
    assert.notEqual(stateA.me.id, stateB.me.id);

    const originalPlayerId = stateA.me.id;
    const originalHp = stateA.me.hp;
    const oldSocketId = clientA.id;
    const connectionLost = waitForEvent(clientB, 'opponent_connection_lost');
    clientA.disconnect();

    const lostNotice = await connectionLost;
    assert.equal(lostNotice.playerId, originalPlayerId);
    assert.equal(lostNotice.graceMs, 2000);

    const replacementA = await connectClient(baseURL, sessionA);
    sockets.push(replacementA);
    assert.notEqual(replacementA.id, oldSocketId);

    const opponentReconnected = waitForEvent(clientB, 'opponent_reconnected');
    const resumed = await resumeSession(replacementA);
    const reconnectNotice = await opponentReconnected;

    assert.equal(resumed.ok, true);
    assert.equal(resumed.roomId, roomId);
    assert.equal(resumed.state.phase, 'battle');
    assert.equal(resumed.state.me.id, originalPlayerId);
    assert.equal(resumed.state.me.hp, originalHp);
    assert.notEqual(resumed.state.me.isDead, true);
    assert.equal(reconnectNotice.playerId, originalPlayerId);

    const gameOverA = waitForEvent(replacementA, 'game_over');
    const gameOverB = waitForEvent(clientB, 'game_over');
    const surrenderResult = await emitWithAck(clientB, 'surrender');
    const [resultA, resultB] = await Promise.all([gameOverA, gameOverB]);

    assert.equal(surrenderResult.ok, true);
    assert.equal(resultA.reason, 'surrender');
    assert.equal(resultA.state.phase, 'game_over');
    assert.equal(resultA.state.winner, resultA.state.myIndex);
    assert.equal(resultB.state.winner, resultA.state.winner);
    assert.equal(resultB.state.endReason, 'surrender');

    const firstStatusA = waitForEvent(replacementA, 'rematch_status');
    const firstStatusB = waitForEvent(clientB, 'rematch_status');
    const firstRematch = await emitWithAck(replacementA, 'request_rematch');
    const [statusA, statusB] = await Promise.all([firstStatusA, firstStatusB]);

    assert.equal(firstRematch.ok, true);
    assert.equal(firstRematch.started, false);
    assert.equal(statusA.readyCount, 1);
    assert.equal(statusB.required, 2);

    const rematchA = waitForEvent(replacementA, 'rematch_started');
    const rematchB = waitForEvent(clientB, 'rematch_started');
    const secondRematch = await emitWithAck(clientB, 'request_rematch');
    const [nextA, nextB] = await Promise.all([rematchA, rematchB]);

    assert.equal(secondRematch.ok, true);
    assert.equal(secondRematch.started, true);
    assert.equal(nextA.roomId, roomId);
    assert.equal(nextB.roomId, roomId);
    assert.equal(nextA.state.phase, 'preparation');
    assert.equal(nextB.state.phase, 'preparation');
    assert.equal(nextA.state.me.id, originalPlayerId);

    const roomClosed = waitForEvent(clientB, 'room_closed');
    const leaveResult = await emitWithAck(replacementA, 'leave_room');
    const closeNotice = await roomClosed;
    assert.equal(leaveResult.ok, true);
    assert.match(closeNotice.reason, /离开/);
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (serverProcess.exitCode === null) serverProcess.kill();
  }
});
