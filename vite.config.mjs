import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react({ include: /\.[jt]sx?$/ }), tailwindcss()],
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  server: {
    port: 3001,
    strictPort: false,
  },
});
