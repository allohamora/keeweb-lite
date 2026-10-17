import { randomElement, shuffle } from '@/utils/random';

export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 64;

export const CHAR_RANGES = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*_+-=,./?;:`"~\'\\',
};

type CharRangeKey = keyof typeof CHAR_RANGES;

export type PasswordOptions = { length: number } & Record<CharRangeKey, boolean>;

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: false,
};

const buildRanges = (options: PasswordOptions) => {
  const ranges: string[] = [];

  if (options.upper) ranges.push(CHAR_RANGES.upper);
  if (options.lower) ranges.push(CHAR_RANGES.lower);
  if (options.digits) ranges.push(CHAR_RANGES.digits);
  if (options.symbols) ranges.push(CHAR_RANGES.symbols);

  return ranges;
};

export const derivePasswordOptions = (password: string): PasswordOptions => {
  if (!password.trim()) return { ...DEFAULT_PASSWORD_OPTIONS };

  const options = {
    length: Math.max(MIN_PASSWORD_LENGTH, Math.min(MAX_PASSWORD_LENGTH, password.length)),
    upper: false,
    lower: false,
    digits: false,
    symbols: false,
  };

  for (const char of password) {
    if (CHAR_RANGES.upper.includes(char)) options.upper = true;
    if (CHAR_RANGES.lower.includes(char)) options.lower = true;
    if (CHAR_RANGES.digits.includes(char)) options.digits = true;
    if (CHAR_RANGES.symbols.includes(char)) options.symbols = true;
  }

  return options;
};

const getRequiredChars = (ranges: readonly string[]) => {
  return ranges.map((range) => randomElement([...range]));
};

const getRemainingChars = (ranges: readonly string[], count: number) => {
  const allChars = [...ranges.join('')];

  return Array.from({ length: count }, () => randomElement(allChars));
};

export const generatePassword = (options: PasswordOptions = DEFAULT_PASSWORD_OPTIONS) => {
  if (
    !Number.isInteger(options.length) ||
    options.length < MIN_PASSWORD_LENGTH ||
    options.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error(`Password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}`);
  }

  const ranges = buildRanges(options);
  if (ranges.length === 0) return '';

  const requiredChars = getRequiredChars(ranges);
  const remainingChars = getRemainingChars(ranges, options.length - requiredChars.length);

  return shuffle([...requiredChars, ...remainingChars]).join('');
};
