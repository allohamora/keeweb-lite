import kdbxweb from '@/utils/kdbxweb.utils';

export const random = () => {
  // Request 4 random bytes because 4 bytes = 32 bits, which exactly matches one uint32 value.
  const randomBytes = kdbxweb.CryptoEngine.random(4);
  // Wrap the byte buffer with DataView so we can read those raw bytes as a 32-bit unsigned integer.
  const view = new DataView(randomBytes.buffer, randomBytes.byteOffset, randomBytes.byteLength);

  // Read uint32 starting at byte offset 0, then normalize to [0, 1) by dividing by 2^32.
  // 0x1_0000_0000 is hexadecimal for 4294967296 (2^32), the size of the uint32 value space.
  return view.getUint32(0) / 0x1_0000_0000;
};

export const randomInt = (from: number, to: number) => {
  const min = Math.ceil(Math.min(from, to));
  const max = Math.floor(Math.max(from, to));

  if (min > max) {
    throw new Error('from and to must define at least one integer');
  }

  return Math.floor(random() * (max - min + 1)) + min;
};

export const randomElement = <Element>(values: readonly Element[]) => {
  const index = randomInt(0, values.length - 1);
  const value = values[index];

  if (value === undefined) {
    throw new Error('value is not found');
  }

  return value;
};

export const shuffle = <Element>(values: readonly Element[]) => {
  return values
    .map((value) => ({ value, score: random() }))
    .toSorted((left, right) => left.score - right.score)
    .map(({ value }) => value);
};
