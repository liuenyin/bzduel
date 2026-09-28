// ============================================================
// 校园战力党 — 服务端入口
// ============================================================
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getStats } from './statsManager.js';
import { registerGameServer } from './duel/service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

const app = express();
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/api/stats', (req, res) => res.json(getStats()));
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' }, pingTimeout: 30000, pingInterval: 10000 });

if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(join(__dirname, '..', 'dist')));
  app.get('*', (req, res) => res.sendFile(join(__dirname, '..', 'dist', 'index.html')));
}

registerGameServer(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => console.log(`🎲 校园战力党 → http://localhost:${PORT}`));
