import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * base is '/' because the site is served from the root of its custom domain,
 * https://mirc2026interactivemap.me/ (DEPLOY.md section 6). A wrong base here
 * silently breaks asset URLs and the chat corpus fetch.
 *
 * The /chat proxy exists only so `npm run dev` can talk to the deployed Worker:
 * worker/wrangler.toml's ALLOWED_ORIGINS does not include the Vite dev origin
 * (localhost:5173), so a direct fetch from the page would be blocked by CORS.
 * Proxying keeps the browser's Origin same-origin and needs no Worker change.
 */
export default defineConfig({
  base: '/',
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
