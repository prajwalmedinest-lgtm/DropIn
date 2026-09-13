import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          send: path.resolve(__dirname, 'send.html'),
        },
      },
    },
    server: {
      // Disable Vite HMR completely to avoid unwanted WebSocket connections
      hmr: false,
      watch: null,
    },
  };
});
