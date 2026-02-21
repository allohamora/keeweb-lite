import { describe, expect, it } from 'vitest';
import { Lock } from '@/utils/lock.utils';

describe('lock.utils.ts', () => {
  describe('runInLock', () => {
    it('returns sync callback results', async () => {
      const lock = new Lock('keeweb-lite.test.lock.sync');
      const result = await lock.runInLock(() => 'ok');

      expect(result).toBe('ok');
    });

    it('returns async callback results', async () => {
      const lock = new Lock('keeweb-lite.test.lock.async');
      const result = await lock.runInLock(async () => {
        return Promise.resolve(42);
      });

      expect(result).toBe(42);
    });

    it('propagates callback errors', async () => {
      const lock = new Lock('keeweb-lite.test.lock.error');
      const error = new Error('callback failed');

      await expect(
        lock.runInLock(async () => {
          throw error;
        }),
      ).rejects.toThrow('callback failed');
    });
  });
});
