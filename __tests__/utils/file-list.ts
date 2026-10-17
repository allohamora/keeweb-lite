export const createFileList = (...files: File[]): FileList => {
  const fileList = {
    ...files,
    item: (index: number) => files[index] ?? null,
    length: files.length,
    [Symbol.iterator]: () => files[Symbol.iterator](),
  };

  return fileList as unknown as FileList;
};
