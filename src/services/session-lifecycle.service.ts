import type { ProviderSession } from '@/providers/database-provider';

export type SessionCapture = {
  recordId: string;
  generation: number;
  sessionId: string;
};

export class SessionLifecycle {
  readonly sessionId = crypto.randomUUID();
  private readonly controller = new AbortController();
  private readonly cleanup = new Set<() => void>();

  get signal() {
    return this.controller.signal;
  }

  capture(recordId: string, generation: number): SessionCapture {
    return { recordId, generation, sessionId: this.sessionId };
  }

  assertCurrent(capture: SessionCapture, recordId = capture.recordId, generation = capture.generation) {
    this.signal.throwIfAborted();
    if (capture.sessionId !== this.sessionId || capture.recordId !== recordId || capture.generation !== generation) {
      throw new DOMException('The database session is no longer current.', 'AbortError');
    }
  }

  ownProviderSession(session: ProviderSession) {
    let owned = true;
    const dispose = () => {
      if (!owned) return;
      owned = false;
      session.dispose();
      this.cleanup.delete(dispose);
    };

    if (this.signal.aborted) dispose();
    else this.cleanup.add(dispose);

    return dispose;
  }

  addCleanup(cleanup: () => void) {
    if (this.signal.aborted) cleanup();
    else this.cleanup.add(cleanup);
  }

  dispose() {
    if (this.signal.aborted) return;
    this.controller.abort();
    for (const cleanup of [...this.cleanup]) cleanup();
    this.cleanup.clear();
  }
}

export const createSessionLifecycle = (parentSignal?: AbortSignal) => {
  const lifecycle = new SessionLifecycle();
  if (parentSignal) {
    const abort = () => lifecycle.dispose();
    if (parentSignal.aborted) abort();
    else {
      parentSignal.addEventListener('abort', abort, { once: true });
      lifecycle.addCleanup(() => parentSignal.removeEventListener('abort', abort));
    }
  }
  return lifecycle;
};
