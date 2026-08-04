import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      // the vitest mocker doesn't intercept build-time import resolution consistently across
      // environments (e.g. happy-dom), so these virtual specifiers are aliased to a real stub
      // module instead of relying on vi.mock
      'astro:env/client': path.resolve(dirname, '__tests__/stubs/astro-env.stub.ts'),
      'astro:env/server': path.resolve(dirname, '__tests__/stubs/astro-env.stub.ts'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['__tests__/unit/**/*.spec.ts'],
          setupFiles: ['./__tests__/setup-unit-context.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'happy-dom',
          include: ['__tests__/component/**/*.spec.tsx'],
          setupFiles: ['./__tests__/setup-component-context.ts'],
        },
      },
    ],
  },
});
