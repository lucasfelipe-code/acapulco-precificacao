import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';

import authRoutes       from './routes/auth.js';
import productRoutes    from './routes/products.js';
import quoteRoutes      from './routes/quotes.js';
import costRoutes       from './routes/costs.js';
import embroideryRoutes from './routes/embroidery.js';
import approvalRoutes   from './routes/approvals.js';
import clientRoutes     from './routes/clients.js';
import materialsRoutes  from './routes/materials.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/quotes',     quoteRoutes);
app.use('/api/costs',      costRoutes);
app.use('/api/embroidery', embroideryRoutes);
app.use('/api/approvals',  approvalRoutes);
app.use('/api/clients',    clientRoutes);
app.use('/api/materials',  materialsRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[ERROR] ${status}:`, err.message);
  res.status(status).json({
    error: err.message || 'Erro interno do servidor',
    code:  err.code    || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`[server] Acapulco API rodando na porta ${PORT} — ${process.env.NODE_ENV || 'development'}`);
});

export default app;
