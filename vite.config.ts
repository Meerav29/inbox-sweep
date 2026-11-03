import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// INBOX_SWEEP_* wins; the legacy JEV_SWEEP_* names are still read when the new one is unset or empty.
const sweepVar = (name: string) => process.env[`INBOX_SWEEP_${name}`] || process.env[`JEV_SWEEP_${name}`];
const webPort = Number(sweepVar('WEB_PORT')) || 5173;
const apiPort = Number(sweepVar('PORT')) || 8787;

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    // The web app reaches the API same-origin through the proxy. Vite's default CORS allows any localhost origin and
    // answers preflights itself, which would let a page on another local port POST JSON to the API through here.
    cors: false,
    // changeOrigin sends the API's own Host (127.0.0.1:8787), which the server's Host check accepts.
    // 127.0.0.1, not localhost: the server listens on IPv4 loopback only.
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
});
