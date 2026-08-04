import { parse } from 'dotenv';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const env = parse(readFileSync(join(import.meta.dirname, '..', '..', '.env.example'), 'utf8'));

export const PUBLIC_GOOGLE_CLIENT_ID = env.PUBLIC_GOOGLE_CLIENT_ID;
export const PUBLIC_GOOGLE_APP_ID = env.PUBLIC_GOOGLE_APP_ID;
