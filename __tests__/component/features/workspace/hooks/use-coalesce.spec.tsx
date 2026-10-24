import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCoalesce } from '@/features/workspace/hooks/use-coalesce';

describe('use-coalesce', () => {
  describe('useCoalesce', () => {
    const renderCoalesce = (task: () => Promise<string>) =>
      renderHook(({ current }) => useCoalesce(current), { initialProps: { current: task } });

    it('starts the task at once when nothing is running', async () => {
      const task = vi.fn(async () => 'done');
      const { result } = renderCoalesce(task);

      const value = await result.current();

      expect(task).toHaveBeenCalledOnce();
      expect(value).toBe('done');
    });

    it('runs the task a second time after the first run and shares it with the third call', async () => {
      const first = Promise.withResolvers<string>();
      const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('second');
      const { result } = renderCoalesce(task);

      const firstCall = result.current();
      const secondCall = result.current();
      const thirdCall = result.current();

      expect(secondCall).toBe(thirdCall);
      expect(task).toHaveBeenCalledOnce();

      first.resolve('first');

      expect(await firstCall).toBe('first');
      expect(await secondCall).toBe('second');
      expect(task).toHaveBeenCalledTimes(2);
    });

    it('starts the waiting run with the latest task', async () => {
      const first = Promise.withResolvers<string>();
      const { result, rerender } = renderCoalesce(() => first.promise);
      const latestTask = vi.fn(async () => 'latest');

      const firstCall = result.current();
      const secondCall = result.current();
      rerender({ current: latestTask });
      first.resolve('first');

      expect(await firstCall).toBe('first');
      expect(await secondCall).toBe('latest');
    });

    it('fails the waiting calls with the error of the running one and lets a later call start again', async () => {
      const first = Promise.withResolvers<string>();
      const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('next');
      const { result } = renderCoalesce(task);

      const firstCall = result.current();
      const secondCall = result.current();
      const thirdCall = result.current();
      first.reject(new Error('first failed'));

      await expect(firstCall).rejects.toThrow('first failed');
      await expect(secondCall).rejects.toThrow('first failed');
      await expect(thirdCall).rejects.toThrow('first failed');
      expect(task).toHaveBeenCalledOnce();
      expect(await result.current()).toBe('next');
    });

    it('queues a new waiting run for calls made while the waiting run runs', async () => {
      const first = Promise.withResolvers<string>();
      const second = Promise.withResolvers<string>();
      const task = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockResolvedValue('third');
      const { result } = renderCoalesce(task);

      const firstCall = result.current();
      const secondCall = result.current();
      first.resolve('first');
      await firstCall;
      const thirdCall = result.current();

      expect(thirdCall).not.toBe(secondCall);
      expect(task).toHaveBeenCalledTimes(2);

      second.resolve('second');

      expect(await secondCall).toBe('second');
      expect(await thirdCall).toBe('third');
    });

    it('starts the next call at once after everything finished', async () => {
      const task = vi.fn().mockResolvedValueOnce('first').mockResolvedValue('next');
      const { result } = renderCoalesce(task);
      await result.current();

      const nextCall = result.current();

      expect(task).toHaveBeenCalledTimes(2);
      expect(await nextCall).toBe('next');
    });
  });
});
