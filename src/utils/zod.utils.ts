import { z } from 'zod';

export const fileListSchema = (message: string) =>
  z.custom<FileList>((value) => typeof FileList === 'undefined' || value instanceof FileList, { message });
