import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import analyzePhoneticsHandler from './api/analyze-phonetics.ts';
import phoneticGuideHandler from './api/phonetic-guide.ts';
import frenchTtsHandler from './api/french-tts.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

// Safe body parser: skip if body was already parsed by serverless runtime
app.use((req, res, next) => {
  if (req.body !== undefined && typeof req.body === 'object') {
    return next();
  }
  return express.json({ limit: '50mb' })(req, res, next);
});

// API Routes
app.post(['/api/analyze-phonetics', '/analyze-phonetics'], analyzePhoneticsHandler);
app.post(['/api/phonetic-guide', '/phonetic-guide'], phoneticGuideHandler);
app.post(['/api/french-tts', '/french-tts'], frenchTtsHandler);

// Setup Vite dev server or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
