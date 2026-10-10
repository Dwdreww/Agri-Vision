import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/workspace': {
          target: env.VITE_DEV_WORKSPACE_URL || 'http://127.0.0.1:5002',
          changeOrigin: true
        },
        '/api': {
          target: env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:5001',
          changeOrigin: true
        }
      }
    }
  };
});
