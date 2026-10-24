export const asArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export const asUint8Array = (bytes: ArrayBuffer) => {
  return new Uint8Array(bytes);
};

export const toSha256Hex = async (bytes: Uint8Array<ArrayBuffer>) => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
