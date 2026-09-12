import kdbx from '@/lib/kdbx.lib';
import type { FileRecord, PersistedFileRecord } from '@/repositories/record.repository';

export const createTestDatabase = async () => {
  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('component-test-password'));
  await credentials.ready;

  return kdbx.Kdbx.create(credentials, 'Component Test DB');
};

export const createTestEntry = (database: kdbx.Kdbx) => {
  const group = database.getDefaultGroup();
  const entry = database.createEntry(group);

  entry.fields.set('Title', 'Test Entry');
  entry.fields.set('UserName', 'test-user');
  entry.fields.set('Password', kdbx.ProtectedValue.fromString('test-password'));
  entry.fields.set('URL', '');
  entry.fields.set('Notes', '');

  return entry;
};

export const createTestRecord = (): PersistedFileRecord => ({
  id: 'test-record-id',
  kdbx: {
    encryptedBytes: new Uint8Array(),
    name: 'test.kdbx',
  },
  type: 'local',
});

// narrows a FileRecord union result down to the persisted shape, for tests that only ever deal with local/google-drive records
export const expectPersisted = (record: FileRecord): PersistedFileRecord => {
  if (record.type === 'demo') {
    throw new Error('expected a persisted record, got a demo record');
  }

  return record;
};
