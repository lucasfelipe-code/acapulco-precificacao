import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import quoteRoutes from './routes/quotes.js';
import costRoutes from './routes/costs.js';
import embroideryRoutes from './routes/embroidery.js';
import approvalRoutes from './routes/approvals.js';
import crmRoutes from './routes/crm.js';
import clientRoutes from './routes/clients.js';
import materialsRoutes from './routes/materials.js';
import usersRoutes from './routes/users.js';
import { initializeMaterialCatalogSync } from './services/materialCatalogSync.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (
      !origin ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      allowedOrigins.some((value) => origin === value || origin.endsWith('.vercel.app'))
    ) {
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/embroidery', embroideryRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/users', usersRoutes);

app.use((err, _req, res, _next) => {
  const status = err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE'
    ? 413
    : err.status || err.statusCode || 500;
  console.error(`[ERROR] ${status}:`, err.message);
  res.status(status).json({
    error: err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE'
      ? 'Imagem muito grande. Envie um arquivo menor.'
      : err.message || 'Erro interno do servidor',
    code: err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE'
      ? 'IMAGE_TOO_LARGE'
      : err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`[server] Acapulco API rodando na porta ${PORT} - ${process.env.NODE_ENV || 'development'}`);
  initializeMaterialCatalogSync();
});

export default app;
