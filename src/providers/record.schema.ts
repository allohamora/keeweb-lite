import { z } from 'zod';

export const encryptedBytesSchema = z.custom<Uint8Array>((value) => value instanceof Uint8Array);

export const synchronizationSchema = z.object({
  generation: z.number().int().nonnegative(),
  pending: z.boolean(),
  commonVersion: z
    .object({
      bytes: encryptedBytesSchema,
      revision: z.string().optional(),
    })
    .optional(),
  localEditState: z.unknown().optional(),
  bootstrapRecovery: z.object({ encryptedBytes: encryptedBytesSchema }).optional(),
  creationRecovery: z.object({ attemptedBytes: encryptedBytesSchema }).optional(),
});
