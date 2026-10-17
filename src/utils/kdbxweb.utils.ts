import * as kdbxweb from 'kdbxweb';
import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';

// https://www.npmjs.com/package/kdbxweb#kdbx4
kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
  if (version !== 0x13) {
    throw new Error(`Argon2 version ${version} is not supported by argon2-browser`);
  }

  const { hash } = await argon2.hash({
    hashLen: length,
    mem: memory,
    parallelism,
    pass: asUint8Array(password),
    salt: asUint8Array(salt),
    time: iterations,
    type,
  });

  return asArrayBuffer(hash);
});

export default kdbxweb;
