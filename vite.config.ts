import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // @100mslive/react-sdk reads process.env.REACT_SDK_VERSION at render time,
  // and `process` does not exist in a browser — so HMSRoomProvider threw on
  // mount and, since it wraps the app, took the whole page down to a blank
  // screen before login could even render.
  //
  // Replacing the whole `process.env` object rather than that one key on
  // purpose: any browser-bound dependency reading any env var should get
  // undefined, not a ReferenceError. Nothing in src/ reads process.env — this
  // app's own config comes from import.meta.env — so this only ever applies to
  // dependencies.
  define: {
    'process.env': '{}',
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
