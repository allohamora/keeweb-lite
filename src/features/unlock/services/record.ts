import { getRecords } from '@/repositories/record';
import { getProvider } from '@/services/provider-registry';

const sortRecordsByLastOpened = <RecordType extends { lastOpenedAt?: string }>(records: RecordType[]) => {
  return records
    .map((record) => ({
      record,
      lastOpenedAtMs: record.lastOpenedAt ? Date.parse(record.lastOpenedAt) : 0,
    }))
    .toSorted((left, right) => {
      return right.lastOpenedAtMs - left.lastOpenedAtMs;
    })
    .map(({ record }) => record);
};

export const getRecordsByLastOpened = async () => {
  const records = await getRecords();

  return sortRecordsByLastOpened(records);
};

export const getRecordItemsByLastOpened = async () => {
  const records = await getRecordsByLastOpened();

  return records.map((record) => ({ record, provider: getProvider(record) }));
};
