import { z } from 'zod';
import { encryptedBytesSchema } from './record.schema';
import type { DatabaseProvider, ProviderImportResult, ProviderRecord } from './database-provider';

const sourceSchema = z.undefined();
const importInputSchema = z.object({ databaseFile: z.custom<FileList>() });

const recordSchema = z.object({
  id: z.string(),
  kdbx: z.object({ encryptedBytes: encryptedBytesSchema, name: z.string() }),
  key: z.object({ hash: z.string(), name: z.string() }).optional(),
  lastOpenedAt: z.string().optional(),
  type: z.literal('local'),
});

export type LocalFileRecord = z.infer<typeof recordSchema>;

export const localProvider: DatabaseProvider = {
  id: 'local',
  label: 'Local',
  sourceVersion: 1,
  sourceSchema,
  recordSchema,
  capabilities: { remote: false, read: false, replace: 'none', create: 'local' },
  setupActions: {
    import: {
      label: 'Import',
      load: async () => {
        const { ImportLocalModal } = await import('@/components/unlock/import-local.modal');
        return { default: ImportLocalModal };
      },
    },
    create: {
      label: 'Create',
      load: async () => {
        const { CreateLocalModal } = await import('@/components/unlock/create-local.modal');
        return { default: CreateLocalModal };
      },
    },
  },
  importSource: async (input: unknown): Promise<ProviderImportResult> => {
    const parsedInput = importInputSchema.parse(input);
    const selectedFile = parsedInput.databaseFile[0];
    if (!selectedFile) throw new Error('No database file selected.');

    return {
      name: selectedFile.name,
      bytes: new Uint8Array(await selectedFile.arrayBuffer()),
    };
  },
  getImportIdentityFromInput: (input) => importInputSchema.parse(input).databaseFile[0]?.name ?? null,
  getImportNameFromInput: (input) => importInputSchema.parse(input).databaseFile[0]?.name ?? '',
  getRecordIdentity: (record) => (record.type === 'local' ? record.kdbx.name : null),
  getImportIdentity: (result) => result.name,
  getCreateIdentity: (_input, databaseName) => databaseName,
  getDuplicateMessage: (_purpose, databaseName) => `A record named "${databaseName}" already exists.`,
  createSession: async (_record?: ProviderRecord, _setupInput?: unknown) => null,
};
