import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
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

  // Mount REST & Cloud-API compatible routes
  app.use(createApiRouter(engine, store, env));

  const httpServer = http.createServer(app);
  attachWebSocketServer(httpServer, engine);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
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
