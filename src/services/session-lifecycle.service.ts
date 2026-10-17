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
  private readonly providerSessionCleanup = new Map<ProviderSession, { dispose: () => void; release: () => void }>();
  private disposed = false;

  get signal() {
    return this.controller.signal;
  }

  get isDisposed() {
    return this.disposed;
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
    const existing = this.providerSessionCleanup.get(session);
    if (existing) return existing.dispose;

    let owned = true;
    let dispose = () => {};
    const release = () => {
      if (!owned) return;
      owned = false;
      this.cleanup.delete(dispose);
      this.providerSessionCleanup.delete(session);
    };
    dispose = () => {
      if (!owned) return;
      release();
      session.dispose();
    };

    if (this.signal.aborted) {
      owned = false;
      session.dispose();
    } else {
      this.cleanup.add(dispose);
      this.providerSessionCleanup.set(session, { dispose, release });
    }

    return dispose;
  }

  detachProviderSession(session: ProviderSession) {
    this.providerSessionCleanup.get(session)?.release();
    return session;
  }

  addCleanup(cleanup: () => void) {
    if (this.signal.aborted) cleanup();
    else this.cleanup.add(cleanup);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortOperations();
    for (const cleanup of [...this.cleanup]) cleanup();
    this.cleanup.clear();
  }

  abortOperations() {
    if (!this.signal.aborted) this.controller.abort();
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
