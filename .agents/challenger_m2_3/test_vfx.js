import { rollDice, vfxManager } from '../../src/utils/vfx.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

const makeDummyEl = (id = 1) => ({
  id,
  style: { animation: '' },
  nodeType: 1
});

console.log('--- STARTING EMPIRICAL STRESS TEST FOR rollDice ---');

// Test 1: rollDice([validElement, null])
try {
  const el1 = makeDummyEl(1);
  let callbackCalled = false;
  const result = rollDice([el1, null], [], () => { callbackCalled = true; });
  assert(el1.style.animation === 'none', 'Valid element style.animation set to none');
  assert(result !== undefined, 'GSAP timeline returned');
  console.log('Test 1 Passed without exception');
} catch (e) {
  console.error('Test 1 Threw exception:', e);
  failed++;
}

// Test 2: rollDice([validElement, undefined, null, validElement2])
try {
  const el1 = makeDummyEl(1);
  const el2 = makeDummyEl(2);
  const result = rollDice([el1, undefined, null, el2]);
  assert(el1.style.animation === 'none', 'Element 1 style.animation set to none');
  assert(el2.style.animation === 'none', 'Element 2 style.animation set to none');
  assert(result !== undefined, 'GSAP timeline returned for multiple valid elements with gaps');
} catch (e) {
  console.error('Test 2 Threw exception:', e);
  failed++;
}

// Test 3: rollDice([])
try {
  let callbackCalled = false;
  const result = rollDice([], [], () => { callbackCalled = true; });
  assert(result === undefined, 'Empty array returns undefined');
  assert(callbackCalled === true, 'onComplete callback executed for empty array');
} catch (e) {
  console.error('Test 3 Threw exception:', e);
  failed++;
}

// Test 4: rollDice(null)
try {
  let callbackCalled = false;
  const result = rollDice(null, [], () => { callbackCalled = true; });
  assert(result === undefined, 'null input returns undefined');
  assert(callbackCalled === true, 'onComplete callback executed for null input');
} catch (e) {
  console.error('Test 4 Threw exception:', e);
  failed++;
}

// Test 5: rollDice(undefined)
try {
  let callbackCalled = false;
  const result = rollDice(undefined, [], () => { callbackCalled = true; });
  assert(result === undefined, 'undefined input returns undefined');
  assert(callbackCalled === true, 'onComplete callback executed for undefined input');
} catch (e) {
  console.error('Test 5 Threw exception:', e);
  failed++;
}

// Test 6: rollDice([null, undefined, false, 0, ''])
try {
  let callbackCalled = false;
  const result = rollDice([null, undefined, false, 0, ''], [], () => { callbackCalled = true; });
  assert(result === undefined, 'Falsy elements only input returns undefined');
  assert(callbackCalled === true, 'onComplete callback executed when all elements filtered out');
} catch (e) {
  console.error('Test 6 Threw exception:', e);
  failed++;
}

// Test 7: Sparse array [validElement, , null]
try {
  const el1 = makeDummyEl(1);
  const sparseArr = [el1, , null];
  const result = rollDice(sparseArr);
  assert(el1.style.animation === 'none', 'Sparse array valid element handled correctly');
  assert(result !== undefined, 'GSAP timeline returned for sparse array');
} catch (e) {
  console.error('Test 7 Threw exception:', e);
  failed++;
}

console.log(`\n--- SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
if (failed > 0) {
  process.exit(1);
}
