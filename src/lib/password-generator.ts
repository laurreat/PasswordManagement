/**
 * LocalPass - Password generation
 *
 * All randomness comes from the platform CSPRNG (`crypto.getRandomValues`).
 * `Math.random` must never be used for credential material: it is a
 * non-cryptographic PRNG whose output is predictable from a small sample.
 *
 * Sampling uses rejection to avoid modulo bias, and the result is shuffled so
 * the guaranteed per-class characters do not land in a predictable position.
 */

export type CharacterClass = 'uppercase' | 'lowercase' | 'numbers' | 'symbols';

export type PasswordGeneratorOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  /** Removes characters that are easy to confuse when read or typed. */
  excludeAmbiguous?: boolean;
};

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const AMBIGUOUS_CHARACTERS = 'Il1O0o';

const CHARACTER_SETS: Record<CharacterClass, string> = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+~`|}{[]:;?><,./-=',
};

export const GENERATOR_CLASSES: CharacterClass[] = [
  'uppercase',
  'lowercase',
  'numbers',
  'symbols',
];

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Uniform random integer in [0, maxExclusive) using rejection sampling.
 * Rejecting out-of-range draws is what keeps the distribution flat when
 * maxExclusive does not divide 2^32.
 */
export function randomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('maxExclusive must be a positive safe integer');
  }
  if (maxExclusive > UINT32_RANGE) {
    throw new RangeError('maxExclusive exceeds the 32-bit sampling range');
  }
  if (maxExclusive === 1) return 0;

  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);

  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value < limit) return value % maxExclusive;
  }
}

/** Fisher-Yates shuffle driven by the CSPRNG. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function filterAmbiguous(characters: string, excludeAmbiguous: boolean): string {
  if (!excludeAmbiguous) return characters;
  let result = '';
  for (const character of characters) {
    if (!AMBIGUOUS_CHARACTERS.includes(character)) result += character;
  }
  return result;
}

/** Enabled character sets, in a stable order, after ambiguous filtering. */
export function getEnabledSets(options: PasswordGeneratorOptions): string[] {
  const sets: string[] = [];
  for (const characterClass of GENERATOR_CLASSES) {
    if (!options[characterClass]) continue;
    const set = filterAmbiguous(CHARACTER_SETS[characterClass], options.excludeAmbiguous ?? false);
    if (set.length > 0) sets.push(set);
  }
  return sets;
}

export function getPoolSize(options: PasswordGeneratorOptions): number {
  return getEnabledSets(options).reduce((total, set) => total + set.length, 0);
}

export function generatePassword(options: PasswordGeneratorOptions): string {
  const enabledSets = getEnabledSets(options);

  if (enabledSets.length === 0) {
    throw new RangeError('At least one character class must be enabled');
  }
  if (!Number.isInteger(options.length) || options.length < enabledSets.length) {
    throw new RangeError('Password length must cover every enabled character class');
  }
  if (options.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password length must not exceed ${MAX_PASSWORD_LENGTH}`);
  }

  const pool = enabledSets.join('');
  const characters = enabledSets.map((set) => set[randomInt(set.length)]);

  while (characters.length < options.length) {
    characters.push(pool[randomInt(pool.length)]);
  }

  return shuffle(characters).join('');
}
