import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testPort = 3105;
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: join(tmpdir(), 'school-dice-duel-playwright'),
  timeout: 30000,
  use: {
    baseURL,
    headless: true,
    browserName: 'chromium',
  },
  webServer: {
    command: `node --input-type=module -e "process.env.NODE_ENV='production'; process.env.DISABLE_STATS_WRITE='1'; process.env.PORT='${testPort}'; const { build } = await import('vite'); await build({ logLevel: 'error' }); await import('./server/index.js')"`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
