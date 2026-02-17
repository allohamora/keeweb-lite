import { create } from 'zustand';
import { combine } from 'zustand/middleware';
import type { Kdbx } from '@/services/kdbx.service';

type UnlockSession = {
  database: Kdbx;
  recordId: string;
  recordName: string;
  recordType: 'google-drive' | 'local';
  unlockedAt: string;
};

export const useSessionStore = create(
  combine({ session: null as UnlockSession | null }, (set) => ({
    clearSession: () => {
      set({ session: null });
    },
    setSession: ({ session }: { session: UnlockSession }) => {
      set({ session });
    },
  })),
);
