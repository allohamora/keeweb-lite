import { useLatest } from 'react-use';
import { useState } from 'react';

// at most one task runs and one waits for it, so calls made in the meantime share the waiting task.
// the waiting task starts with the latest `task` after the running one succeeds, and fails with its error otherwise.
export const useCoalesce = <Result>(task: () => Promise<Result>) => {
  const latestTask = useLatest(task);

  const [coalesced] = useState(() => {
    let running: Promise<Result> | undefined;
    let queued: Promise<Result> | undefined;

    const start = () => {
      const current = latestTask.current().finally(() => {
        if (running === current) {
          running = undefined;
        }
      });
      running = current;

      return current;
    };

    const startQueued = () => {
      queued = undefined;

      return start();
    };

    const rejectQueued = (error: unknown): never => {
      queued = undefined;

      throw error;
    };

    return () => {
      if (!running) {
        return start();
      }

      queued ??= running.then(startQueued, rejectQueued);

      return queued;
    };
  });

  return coalesced;
};
