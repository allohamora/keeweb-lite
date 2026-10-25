import { cloneDatabase } from '@/services/database';
import { defineProvider } from '@/services/provider';

export const demoProvider = defineProvider({
  type: 'demo',
  storage: {
    load: ({ database }) => cloneDatabase(database),
    // demo records are never persisted, so there's nothing to write back
    update: async (record) => record,
  },
});
