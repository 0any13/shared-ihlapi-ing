import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Vite dev server (5173) forwards API + websocket traffic to the Node server (3000),
// so cookies/sessions work exactly like in production.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
