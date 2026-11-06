import { describe, expect, it } from 'vitest';
import { getDeviceOs } from '@/features/unlock/services/device';

const stubUserAgent = (value: string) => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true });

  return {
    [Symbol.dispose]: () => {
      if (previous) {
        Object.defineProperty(navigator, 'userAgent', previous);
      } else {
        Reflect.deleteProperty(navigator, 'userAgent');
      }
    },
  };
};

describe('device', () => {
  describe('getDeviceOs', () => {
    it.each([
      ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'],
      ['iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'],
      ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'],
      ['macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'],
      ['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'],
      ['ChromeOS', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'],
      ['Linux', 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'],
      ['Unknown', 'curl/8.0'],
    ])('detects %s', (os, userAgent) => {
      using _userAgent = stubUserAgent(userAgent);

      expect(getDeviceOs()).toBe(os);
    });
  });
});
