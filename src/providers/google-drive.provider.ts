import { z } from 'zod';
import { createFile, getFile, updateFile } from '@/repositories/google-drive.repository';
import { encryptedBytesSchema, synchronizationSchema } from './record.schema';
import type { DatabaseProvider, ProviderImportResult, ProviderRecord } from './database-provider';

const sourceSchema = z.object({ id: z.string().min(1) });
const importInputSchema = z.object({ fileId: z.string().min(1), fileName: z.string().min(1) });

const recordSchema = z.object({
  id: z.string(),
  kdbx: z.object({ encryptedBytes: encryptedBytesSchema, name: z.string() }),
  key: z.object({ hash: z.string(), name: z.string() }).optional(),
  lastOpenedAt: z.string().optional(),
  source: sourceSchema,
  synchronization: synchronizationSchema.optional(),
  type: z.literal('google-drive'),
});

export type GoogleDriveFileRecord = z.infer<typeof recordSchema>;

export const googleDriveProvider: DatabaseProvider = {
  id: 'google-drive',
  label: 'Google Drive',
  sourceVersion: 1,
  sourceSchema,
  recordSchema,
  capabilities: { remote: true, read: true, replace: 'unconditional', create: 'unconditional' },
  setupActions: {
    import: {
      label: 'Import',
      load: async () => {
        const { ImportGoogleDriveModal } = await import('@/components/unlock/import-google-drive.modal');
        return { default: ImportGoogleDriveModal };
      },
    },
    create: {
      label: 'Create',
      load: async () => {
        const { CreateGoogleDriveModal } = await import('@/components/unlock/create-google-drive.modal');
        return { default: CreateGoogleDriveModal };
      },
    },
  },
  importSource: async (input: unknown): Promise<ProviderImportResult> => {
    const parsedInput = importInputSchema.parse(input);

    return {
      bytes: await getFile(parsedInput.fileId),
      name: parsedInput.fileName,
      source: { id: parsedInput.fileId },
    };
  },
  getImportIdentityFromInput: (input) => importInputSchema.parse(input).fileId,
  getImportNameFromInput: (input) => importInputSchema.parse(input).fileName,
  getRecordIdentity: (record) => {
    if (record.type !== 'google-drive') return null;

    return sourceSchema.parse(record.source).id;
  },
  getImportIdentity: ({ source }) => sourceSchema.parse(source).id,
  getCreateIdentity: () => null,
  getDuplicateMessage: () => 'A record for this file already exists.',
  getCreateFailureMessage: (databaseName) =>
    `"${databaseName}" was created on Google Drive, but couldn't be saved locally. Use "Import from Google Drive" to add it.`,
  createSession: async (record?: ProviderRecord, _setupInput?: unknown) => {
    const source = record ? sourceSchema.parse(record.source) : undefined;

    return {
      read: async (signal) => {
        if (!source) throw new Error('Google Drive source is required to read a database.');

        return { bytes: await getFile(source.id, signal) };
      },
      replace: async (bytes, _revision, signal) => {
        if (!source) throw new Error('Google Drive source is required to replace a database.');

        await updateFile(source.id, bytes as Uint8Array<ArrayBuffer>, signal);
      },
      create: async (name, bytes, signal) => {
        const file = await createFile(name, bytes as Uint8Array<ArrayBuffer>, signal);

        return { source: { id: file.id } };
      },
      dispose: () => undefined,
    };
  },
};
