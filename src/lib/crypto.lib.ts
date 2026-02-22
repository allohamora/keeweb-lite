import kdbx from './kdbx.lib';

export const random = () => {
  // Request 4 random bytes because 4 bytes = 32 bits, which exactly matches one uint32 value.
  const randomBytes = kdbx.CryptoEngine.random(4);
  // Wrap the byte buffer with DataView so we can read those raw bytes as a 32-bit unsigned integer.
  const view = new DataView(randomBytes.buffer, randomBytes.byteOffset, randomBytes.byteLength);

  // Read uint32 starting at byte offset 0, then normalize to [0, 1) by dividing by 2^32.
  // 0x1_0000_0000 is hexadecimal for 4294967296 (2^32), the size of the uint32 value space.
  return view.getUint32(0) / 0x1_0000_0000;
};
