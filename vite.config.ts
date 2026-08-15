import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Pinned so the dev URL is stable and matches the backend's CORS
  // allowlist. strictPort is the important half: without it Vite answers a
  // busy port by quietly taking the next free one, and the dev server then
  // comes up on an origin the API does not allow — which shows up only as a
  // CORS error naming neither the port nor the cause. Failing to start is
  // the better answer, because it says which port is taken.
  server: {
    port: 5173,
    strictPort: true,
  },
});
