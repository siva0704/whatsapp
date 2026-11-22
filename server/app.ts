import express from 'express';
import { loadEnvConfig } from './config';
import { EmulatorEngine } from './engine';
import { createApiRouter } from './routes';
import { FileStateStore } from './storage';

let cachedApp: express.Express | null = null;
let cachedEngine: EmulatorEngine | null = null;

export function getApp() {
  if (cachedApp) return { app: cachedApp, engine: cachedEngine! };

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

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vehicledesk-whatsapp-emulator', variant: env.variant });
  });

  // Mount REST & Cloud-API compatible routes
  app.use(createApiRouter(engine, store, env));

  cachedApp = app;
  cachedEngine = engine;

  return { app, engine };
}
