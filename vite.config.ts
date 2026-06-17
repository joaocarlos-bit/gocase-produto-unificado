import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const standalone = process.env.BUILD_STANDALONE === '1';

export default defineConfig({
  plugins: standalone ? [react(), viteSingleFile()] : [react()],
  server: {
    port: 5173,
    open: true,
  },
});
