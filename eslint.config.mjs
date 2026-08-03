// @ts-check
import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import beautifulSort from 'eslint-plugin-beautiful-sort';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginAstro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { defineConfig } from 'eslint/config';
import { join } from 'node:path';

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  // TODO: re-add eslint-plugin-react and eslint-plugin-jsx-a11y once (if) they support eslint 10
  reactHooks.configs.flat.recommended,
  eslintPluginBetterTailwindcss.configs.recommended,
  eslintPluginPrettierRecommended,
  { ignores: ['node_modules', 'dist', '.astro'] },
  {
    files: ['**/*.{ts,tsx,astro}'],
    languageOptions: { globals: { ...globals.browser }, parserOptions: { project: true } },
    plugins: { 'beautiful-sort': beautifulSort },
    settings: {
      'better-tailwindcss': {
        entryPoint: join(import.meta.dirname, 'src', 'styles', 'global.css'),
      },
    },
    rules: {
      'no-use-before-define': 'warn',
      'object-shorthand': 'warn',
      'no-async-promise-executor': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-deprecated': 'error',
      'react-hooks/set-state-in-effect': 'warn',

      'better-tailwindcss/no-unknown-classes': ['error', { ignore: ['^toaster$', '^cn-toast$', '^dark$'] }],
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',

      'beautiful-sort/import': [
        'error',
        { special: [], order: ['special', 'namespace', 'default', 'defaultObj', 'obj', 'none'] },
      ],
    },
  },
  { files: ['**/*.astro'], rules: { '@typescript-eslint/no-misused-promises': 'off' } },
);
