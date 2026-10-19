import * as z from 'zod/mini';

export const fileListSchema = (message: string) =>
  z.custom<FileList>((value) => typeof FileList === 'undefined' || value instanceof FileList, { message });
