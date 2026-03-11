import { Router } from 'express';
import prisma from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/approvals/pending
router.get('/pending', requireRole('ADMIN', 'APPROVER'), async (req, res, next) => {
  try {
    const quotes = await prisma.quote.findMany({
      where:   { status: 'PENDING_APPROVAL' },
      orderBy: { updatedAt: 'asc' },
      include: {
        materials:        { where: { removed: false } },
        fabricationItems: true,
        embroideryJob:    true,
        user:             { select: { name: true } },
      },
    });
    res.json({ quotes });
  } catch (err) { next(err); }
});

// GET /api/approvals/history
router.get('/history', requireRole('ADMIN', 'APPROVER'), async (req, res, next) => {
  try {
    const approvals = await prisma.quoteApproval.findMany({
      orderBy: { createdAt: 'desc' },
      take:    50,
      include: {
        quote: { select: { number: true, clientName: true, reference: true, totalOrderValue: true } },
        user:  { select: { name: true } },
      },
    });
    res.json({ approvals });
  } catch (err) { next(err); }
});

// POST /api/approvals/:quoteId/decide
router.post('/:quoteId/decide', requireRole('ADMIN', 'APPROVER'), async (req, res, next) => {
  try {
    const quoteId  = parseInt(req.params.quoteId);
    const { decision, notes } = req.body;

    const validDecisions = ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ error: 'Decisão inválida' });
    }
    if (['REJECTED', 'REVISION_REQUESTED'].includes(decision) && !notes?.trim()) {
      return res.status(400).json({ error: 'Notas obrigatórias para rejeição ou revisão' });
    }

    const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (quote.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'Orçamento não está pendente de aprovação' });
    }

    const nextStatus = decision === 'APPROVED'
      ? 'APPROVED'
      : decision === 'REJECTED'
        ? 'REJECTED'
        : 'REVISION_REQUESTED';

    const [approval, updatedQuote] = await prisma.$transaction([
      prisma.quoteApproval.create({
        data: { quoteId, userId: req.user.id, decision, notes: notes || null },
      }),
      prisma.quote.update({
        where: { id: quoteId },
        data:  {
          status: nextStatus,
          ...(decision === 'APPROVED' && { pipelineStage: 'SEND_QUOTE', pipelineUpdatedAt: new Date() }),
        },
      }),
    ]);

    // Cria notificação para o criador do orçamento
    try {
      const quoteFull = await prisma.quote.findUnique({
        where: { id: parseInt(quoteId) },
        select: { createdBy: true, number: true, clientName: true },
      });
      if (quoteFull && quoteFull.createdBy !== req.user.id) {
        await prisma.notification.create({
          data: {
            userId:  quoteFull.createdBy,
            type:    decision === 'APPROVED' ? 'QUOTE_APPROVED' : decision === 'REJECTED' ? 'QUOTE_REJECTED' : 'QUOTE_REVISION',
            title:   decision === 'APPROVED' ? '✅ Orçamento aprovado!' : decision === 'REJECTED' ? '❌ Orçamento rejeitado' : '🔄 Revisão solicitada',
            message: `${quoteFull.number} — ${quoteFull.clientName}${notes ? ': ' + notes : ''}`,
            quoteId: quoteFull.id,
          },
        });
      }
    } catch { /* não bloqueia se falhar */ }

    res.json({ approval, quote: updatedQuote });
  } catch (err) { next(err); }
});

export default router;
