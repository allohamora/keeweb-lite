import './mocks';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { cleanup } from '@testing-library/react';
import { createMockServer } from './utils/mock-server.utils';
import '@testing-library/jest-dom/vitest';

Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
Object.defineProperty(window, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(window, 'TextDecoder', { configurable: true, value: TextDecoder });
Object.defineProperty(window, 'TextEncoder', { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: DOMParser });
Object.defineProperty(window, 'DOMParser', { configurable: true, value: DOMParser });
Object.defineProperty(globalThis, 'XMLSerializer', { configurable: true, value: XMLSerializer });
Object.defineProperty(window, 'XMLSerializer', { configurable: true, value: XMLSerializer });

export const mockServer = createMockServer();

beforeAll(() => {
  mockServer.start();
});

afterEach(() => {
  cleanup();

  // here is the solution used https://github.com/mswjs/msw/issues/946#issuecomment-1572768939
  expect(mockServer.onUnhandledRequest).not.toHaveBeenCalled();
  mockServer.onUnhandledRequest.mockClear();

  mockServer.clearHandlers();
});

afterAll(() => {
  window.dispatchEvent(new Event('unload'));
  mockServer.stop();
});
