export type FileIdentity = {
  fingerprint: string;
  fileName: string;
  fileSize: number;
};

export const toStorageKey = ({ fingerprint, fileName, fileSize }: FileIdentity) => {
  return [fingerprint, fileName, fileSize.toString()].join(':');
};
