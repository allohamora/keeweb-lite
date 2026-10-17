import './mocks';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { auth } from '@/repositories/google-drive.repository';
import { clearRecords } from '@/repositories/record.repository';
import { createMockServer } from './utils/mock-server.utils';

export const mockServer = createMockServer();

beforeAll(() => {
  mockServer.start();
});

afterEach(async () => {
  await clearRecords();
  await auth.clearAccessToken();

  // here is the solution used https://github.com/mswjs/msw/issues/946#issuecomment-1572768939
  expect(mockServer.onUnhandledRequest).not.toHaveBeenCalled();
  mockServer.onUnhandledRequest.mockClear();

  mockServer.clearHandlers();
});

afterAll(() => {
  mockServer.stop();
});
