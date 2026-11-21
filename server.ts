import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { loadEnvConfig } from './server/config';
import { EmulatorEngine } from './server/engine';
import { createApiRouter } from './server/routes';
import { FileStateStore } from './server/storage';
import { attachWebSocketServer } from './server/ws';

async function startServer() {
  const env = loadEnvConfig();
  const store = new FileStateStore(env.dataFile, env.mediaDir);
  const engine = new EmulatorEngine(store, env);

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // CORS middleware for web clients and cross-origin access
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-WA-SIM-UI');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Mount REST & Cloud-API compatible routes
  app.use(createApiRouter(engine, store, env));

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer, engine);

  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, 'dist'),
    path.resolve(__dirname, '../dist'),
    path.resolve(process.cwd(), 'whatsapp', 'dist'),
  ];

  const distDir = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

  if (distDir) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(
      `[WA-Sim] Running ${env.variant} emulator on http://localhost:${env.port} (WS: ws://localhost:${env.port}/ws)`
    );
  });
}

startServer().catch((err) => {
  console.error('[WA-Sim] Fatal startup error:', err);
  process.exit(1);
});
