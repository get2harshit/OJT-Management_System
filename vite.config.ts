import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Pinned so the dev URL is stable and matches the backend's CORS
  // allowlist — Vite's default 5173 falls through to another local
  // project's dev server on this machine, silently shifting the port
  // (and breaking CORS) on every restart otherwise.
  server: {
    port: 5175,
    strictPort: true,
  },
});
