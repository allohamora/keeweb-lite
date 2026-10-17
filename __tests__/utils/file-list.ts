import { invalid } from '@tests/utils/invalid';

export const createFileList = (...files: File[]): FileList => {
  return invalid<FileList>({
    ...files,
    item: (index: number) => files[index] ?? null,
    length: files.length,
    [Symbol.iterator]: () => files[Symbol.iterator](),
  });
};
