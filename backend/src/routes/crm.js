/**
 * routes/crm.js
 * Pipeline comercial (CRM) — estágios dos orçamentos + notificações.
 *
 * Estágios: BUDGET_GENERATED → SEND_QUOTE → FOLLOW_UP → REVISION → WON → LOST
 *
 * GET  /api/crm/pipeline          → lista orçamentos agrupados por estágio
 * PATCH /api/crm/:id/stage        → move card para outro estágio
 * GET  /api/crm/notifications     → notificações do usuário logado
 * PATCH /api/crm/notifications/read-all → marca todas como lidas
 * PATCH /api/crm/notifications/:nid/read → marca uma como lida
 */

import { Router } from 'express';
import prisma from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

export const STAGES = [
  'BUDGET_GENERATED',
  'SEND_QUOTE',
  'FOLLOW_UP',
  'REVISION',
  'WON',
  'LOST',
];

// ─── GET /api/crm/pipeline ────────────────────────────────────────────────────
router.get('/pipeline', async (req, res, next) => {
  try {
    const where = req.user.role === 'COMMERCIAL' ? { createdBy: req.user.id } : {};

    const quotes = await prisma.quote.findMany({
      where: { ...where, status: { notIn: ['DRAFT'] } },
      select: {
        id: true, number: true, status: true,
        clientName: true, reference: true, productName: true,
        quantity: true, pricePerPiece: true, totalOrderValue: true,
        pipelineStage: true, pipelineUpdatedAt: true,
        urgent: true, createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { pipelineUpdatedAt: 'desc' },
    });

    // Agrupa por estágio — retorna arrays planas indexadas por chave de estágio
    const pipeline = {};
    STAGES.forEach(s => { pipeline[s] = []; });

    quotes.forEach(q => {
      const stage = STAGES.includes(q.pipelineStage) ? q.pipelineStage : 'BUDGET_GENERATED';
      pipeline[stage].push(q);
    });

    res.json({ pipeline });
  } catch (err) { next(err); }
});

// ─── PATCH /api/crm/:id/stage ─────────────────────────────────────────────────
router.patch('/:id/stage', async (req, res, next) => {
  try {
    const { stage } = req.body;
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ error: `Estágio inválido. Use: ${STAGES.join(', ')}` });
    }

    const quote = await prisma.quote.update({
      where: { id: parseInt(req.params.id) },
      data:  { pipelineStage: stage, pipelineUpdatedAt: new Date() },
      select: { id: true, number: true, pipelineStage: true, createdBy: true, clientName: true },
    });

    res.json({ ok: true, quote });
  } catch (err) { next(err); }
});

// ─── GET /api/crm/notifications ───────────────────────────────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where:   { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
    const unread = notifications.filter(n => !n.read).length;
    res.json({ notifications, unread });
  } catch (err) { next(err); }
});

// ─── PATCH /api/crm/notifications/read-all ───────────────────────────────────
router.patch('/notifications/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data:  { read: true },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── PATCH /api/crm/notifications/:nid/read ──────────────────────────────────
router.patch('/notifications/:nid/read', async (req, res, next) => {
  try {
    await prisma.notification.update({
      where: { id: parseInt(req.params.nid) },
      data:  { read: true },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
