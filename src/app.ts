import cors from 'cors';
import express from 'express';
import { env } from './config';
import { aiRouter } from './routes/aiRoutes';
import { contractRouter } from './routes/contractRoutes';

export const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/ai', aiRouter);
app.use('/api/contracts', contractRouter);
