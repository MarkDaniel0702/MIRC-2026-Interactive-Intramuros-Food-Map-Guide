import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * base MUST match the GitHub Pages project sub-path -- the Worker's
 * ALLOWED_ORIGINS / CORPUS_URL (worker/wrangler.toml) are pinned to
 * https://markdaniel0702.github.io/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/,
 * so a wrong base here silently breaks asset URLs and the chat corpus fetch.
 *
 * The /chat proxy exists only so `npm run dev` can talk to the deployed Worker:
 * worker/wrangler.toml's ALLOWED_ORIGINS does not include the Vite dev origin
 * (localhost:5173), so a direct fetch from the page would be blocked by CORS.
 * Proxying keeps the browser's Origin same-origin and needs no Worker change.
 */
export default defineConfig({
  base: '/MIRC-2026-Interactive-Intramuros-Food-Map-Guide/',
  plugins: [react()],
  server: {
    proxy: {
      '/chat': {
        target: 'https://mirc-2026-chat.plm-mirc2026.workers.dev',
        changeOrigin: true
      }
    }
  }
});
