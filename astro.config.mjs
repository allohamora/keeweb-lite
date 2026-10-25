// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://keeweb-lite.vercel.app',
  env: {
    schema: {
      PUBLIC_GOOGLE_CLIENT_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_GOOGLE_APP_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({ context: 'client', access: 'public', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react()],
});
