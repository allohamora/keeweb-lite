import { vi } from 'vitest';

type FakeTimerName = 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval' | 'Date';

// puts only the given timer/clock APIs under deterministic control, so other machinery (e.g. fake
// IndexedDB, msw) keeps its real timers. `using` disposal restores real timers automatically, even
// when the test fails. Defaults to setTimeout/clearTimeout; pass toFake to also control
// setInterval/clearInterval/Date.
export const useFakeTimers = (toFake: FakeTimerName[] = ['setTimeout', 'clearTimeout']) => {
  vi.useFakeTimers({ toFake });

  return {
    runAll: () => vi.runAllTimersAsync(),
    advanceBy: (ms: number) => vi.advanceTimersByTimeAsync(ms),
    setSystemTime: (date: Date) => vi.setSystemTime(date),
    [Symbol.dispose]: () => {
      vi.useRealTimers();
    },
  };
};
