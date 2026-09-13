import type kdbx from '@/lib/kdbx.lib';

// same soft pastel family as the demo database's own entry colors (#FFFF80, #FF8080)
export const STANDARD_COLORS: { name: string; hex: string }[] = [
  { name: 'Yellow', hex: '#FFFF80' },
  { name: 'Green', hex: '#80FF80' },
  { name: 'Red', hex: '#FF8080' },
  { name: 'Orange', hex: '#FFC080' },
  { name: 'Blue', hex: '#8080FF' },
  { name: 'Violet', hex: '#FF80FF' },
];

// kdbxweb can parse an empty <BackgroundColor/> element as '' rather than leaving it undefined,
// so an empty string is treated the same as "no color" here
export const getEntryColor = (entry: kdbx.KdbxEntry): string | null => entry.bgColor || null;
