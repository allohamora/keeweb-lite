import kdbx from '@/lib/kdbx.lib';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { createCredentialContainer } from '@/services/kdbx.service';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createCredentials = async () => {
  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('database-password'));
  await credentials.ready;
  return credentials;
};

describe('kdbx.service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the imported Argon2 KDF cost with a fresh salt for credential containers', async () => {
    let nextByte = 1;
    vi.spyOn(kdbx.CryptoEngine, 'random').mockImplementation((length) =>
      Uint8Array.from({ length }, () => nextByte++ & 0xff),
    );
    const credentials = await createCredentials();
    const source = kdbx.Kdbx.create(credentials, 'Source');
    source.setKdf(kdbx.Consts.KdfId.Argon2id);
    const sourceParameters = source.header.kdfParameters;
    if (!sourceParameters) throw new Error('Expected KDF parameters.');
    sourceParameters.set('P', kdbx.VarDictionary.ValueType.UInt32, 2);
    sourceParameters.set('I', kdbx.VarDictionary.ValueType.UInt64, new kdbx.Int64(5));
    sourceParameters.set('M', kdbx.VarDictionary.ValueType.UInt64, new kdbx.Int64(32768));
    await source.save();

    const encryptedBytes = await createCredentialContainer({
      name: 'Connection credentials',
      values: { Username: 'alice', Password: 'app-password' },
      credentials,
      protectionDatabase: source,
    });
    const container = await kdbx.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
    const parameters = container.header.kdfParameters;
    if (!parameters) throw new Error('Expected credential-container KDF parameters.');

    expect(kdbx.ByteUtils.bytesToBase64(parameters.get('$UUID') as ArrayBuffer)).toBe(kdbx.Consts.KdfId.Argon2id);
    expect(parameters.get('P')).toBe(2);
    expect((parameters.get('I') as kdbx.Int64).value).toBe(5);
    expect((parameters.get('M') as kdbx.Int64).value).toBe(32768);
    expect([...new Uint8Array(parameters.get('S') as ArrayBuffer)]).not.toEqual([
      ...new Uint8Array(sourceParameters.get('S') as ArrayBuffer),
    ]);
  });

  it('keeps KDBX3 AES transform rounds for credential containers', async () => {
    let nextByte = 1;
    vi.spyOn(kdbx.CryptoEngine, 'random').mockImplementation((length) =>
      Uint8Array.from({ length }, () => nextByte++ & 0xff),
    );
    const credentials = await createCredentials();
    const source = kdbx.Kdbx.create(credentials, 'Source');
    source.setVersion(3);
    source.header.keyEncryptionRounds = 12345;
    await source.save();

    const encryptedBytes = await createCredentialContainer({
      name: 'Connection credentials',
      values: { Username: 'alice', Password: 'app-password' },
      credentials,
      protectionDatabase: source,
    });
    const container = await kdbx.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);

    expect(container.versionMajor).toBe(3);
    expect(container.header.keyEncryptionRounds).toBe(12345);
    expect([...new Uint8Array(container.header.transformSeed!)]).not.toEqual([
      ...new Uint8Array(source.header.transformSeed!),
    ]);
  });
});
