import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'validation', test: /node_modules[\\/](zod|yaml)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.FAULTVIEW_FRONTEND_PORT ?? 5173),
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.FAULTVIEW_FRONTEND_PORT ?? 5173),
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
