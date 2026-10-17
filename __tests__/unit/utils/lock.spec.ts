import { describe, expect, it } from 'vitest';
import { Lock } from '@/utils/lock';

describe('lock', () => {
  describe('runInLock', () => {
    it('returns sync callback results', async () => {
      const lock = new Lock('lock.utils.sync');
      const result = await lock.runInLock(() => 'ok');

      expect(result).toBe('ok');
    });

    it('returns async callback results', async () => {
      const lock = new Lock('lock.utils.async');
      const result = await lock.runInLock(async () => {
        return Promise.resolve(42);
      });

      expect(result).toBe(42);
    });

    it('propagates callback errors', async () => {
      const lock = new Lock('lock.utils.error');
      const error = new Error('callback failed');

      await expect(
        lock.runInLock(async () => {
          throw error;
        }),
      ).rejects.toThrow('callback failed');
    });
  });
});
