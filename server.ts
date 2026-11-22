import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { loadEnvConfig } from './server/config';
import { attachWebSocketServer } from './server/ws';
import { getApp } from './server/app';

async function startServer() {
  const env = loadEnvConfig();
  const { app, engine } = getApp();

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
    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexHtmlPath = [
          path.resolve(process.cwd(), 'index.html'),
          path.resolve(__dirname, 'index.html'),
          path.resolve(__dirname, '../index.html'),
          path.resolve(process.cwd(), 'whatsapp', 'index.html'),
        ].find((p) => fs.existsSync(p));

        if (indexHtmlPath) {
          let html = fs.readFileSync(indexHtmlPath, 'utf-8');
          html = await vite.transformIndexHtml(url, html);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } else {
          next();
        }
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
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
