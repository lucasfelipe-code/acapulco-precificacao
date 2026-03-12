/**
 * routes/crm.js
 * Pipeline comercial (CRM): estagios dos orcamentos + notificacoes.
 */

import { Router } from 'express';
import prisma from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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

router.get('/pipeline', requireRole('COMMERCIAL', 'APPROVER', 'ADMIN'), async (req, res, next) => {
  try {
    const where = req.user.role === 'COMMERCIAL' ? { createdBy: req.user.id } : {};

    const quotes = await prisma.quote.findMany({
      where: { ...where, status: { notIn: ['DRAFT'] } },
      select: {
        id: true,
        number: true,
        status: true,
        clientName: true,
        reference: true,
        productName: true,
        quantity: true,
        pricePerPiece: true,
        totalOrderValue: true,
        pipelineStage: true,
        pipelineUpdatedAt: true,
        urgent: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { pipelineUpdatedAt: 'desc' },
    });

    const pipeline = {};
    STAGES.forEach((stage) => {
      pipeline[stage] = [];
    });

    quotes.forEach((quote) => {
      const stage = STAGES.includes(quote.pipelineStage) ? quote.pipelineStage : 'BUDGET_GENERATED';
      pipeline[stage].push(quote);
    });

    res.json({ pipeline });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stage', requireRole('COMMERCIAL', 'APPROVER', 'ADMIN'), async (req, res, next) => {
  try {
    const { stage } = req.body;
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ error: `Estagio invalido. Use: ${STAGES.join(', ')}` });
    }

    const quoteId = parseInt(req.params.id, 10);
    const currentQuote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, createdBy: true },
    });

    if (!currentQuote) {
      return res.status(404).json({ error: 'Orcamento nao encontrado' });
    }

    if (req.user.role === 'COMMERCIAL' && currentQuote.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const quote = await prisma.quote.update({
      where: { id: quoteId },
      data: { pipelineStage: stage, pipelineUpdatedAt: new Date() },
      select: { id: true, number: true, pipelineStage: true, createdBy: true, clientName: true },
    });

    res.json({ ok: true, quote });
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unread = notifications.filter((notification) => !notification.read).length;
    res.json({ notifications, unread, unreadCount: unread });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:nid/read', async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { id: parseInt(req.params.nid, 10), userId: req.user.id },
      data: { read: true },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Notificacao nao encontrada' });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
