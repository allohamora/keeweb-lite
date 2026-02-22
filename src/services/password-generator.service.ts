import { randomElement, shuffle } from '@/lib/random.lib';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 64;

export const CharRanges = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  digits: '123456789',
  symbols: '!@#$%^&*_+-=,./?;:`"~\'\\',
};

type CharRangeKey = keyof typeof CharRanges;

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

  if (options.upper) ranges.push(CharRanges.upper);
  if (options.lower) ranges.push(CharRanges.lower);
  if (options.digits) ranges.push(CharRanges.digits);
  if (options.symbols) ranges.push(CharRanges.symbols);

  return ranges;
};

export const derivePasswordOptions = (password: string): PasswordOptions => {
  if (!password.trim()) return { ...DEFAULT_PASSWORD_OPTIONS };

  const options = {
    length: password.length,
    upper: false,
    lower: false,
    digits: false,
    symbols: false,
  };

  for (const char of password) {
    if (CharRanges.upper.includes(char)) options.upper = true;
    if (CharRanges.lower.includes(char)) options.lower = true;
    if (CharRanges.digits.includes(char)) options.digits = true;
    if (CharRanges.symbols.includes(char)) options.symbols = true;
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
  if (!Number.isInteger(options.length) || options.length < MIN_LENGTH || options.length > MAX_LENGTH) {
    throw new Error(`Password length must be between ${MIN_LENGTH} and ${MAX_LENGTH}`);
  }

  const ranges = buildRanges(options);
  if (ranges.length === 0) return '';

  const requiredChars = getRequiredChars(ranges);
  const remainingChars = getRemainingChars(ranges, options.length - requiredChars.length);

  return shuffle([...requiredChars, ...remainingChars]).join('');
};
