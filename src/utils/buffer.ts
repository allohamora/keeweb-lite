export const asArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export const asUint8Array = (bytes: ArrayBuffer) => {
  return new Uint8Array(bytes);
};
