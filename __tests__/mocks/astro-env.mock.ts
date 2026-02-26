import { vitest } from 'vitest';
import { parse } from 'dotenv';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

const config = parse(await readFile(join(import.meta.dirname, '..', '..', '.env.example')));

vitest.mock('astro:env/server', () => {
  return config;
});

vitest.mock('astro:env/client', () => {
  return config;
});
