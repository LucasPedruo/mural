import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento o Vite serve a interface e repassa /api para o server.js,
// que continua sendo quem fala com o Claude Code. Em producao o proprio
// server.js serve o dist/ — um processo so, sem depender do Vite rodando.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5317,
    proxy: {
      '/api': 'http://localhost:4317',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
