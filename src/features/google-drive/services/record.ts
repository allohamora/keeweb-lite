import { createFile, getHead, getRevisionFile } from '@/features/google-drive/repositories/google-drive';
import { createRecord, getRecords } from '@/repositories/record';
import { createEmptyDatabase } from '@/services/database';
import { mutateRecords, toKey, validateNewDatabaseInput } from '@/services/record';

export const importGoogleDriveRecord = async ({
  fileId,
  fileName,
  keyFile,
}: {
  fileId: string;
  fileName: string;
  keyFile?: FileList;
}) => {
  return mutateRecords(async () => {
    const records = await getRecords();
    if (records.some((record) => record.type === 'google-drive' && record.source.id === fileId)) {
      throw new Error('A record for this file already exists.');
    }

    const { headRevisionId } = await getHead(fileId);
    const encryptedBytes = await getRevisionFile(fileId, headRevisionId);
    const key = await toKey(keyFile);

    await createRecord({
      id: crypto.randomUUID(),
      kdbx: { encryptedBytes, name: fileName },
      key,
      source: { id: fileId, rev: headRevisionId },
      type: 'google-drive',
    });
  });
};

export const createGoogleDriveRecord = async ({
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

    const { encryptedBytes, generatedKey } = await createEmptyDatabase({ name, password, useKeyFile });

    const driveFile = await createFile(kdbxFileName, encryptedBytes);

    try {
      await createRecord({
        id: crypto.randomUUID(),
        kdbx: { encryptedBytes, name: kdbxFileName },
        key: generatedKey?.key,
        source: { id: driveFile.id, rev: driveFile.headRevisionId },
        type: 'google-drive',
      });
    } catch (cause) {
      throw new Error(
        `"${kdbxFileName}" was created on Google Drive, but couldn't be saved locally. Import it from Google Drive to add it.`,
        { cause },
      );
    }

    return { keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
  });
};
