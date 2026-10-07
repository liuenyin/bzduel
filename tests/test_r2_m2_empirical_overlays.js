// Compatibility entry point: overlay geometry is now covered by the current
// browser stress runner after the battle view was split into modules.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(root, 'tests/e2e/challenger_stress_test.js')], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
