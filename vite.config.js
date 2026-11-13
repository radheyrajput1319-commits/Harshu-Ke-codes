
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    open: false,
    allowedHosts: ['.ngrok-free.dev']
  },
  build: {
    target: 'es2020'
  }
});
