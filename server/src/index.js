import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import workspacesRouter from './routes/workspaces.js';
import ideasRouter from './routes/ideas.js';
import canvasRouter from './routes/canvas.js';

const app = express();
const port = Number(process.env.PORT || 5000);

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.disable('x-powered-by');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'collabcanvas-api',
  });
});

app.use('/api/workspaces', workspacesRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/canvas', canvasRouter);

app.use((error, _req, res, _next) => {
  if (error?.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  console.error('Unhandled API error:', error);
  return res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`CollabCanvas API listening on port ${port}`);
});
