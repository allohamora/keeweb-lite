import { z } from 'zod';
import { encryptedBytesSchema } from './record.schema';
import type { DatabaseProvider, ProviderImportPreparation } from './database-provider';

const sourceSchema = z.undefined();
const importInputSchema = z.object({ databaseFile: z.custom<FileList>() });

const recordSchema = z.object({
  id: z.string(),
  kdbx: z.object({ encryptedBytes: encryptedBytesSchema, name: z.string() }),
  key: z.object({ hash: z.string(), name: z.string() }).optional(),
  lastOpenedAt: z.string().optional(),
  sourceVersion: z.literal(1).optional(),
  type: z.literal('local'),
});

export type LocalFileRecord = z.infer<typeof recordSchema>;

export const localProvider = {
  id: 'local',
  label: 'Local',
  sourceVersion: 1,
  sourceSchema,
  recordSchema,
  capabilities: { kind: 'local', create: 'local' },
  prepareImport: (input: unknown): ProviderImportPreparation => {
    const parsedInput = importInputSchema.parse(input);
    const selectedFile = parsedInput.databaseFile[0];
    if (!selectedFile) throw new Error('No database file selected.');

    return {
      displayName: selectedFile.name,
      duplicateIdentity: selectedFile.name,
      import: async () => ({
        name: selectedFile.name,
        bytes: new Uint8Array(await selectedFile.arrayBuffer()),
      }),
    };
  },
  prepareCreate: (_input, databaseName) => ({ displayName: databaseName, duplicateIdentity: databaseName }),
  getRecordIdentity: (record) => (record.type === 'local' ? record.kdbx.name : null),
  getDuplicateMessage: (_purpose, databaseName) => `A record named "${databaseName}" already exists.`,
} satisfies DatabaseProvider;
