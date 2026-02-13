export type FileIdentity = {
  fingerprint: string; // "sha256:9b74c9897bac770ffc029102a200c5de"
  fileName: string; // "Personal Vault.kdbx"
  fileSize: number; // 183424
};

export const toStorageKey = ({ fingerprint, fileName, fileSize }: FileIdentity) => {
  return [fingerprint, fileName, fileSize.toString()].join(':');
};
