import { chromium } from 'playwright';
import { spawn } from 'child_process';
import http from 'http';
import net from 'net';

const PORT = 3006;
const BASE_URL = `http://localhost:${PORT}`;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function waitForServer(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve(true);
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > 15000) reject(new Error('Timeout'));
      else setTimeout(check, 300);
    };
    check();
  });
}

async function main() {
  let serverProcess = null;
  if (!await isPortOpen(PORT)) {
    serverProcess = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: '3006' } });
    await waitForServer(BASE_URL);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });

  await page.goto(BASE_URL);
  await page.fill('#nickname-input', 'ZIndex_Tester');
  await page.click('#btn-pve');
  await page.waitForSelector('.avatar-cell[data-id="char_6"]');
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn');

  console.log('Attempting to click #modal-select-btn on 320x568 viewport...');
  try {
    await page.click('#modal-select-btn', { timeout: 3000 });
    console.log('Click succeeded unexpectedly!');
  } catch (err) {
    console.log('REPRODUCED BUG! Click intercepted by chat widget:');
    console.log(err.message);
  }

  await browser.close();
  if (serverProcess) serverProcess.kill();
}

main();
