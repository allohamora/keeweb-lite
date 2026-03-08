// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  env: {
    schema: {
      PUBLIC_GOOGLE_CLIENT_ID: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_GOOGLE_APP_ID: envField.string({ context: 'client', access: 'public' }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react()],
});
