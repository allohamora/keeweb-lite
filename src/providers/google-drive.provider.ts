import { z } from 'zod';
import { createFile, getFile, updateFile } from '@/repositories/google-drive.repository';
import { googleDriveEnabled } from './google-drive.config';
import { encryptedBytesSchema, synchronizationSchema } from './record.schema';
import type {
  DatabaseProvider,
  ProviderImportPreparation,
  ProviderSession,
  RemoteProviderRecord,
} from './database-provider';

const sourceSchema = z.object({ id: z.string().min(1) });
const importInputSchema = z.object({ fileId: z.string().min(1), fileName: z.string().min(1) });

const recordSchema = z.object({
  id: z.string(),
  kdbx: z.object({ encryptedBytes: encryptedBytesSchema, name: z.string() }),
  key: z.object({ hash: z.string(), name: z.string() }).optional(),
  lastOpenedAt: z.string().optional(),
  sourceVersion: z.literal(1).optional(),
  source: sourceSchema,
  synchronization: synchronizationSchema.optional(),
  type: z.literal('google-drive'),
});

export type GoogleDriveFileRecord = z.infer<typeof recordSchema>;

const createSetupSession = async (): Promise<ProviderSession> => ({
  read: { kind: 'none' },
  replace: { kind: 'none' },
  create: {
    kind: 'unconditional',
    create: async (name, bytes, signal) => {
      const file = await createFile(name, bytes as Uint8Array<ArrayBuffer>, signal);
      return { source: { id: file.id } };
    },
  },
  dispose: () => undefined,
});

export const googleDriveProvider = {
  id: 'google-drive',
  label: 'Google Drive',
  sourceVersion: 1,
  sourceSchema,
  recordSchema,
  capabilities: { kind: 'remote', read: true, replace: 'unconditional', create: 'unconditional' },
  isAvailable: () => googleDriveEnabled,
  prepareImport: (input: unknown): ProviderImportPreparation => {
    const parsedInput = importInputSchema.parse(input);
    return {
      displayName: parsedInput.fileName,
      duplicateIdentity: parsedInput.fileId,
      import: async () => ({
        bytes: await getFile(parsedInput.fileId),
        name: parsedInput.fileName,
        source: { id: parsedInput.fileId },
      }),
    };
  },
  prepareCreate: (_input, databaseName) => ({
    displayName: databaseName,
    duplicateIdentity: null,
    connectForSetup: createSetupSession,
  }),
  getRecordIdentity: (record) => {
    if (record.type !== 'google-drive') return null;

    return sourceSchema.parse(record.source).id;
  },
  getDuplicateMessage: () => 'A record for this file already exists.',
  getCreateFailureMessage: (databaseName) =>
    `"${databaseName}" was created on Google Drive, but couldn't be saved locally. Use "Import from Google Drive" to add it.`,
  connectForSetup: createSetupSession,
  unlockSavedConnection: async (record: RemoteProviderRecord) => {
    const source = sourceSchema.parse(record.source);

    return {
      read: { kind: 'remote', read: async (signal) => ({ bytes: await getFile(source.id, signal) }) },
      replace: {
        kind: 'unconditional',
        write: async (bytes, signal) => {
          await updateFile(source.id, bytes as Uint8Array<ArrayBuffer>, signal);
        },
      },
      create: { kind: 'none' },
      dispose: () => undefined,
    };
  },
} satisfies DatabaseProvider;
