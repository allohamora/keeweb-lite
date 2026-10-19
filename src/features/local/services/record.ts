import { createRecord, getRecords } from '@/repositories/record';
import { createEmptyDatabase } from '@/services/database';
import { mutateRecords, toKey, validateNewDatabaseInput } from '@/services/record';
import { asUint8Array } from '@/utils/buffer';

const toRecordKdbx = async (databaseFile: FileList) => {
  const selectedDatabaseFile = databaseFile[0];
  if (!selectedDatabaseFile) {
    throw new Error('No database file selected.');
  }

  const encryptedBytes = asUint8Array(await selectedDatabaseFile.arrayBuffer());

  return {
    name: selectedDatabaseFile.name,
    encryptedBytes,
  };
};

export const importLocalRecord = async ({ databaseFile, keyFile }: { databaseFile: FileList; keyFile?: FileList }) => {
  return mutateRecords(async () => {
    const recordKdbx = await toRecordKdbx(databaseFile);
    const records = await getRecords();
    if (records.some((record) => record.type === 'local' && record.kdbx.name === recordKdbx.name)) {
      throw new Error(`A record named "${recordKdbx.name}" already exists.`);
    }

    const key = await toKey(keyFile);

    await createRecord({
      id: crypto.randomUUID(),
      kdbx: recordKdbx,
      key,
      type: 'local',
    });
  });
};

export const createLocalRecord = async ({
  databaseName,
  password,
  useKeyFile,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
}) => {
  return mutateRecords(async () => {
    const { name, kdbxFileName } = validateNewDatabaseInput(databaseName, password);

    const records = await getRecords();
    if (records.some((record) => record.type === 'local' && record.kdbx.name === kdbxFileName)) {
      throw new Error(`A record named "${kdbxFileName}" already exists.`);
    }

    const { encryptedBytes, generatedKey } = await createEmptyDatabase({ name, password, useKeyFile });

    await createRecord({
      id: crypto.randomUUID(),
      kdbx: { encryptedBytes, name: kdbxFileName },
      key: generatedKey?.key,
      type: 'local',
    });

    return { keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
  });
};
