import { vi } from 'vitest';
import { invalid } from '@tests/utils/invalid';

export const createServiceMock = <T extends object>(overrides?: Partial<T>): T => {
  const cache = new Map<string | symbol, ReturnType<typeof vi.fn>>();
  return new Proxy(invalid<T>({}), {
    get(target, prop) {
      if (prop === 'then') return undefined;

      if (prop in target) {
        return Reflect.get(target, prop);
      }

      if (overrides && prop in overrides) {
        return Reflect.get(overrides, prop);
      }

      const cached = cache.get(prop);
      if (cached) return cached;

      const mock = vi.fn().mockImplementation(() => createServiceMock());
      cache.set(prop, mock);

      return mock;
    },
  });
};
