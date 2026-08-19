import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento o Vite serve a interface e repassa /api para o server.js,
// que continua sendo quem fala com o agente de IA. Em producao o proprio
// server.js serve o dist/ — um processo so, sem depender do Vite rodando.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5317,
    proxy: {
      '/api': {
        target: 'http://localhost:4317',
        // Sem a API de pe, o proxy do Vite responde uma pagina de ERRO EM HTML
        // com status 500 — e a interface, esperando JSON, so conseguia dizer
        // "resposta ilegivel do servidor". O erro real (o backend nao esta
        // rodando) ficava escondido atras da mensagem mais generica possivel.
        configure: (proxy) => {
          proxy.on('error', (_erro, _req, res) => {
            const resposta = res as unknown as {
              writableEnded?: boolean;
              writeHead?: (status: number, cabecalhos: Record<string, string>) => void;
              end?: (corpo: string) => void;
            };
            if (resposta.writableEnded || !resposta.writeHead || !resposta.end) return;
            resposta.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            resposta.end(
              JSON.stringify({
                ok: false,
                erro:
                  'A API do Mural nao esta respondendo na porta 4317. ' +
                  'Rode `node server.js` numa outra janela e tente de novo.',
              }),
            );
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
