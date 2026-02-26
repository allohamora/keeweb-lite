import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';
import { vi } from 'vitest';

export const createMockServer = () => {
  const server = setupServer();
  const onUnhandledRequest = vi.fn();

  return {
    onUnhandledRequest,
    start: () => {
      server.listen({
        onUnhandledRequest(request, print) {
          console.error(`[MSW] Request not in whitelist: ${request.method} ${request.url}`);

          onUnhandledRequest();

          print.error();
        },
      });
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
