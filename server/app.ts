import express from 'express';
import { loadEnvConfig } from './config';
import { EmulatorEngine } from './engine';
import { createApiRouter } from './routes';
import { FileStateStore } from './storage';

let cachedApp: express.Express | null = null;
let cachedEngine: EmulatorEngine | null = null;

export function getApp() {
  if (cachedApp && cachedEngine) return { app: cachedApp, engine: cachedEngine };

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

  // URL normalization middleware for Vercel Serverless Function rewrites
  app.use((req, _res, next) => {
    const fwd = (req.headers['x-forwarded-uri'] || req.headers['x-matched-path']) as string;
    if (fwd && (req.url === '/api' || req.url === '/')) {
      req.url = fwd;
    }
    if (!req.url.startsWith('/api/')) {
      if (
        req.url === '/state' ||
        req.url.startsWith('/state?') ||
        req.url === '/config' ||
        req.url.startsWith('/config?') ||
        req.url === '/reset' ||
        req.url.startsWith('/reset?') ||
        req.url === '/chats' ||
        req.url.startsWith('/chats/') ||
        req.url === '/messages' ||
        req.url.startsWith('/messages/') ||
        req.url === '/contacts' ||
        req.url.startsWith('/contacts/') ||
        req.url === '/phone-numbers' ||
        req.url.startsWith('/phone-numbers/') ||
        req.url === '/templates' ||
        req.url.startsWith('/templates/')
      ) {
        req.url = '/api' + req.url;
      }
    }
    next();
  });

  // Health check endpoint
  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({ status: 'ok', service: 'vehicledesk-whatsapp-emulator', variant: env.variant });
  });

  // Mount REST & Cloud-API compatible routes
  app.use(createApiRouter(engine, store, env));

  // Express global error handler to prevent blank 500s
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Express Global Error]:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err?.message || String(err),
      stack: err?.stack,
    });
  });

  cachedApp = app;
  cachedEngine = engine;

  return { app, engine };
}
