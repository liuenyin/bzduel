// The old runner injected the pre-refactor index.css and asserted fixed card
// widths. Delegate to the current browser stress runner, which verifies the
// rendered hand and draft cards at five real viewport sizes.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(root, 'tests/e2e/challenger_stress_test.js')], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
