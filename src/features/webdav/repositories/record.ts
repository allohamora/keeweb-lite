import { createRecord, getRecords, type WebDavFileRecord } from '@/repositories/record';
import { mutateRecords } from '@/services/record';

export const insertWebDavRecord = (record: WebDavFileRecord) =>
  mutateRecords(async () => {
    const records = await getRecords();
    if (records.some((row) => row.type === 'webdav' && row.source.url === record.source.url)) {
      throw new Error('A record for this WebDAV file already exists.');
    }
    const created = await createRecord(record);
    if (created.type !== 'webdav') {
      throw new Error('WebDAV database not found.');
    }
    return created;
  });
