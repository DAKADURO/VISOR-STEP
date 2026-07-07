import { defineConfig } from 'vite';

export default defineConfig({
  // Evitar que Vite externalice módulos de Node.js que necesita occt-import-js
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    // Excluir occt-import-js del pre-bundling de Vite para evitar problemas
    exclude: ['occt-import-js'],
  },
  server: {
    headers: {
      // Headers necesarios para SharedArrayBuffer (optimización futura)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    // Aumentar el límite de tamaño para evitar warnings confusos
    chunkSizeWarningLimit: 1000,
  },
  assetsInclude: ['**/*.wasm'],
});
