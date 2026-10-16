import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';
import { vi } from 'vitest';

export const createMockServer = () => {
  const server = setupServer();
  const onUnhandledRequest = vi.fn();

  server.events.on('request:unhandled', ({ request }) => {
    console.error(`[MSW] Request not in whitelist: ${request.method} ${request.url}`);

    onUnhandledRequest();
  });

  return {
    onUnhandledRequest,
    start: () => {
      server.listen({ onUnhandledFrame: 'error' });
    },
    addHandlers: (...handlers: RequestHandler[]) => {
      server.use(...handlers);
    },
    clearHandlers: () => {
      server.resetHandlers();
    },
    stop: () => {
      server.close();
    },
  };
};

export type MockServer = ReturnType<typeof createMockServer>;
