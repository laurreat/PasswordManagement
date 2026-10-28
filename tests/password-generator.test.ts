import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AMBIGUOUS_CHARACTERS,
  generatePassword,
  getEnabledSets,
  getPoolSize,
  MIN_PASSWORD_LENGTH,
  randomInt,
  shuffle,
  type PasswordGeneratorOptions,
} from '../src/lib/password-generator.ts';

const ALL_CLASSES: PasswordGeneratorOptions = {
  length: 32,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

test('generates a password with the requested length', () => {
  for (const length of [12, 16, 64, 128]) {
    assert.equal(generatePassword({ ...ALL_CLASSES, length }).length, length);
  }
});

test('includes at least one character from every enabled class', () => {
  for (let run = 0; run < 250; run += 1) {
    const password = generatePassword(ALL_CLASSES);
    assert.match(password, /[A-Z]/, 'missing uppercase');
    assert.match(password, /[a-z]/, 'missing lowercase');
    assert.match(password, /[0-9]/, 'missing number');
    assert.match(password, /[^A-Za-z0-9]/, 'missing symbol');
  }
});

test('only emits characters from enabled classes', () => {
  const password = generatePassword({
    length: 40,
    uppercase: false,
    lowercase: true,
    numbers: false,
    symbols: false,
  });
  assert.match(password, /^[a-z]+$/);
});

test('never emits ambiguous characters when excluded', () => {
  for (let run = 0; run < 100; run += 1) {
    const password = generatePassword({ ...ALL_CLASSES, excludeAmbiguous: true });
    for (const character of password) {
      assert.ok(!AMBIGUOUS_CHARACTERS.includes(character), `ambiguous character: ${character}`);
    }
  }
});

test('rejects an empty character selection', () => {
  assert.throws(
    () =>
      generatePassword({
        length: 16,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
      }),
    /At least one character class/
  );
});

test('rejects a length shorter than the number of enabled classes', () => {
  assert.throws(() => generatePassword({ ...ALL_CLASSES, length: 3 }), /must cover/);
});

test('rejects a length above the maximum', () => {
  assert.throws(() => generatePassword({ ...ALL_CLASSES, length: 129 }), /must not exceed/);
});

test('respects the documented minimum length', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 12);
});

test('randomInt stays in range and rejects invalid bounds', () => {
  for (let run = 0; run < 2000; run += 1) {
    const value = randomInt(10);
    assert.ok(value >= 0 && value < 10);
  }
  assert.throws(() => randomInt(0), /positive safe integer/);
  assert.throws(() => randomInt(-1), /positive safe integer/);
  assert.throws(() => randomInt(1.5), /positive safe integer/);
});

test('shuffle keeps every element', () => {
  const source = Array.from({ length: 50 }, (_, index) => index);
  const shuffled = shuffle(source);
  assert.equal(shuffled.length, source.length);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), source);
});

test('produces distinct passwords across calls', () => {
  const seen = new Set<string>();
  for (let run = 0; run < 200; run += 1) seen.add(generatePassword(ALL_CLASSES));
  assert.equal(seen.size, 200);
});

test('pool size accounts for enabled classes only', () => {
  assert.equal(
    getPoolSize({ length: 16, uppercase: true, lowercase: false, numbers: false, symbols: false }),
    26
  );
  assert.equal(
    getEnabledSets({ length: 16, uppercase: true, lowercase: true, numbers: false, symbols: false }).length,
    2
  );
});
