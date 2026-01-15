import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    https: false, // Set to true for Web Bluetooth testing (requires cert)
    port: 5173,
  },
  optimizeDeps: {
    include: ['@noble/curves', '@noble/ciphers', '@noble/hashes'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
