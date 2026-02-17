import argon2 from 'argon2';
import { vi } from 'vitest';

const getArgon2Type = (type: number) => {
  switch (type) {
    case 0:
      return argon2.argon2d;
    case 1:
      return argon2.argon2i;
    case 2:
      return argon2.argon2id;
    default:
      throw new Error(`Unknown Argon2 type: ${type}`);
  }
};

const hash = async (options: {
  pass: Uint8Array;
  salt: Uint8Array;
  time: number;
  mem: number;
  hashLen: number;
  parallelism: number;
  type: number;
}) => {
  const hashBuffer = await argon2.hash(Buffer.from(options.pass), {
    type: getArgon2Type(options.type),
    memoryCost: options.mem,
    timeCost: options.time,
    parallelism: options.parallelism,
    hashLength: options.hashLen,
    salt: Buffer.from(options.salt),
    version: 0x13, // Argon2 version 1.3
    raw: true,
  });

  return {
    hash: new Uint8Array(hashBuffer),
  };
};

// Mock the argon2-browser module
vi.mock('argon2-browser/dist/argon2-bundled.min.js', () => ({
  default: { hash },
  hash,
}));
