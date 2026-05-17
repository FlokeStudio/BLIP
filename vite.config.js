import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'renderer',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'renderer/index.html'),
        call: resolve(__dirname, 'renderer/call-window.html'),
        groupCall: resolve(__dirname, 'renderer/group-call-window.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
