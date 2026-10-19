export const isKdbxFileName = (name?: string) => name?.toLowerCase().endsWith('.kdbx') ?? false;

export const toKdbxFileName = (name: string) => (isKdbxFileName(name) ? name : `${name}.kdbx`);
