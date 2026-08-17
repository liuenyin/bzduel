import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');

if (!fs.existsSync(path.dirname(STATS_FILE))) {
  fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
}

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to read stats file', e);
  }
  return { pvp: {}, pve: {} };
}

function saveStats(stats) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write stats file', e);
  }
}

export function recordMatch(winnerId, loserId, isPvE) {
  if (process.env.DISABLE_STATS_WRITE === '1') return;
  if (!winnerId || !loserId || winnerId === loserId) return;
  const stats = loadStats();
  const category = isPvE ? 'pve' : 'pvp';
  if (!stats[category]) stats[category] = {};
  if (!stats[category][winnerId]) stats[category][winnerId] = {};
  stats[category][winnerId][loserId] = (stats[category][winnerId][loserId] || 0) + 1;
  saveStats(stats);
}

export function getStats() {
  return loadStats();
}

