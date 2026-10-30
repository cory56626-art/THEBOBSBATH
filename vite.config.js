import { defineConfig } from 'vite';
export default defineConfig({
  base: '/THEBOBSBATH/',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  worker: { format: 'es' },
});
