import type { Request, Response } from 'express';
import { getApp } from './app';

let appInstance: any = null;
let initError: any = null;

try {
  const { app } = getApp();
  appInstance = app;
} catch (err: any) {
  console.error('[Vercel Serverless Init Error]:', err);
  initError = {
    message: err?.message || String(err),
    stack: err?.stack,
  };
}

export default function handler(req: Request, res: Response) {
  if (initError) {
    return res.status(500).json({
      error: 'Vercel Lambda Initialization Failed',
      details: initError,
    });
  }

  // Restore rewritten URL if Vercel stripped subpath
  const originalUrl = (req.headers['x-forwarded-uri'] || req.headers['x-matched-path']) as string;
  if (originalUrl && (req.url === '/api' || req.url === '/')) {
    req.url = originalUrl;
  }

  return appInstance(req, res);
}
