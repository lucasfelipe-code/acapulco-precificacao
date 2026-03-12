/**
 * routes/quotes.js
 * CRUD de orçamentos + máquina de estado de status.
 */

import { Router } from 'express';
import prisma from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { calcularCustoTotal, summarizeEmbroidery, summarizePrint } from '../services/pricingEngine.js';

const router = Router();
router.use(requireAuth);

// ─── Gera número sequencial do orçamento ──────────────────────────────────────
async function nextQuoteNumber() {
  const last = await prisma.quote.findFirst({ orderBy: { id: 'desc' } });
  const seq  = (last?.id ?? 0) + 1;
  const year = new Date().getFullYear();
  return `ORC-${year}-${String(seq).padStart(4, '0')}`;
}

function parseJsonField(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function decorateQuote(quote) {
  if (!quote) return quote;
  const sizes = parseJsonField(quote.sizes, quote.sizes);
  const approvals = Array.isArray(quote.approvals)
    ? quote.approvals.map((approval) => ({
        ...approval,
        status: approval.status || approval.decision,
        approver: approval.approver || approval.user || null,
      }))
    : quote.approvals;

  return {
    ...quote,
    sizes,
    createdById: quote.createdBy ?? quote.createdById ?? null,
    createdBy: quote.user ? { ...quote.user } : quote.createdBy,
    estimatedMargin: quote.marginPercent ?? quote.estimatedMargin ?? 0,
    markup: quote.markupPercent ?? quote.markup ?? 0,
    discount: quote.discountPercent ?? quote.discount ?? 0,
    approvals,
    embroideryItems: parseJsonField(quote.embroideryItemsJson, []),
    printItems: parseJsonField(quote.printItemsJson, []),
  };
}

function decorateQuoteListItem(quote) {
  return {
    ...quote,
    createdBy: quote.user ? { ...quote.user } : quote.createdBy,
  };
}

function syncConfirmedEmbroideryItems(items = [], confirmedCost) {
  return items.map((item, index) => ({
    ...item,
    status: 'CONFIRMED',
    applicationCost: confirmedCost !== undefined && index === 0 ? confirmedCost : item.applicationCost,
    totalCostPerPiece: (confirmedCost !== undefined && index === 0 ? confirmedCost : item.applicationCost) + (item.setupCostPerPiece || 0),
  }));
}

function buildCustomizationPayload(body) {
  const embroidery = summarizeEmbroidery(body);
  const print = summarizePrint(body);

  return {
    embroidery,
    print,
    quoteData: {
      embroideryJobId: embroidery.first?.jobId || null,
      embroideryStatus: embroidery.status,
      embroideryItemsJson: embroidery.items.length ? JSON.stringify(embroidery.items) : null,
      printType: print.first?.type || null,
      printWidthCm: print.first?.widthCm || null,
      printHeightCm: print.first?.heightCm || null,
      printColors: print.first?.colorCount || null,
      printCostPerPiece: print.totalCost || null,
      printItemsJson: print.items.length ? JSON.stringify(print.items) : null,
    },
  };
}

function resolvePricingPayload(body, pricing) {
  return {
    markupPercent: pricing.markupPercent,
    markupSource: body.markupSource ?? (body.markupCoeficiente ? 'ERP' : 'MANUAL'),
    discountPercent: body.discountPercent ?? body.discount ?? 0,
  };
}

// ─── GET /api/quotes ──────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status)  where.status = status;
    if (search)  where.OR = [
      { clientName:  { contains: search, mode: 'insensitive' } },
      { reference:   { contains: search, mode: 'insensitive' } },
      { number:      { contains: search, mode: 'insensitive' } },
      { productName: { contains: search, mode: 'insensitive' } },
    ];

    // COMMERCIAL só vê os próprios; APPROVER/ADMIN vê todos
    if (req.user.role === 'COMMERCIAL') {
      where.createdBy = req.user.id;
    }

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, number: true, status: true,
          clientName: true, clientSegment: true,
          reference: true, productName: true, quantity: true,
          pricePerPiece: true, totalOrderValue: true,
          embroideryStatus: true,
          urgent: true,
          createdAt: true, updatedAt: true,
          user: { select: { name: true } },
        },
      }),
      prisma.quote.count({ where }),
    ]);

    res.json({
      quotes: quotes.map(decorateQuoteListItem),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/quotes/stats/summary ───────────────────────────────────────────
// Query (ADMIN/APPROVER apenas): dateFrom, dateTo, userId
router.get('/stats/summary', async (req, res, next) => {
  try {
    const isManager = req.user.role === 'ADMIN' || req.user.role === 'APPROVER';

    // Base: vendedor só vê os próprios
    let where = req.user.role === 'COMMERCIAL' ? { createdBy: req.user.id } : {};

    // Filtros gerenciais
    if (isManager) {
      const { dateFrom, dateTo, userId } = req.query;
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }
      if (userId) where.createdBy = parseInt(userId);
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const valueWindow   = (where.createdAt ?? { gte: thirtyDaysAgo });

    const [total, pending, approved, rejected, draft, recentValue, byUser] = await Promise.all([
      prisma.quote.count({ where }),
      prisma.quote.count({ where: { ...where, status: 'PENDING_APPROVAL' } }),
      prisma.quote.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.quote.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.quote.count({ where: { ...where, status: 'DRAFT' } }),
      prisma.quote.aggregate({
        where: { ...where, createdAt: valueWindow, status: { in: ['APPROVED', 'PENDING_APPROVAL'] } },
        _sum:  { totalOrderValue: true },
      }),
      // Breakdown por vendedor (somente para admin/approver sem filtro de user)
      isManager && !req.query.userId
        ? prisma.quote.groupBy({
            by: ['createdBy'],
            where,
            _count: { id: true },
            _sum:   { totalOrderValue: true },
          })
        : Promise.resolve([]),
    ]);

    res.json({
      total, pending, approved, rejected, draft,
      approvedValueLast30Days: recentValue._sum.totalOrderValue ?? 0,
      byStatus: { PENDING_APPROVAL: pending, APPROVED: approved, REJECTED: rejected, DRAFT: draft },
      byUser,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/quotes/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        materials:        true,
        fabricationItems: { include: { manufacturingCost: true } },
        embroideryJob:    true,
        approvals:        { include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' } },
        user:             { select: { name: true, email: true } },
      },
    });

    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

    // COMMERCIAL só acessa os próprios
    if (req.user.role === 'COMMERCIAL' && quote.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json({ quote: decorateQuote(quote) });
  } catch (err) { next(err); }
});

// ─── POST /api/quotes ─────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    const { quoteData: customizationData } = buildCustomizationPayload(body);

    const number = await nextQuoteNumber();

    // Calcula custo total via pricingEngine
    const pricing = calcularCustoTotal(body);
    const pricingPayload = resolvePricingPayload(body, pricing);

    const quote = await prisma.quote.create({
      data: {
        number,
        status:        'DRAFT',
        clientName:    body.clientName,
        clientSegment: body.clientSegment || null,
        clientCnpj:    body.clientCnpj   || null,
        clientPhone:   body.clientPhone   || null,
        clientEmail:   body.clientEmail   || null,
        manualClientId: body.manualClientId ? parseInt(body.manualClientId) : null,
        reference:     body.reference,
        productName:   body.productName,
        itemType:      body.itemType    || null,
        quantity:      body.quantity,
        orderType:     body.orderType   || 'RETAIL',
        urgent:        body.urgent      || false,
        sizes:         body.sizes       ? JSON.stringify(body.sizes)   : null,

        // Precificação calculada
        costPerPiece:    pricing.costPerPiece,
        markupPercent:   pricingPayload.markupPercent,
        markupSource:    pricingPayload.markupSource,
        discountPercent: pricingPayload.discountPercent,
        pricePerPiece:   pricing.pricePerPiece,
        totalOrderValue: pricing.totalOrderValue,
        marginPercent:   pricing.marginPercent,

        ...customizationData,

        notes:         body.notes        || null,
        internalNotes: body.internalNotes|| null,
        createdBy:     req.user.id,

        // Materiais do BOM
        materials: body.materials?.length ? {
          create: body.materials.map((m) => {
            const cons  = m.consumptionOverride ?? m.consumption ?? 1;
            const price = m.priceOverride ?? m.unitPrice ?? 0;
            return {
              erpCode:      m.erpCode      || `manual-${Date.now()}`,
              name:         m.name         || 'Material',
              category:     m.category     || null,
              unit:         m.unit         || 'un',
              consumption:  parseFloat(cons)   || 1,
              unitPrice:    parseFloat(m.unitPrice)  || 0,
              priceOverride: m.priceOverride != null ? parseFloat(m.priceOverride) : null,
              priceSource:  m.priceOverride != null ? 'MANUAL' : 'ERP',
              priceNote:    m.priceNote    || null,
              erpPriceDate: m.erpPriceDate ? new Date(m.erpPriceDate) : null,
              isStale:      m.isStale      || false,
              staleDays:    m.staleDays    != null ? Math.round(m.staleDays) : null,
              costPerPiece: parseFloat((price * cons).toFixed(4)),
              addedManually: m.addedManually || false,
              removed:      m.removed       || false,
            };
          }),
        } : undefined,

        // Itens de fabricação — filtra itens sem categoria/descricao (formato ERP bruto)
        fabricationItems: body.fabricationItems?.filter(f => f.categoria || f.descricao || f.name)?.length ? {
          create: body.fabricationItems
            .filter(f => f.categoria || f.descricao || f.name)
            .map((f) => ({
              manufacturingCostId: f.manufacturingCostId || null,
              categoria:   f.categoria   || 'outros',
              descricao:   f.descricao   || f.name || 'Processo',
              tierApplied: f.tierApplied || null,
              unitCost:    parseFloat(f.unitCost)  || 0,
              quantity:    parseInt(f.quantity)    || 1,
              totalCost:   parseFloat((f.unitCost || 0) * (f.quantity || 1)).valueOf(),
            })),
        } : undefined,
      },
      include: {
        materials: true,
        fabricationItems: true,
        user: { select: { name: true, email: true } },
      },
    });

    res.status(201).json({ quote: decorateQuote(quote) });
  } catch (err) { next(err); }
});

// ─── PUT /api/quotes/:id ──────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const id    = parseInt(req.params.id);
    const quote = await prisma.quote.findUnique({ where: { id } });

    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (req.user.role === 'COMMERCIAL' && quote.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (['APPROVED', 'REJECTED'].includes(quote.status)) {
      return res.status(400).json({ error: 'Orçamento finalizado não pode ser editado' });
    }

    const body    = req.body;
    const pricing = calcularCustoTotal(body);
    const { quoteData: customizationData } = buildCustomizationPayload(body);
    const pricingPayload = resolvePricingPayload(body, pricing);

    // Remove materiais e fabricação anteriores e recria
    await prisma.$transaction([
      prisma.quoteMaterial.deleteMany({   where: { quoteId: id } }),
      prisma.quoteFabrication.deleteMany({ where: { quoteId: id } }),
    ]);

    const updated = await prisma.quote.update({
      where: { id },
      data: {
        clientName:    body.clientName,
        clientSegment: body.clientSegment || null,
        productName:   body.productName,
        itemType:      body.itemType     || null,
        quantity:      body.quantity,
        orderType:     body.orderType    || quote.orderType,
        urgent:        body.urgent       ?? quote.urgent,
        sizes:         body.sizes        ? JSON.stringify(body.sizes)  : quote.sizes,

        costPerPiece:    pricing.costPerPiece,
        markupPercent:   pricingPayload.markupPercent ?? quote.markupPercent,
        markupSource:    pricingPayload.markupSource ?? quote.markupSource,
        discountPercent: pricingPayload.discountPercent ?? quote.discountPercent,
        pricePerPiece:   pricing.pricePerPiece,
        totalOrderValue: pricing.totalOrderValue,
        marginPercent:   pricing.marginPercent,

        ...customizationData,

        notes:         body.notes        ?? quote.notes,
        internalNotes: body.internalNotes?? quote.internalNotes,

        materials: body.materials?.length ? {
          create: body.materials.map((m) => {
            const cons  = m.consumptionOverride ?? m.consumption ?? 1;
            const price = m.priceOverride ?? m.unitPrice ?? 0;
            return {
              erpCode:      m.erpCode      || `manual-${Date.now()}`,
              name:         m.name         || 'Material',
              category:     m.category     || null,
              unit:         m.unit         || 'un',
              consumption:  parseFloat(cons)   || 1,
              unitPrice:    parseFloat(m.unitPrice)  || 0,
              priceOverride: m.priceOverride != null ? parseFloat(m.priceOverride) : null,
              priceSource:  m.priceOverride != null ? 'MANUAL' : 'ERP',
              priceNote:    m.priceNote    || null,
              erpPriceDate: m.erpPriceDate ? new Date(m.erpPriceDate) : null,
              isStale:      m.isStale      || false,
              staleDays:    m.staleDays    != null ? Math.round(m.staleDays) : null,
              costPerPiece: parseFloat((price * cons).toFixed(4)),
              addedManually: m.addedManually || false,
              removed:      m.removed       || false,
            };
          }),
        } : undefined,

        fabricationItems: body.fabricationItems?.filter(f => f.categoria || f.descricao || f.name)?.length ? {
          create: body.fabricationItems
            .filter(f => f.categoria || f.descricao || f.name)
            .map((f) => ({
              manufacturingCostId: f.manufacturingCostId || null,
              categoria:   f.categoria   || 'outros',
              descricao:   f.descricao   || f.name || 'Processo',
              tierApplied: f.tierApplied || null,
              unitCost:    parseFloat(f.unitCost)  || 0,
              quantity:    parseInt(f.quantity)    || 1,
              totalCost:   parseFloat((f.unitCost || 0) * (f.quantity || 1)).valueOf(),
            })),
        } : undefined,
      },
      include: {
        materials: true,
        fabricationItems: true,
        user: { select: { name: true, email: true } },
      },
    });

    res.json({ quote: decorateQuote(updated) });
  } catch (err) { next(err); }
});

// ─── POST /api/quotes/:id/submit ──────────────────────────────────────────────
router.post('/:id/submit', async (req, res, next) => {
  try {
    const id    = parseInt(req.params.id);
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { materials: true },
    });

    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (req.user.role === 'COMMERCIAL' && quote.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (quote.status !== 'DRAFT' && quote.status !== 'REVISION_REQUESTED') {
      return res.status(400).json({ error: `Não é possível submeter um orçamento com status "${quote.status}"` });
    }

    // Bloqueia se ainda houver materiais stale
    const staleBlocking = quote.materials.filter((m) => m.isStale && !m.priceOverride && !m.removed);
    if (staleBlocking.length > 0) {
      return res.status(422).json({
        error: 'Existem materiais com preço desatualizado. Corrija os preços antes de submeter.',
        code:  'MATERIALS_STALE',
        staleItems: staleBlocking.map((m) => ({ name: m.name, staleDays: m.staleDays })),
      });
    }

    // Se bordado e ainda não confirmado → vai para AWAITING_EMBROIDERY
    const nextStatus = (quote.embroideryStatus === 'ESTIMATED')
      ? 'AWAITING_EMBROIDERY'
      : 'PENDING_APPROVAL';

    const updated = await prisma.quote.update({
      where: { id },
      data:  { status: nextStatus },
    });

    res.json({ quote: updated, nextStatus });
  } catch (err) { next(err); }
});

// ─── POST /api/quotes/:id/confirm-embroidery ──────────────────────────────────
// Bordador confirma o preço do bordado e o orçamento avança
router.post('/:id/confirm-embroidery', requireRole('ADMIN', 'COMPRADOR'), async (req, res, next) => {
  try {
    const id    = parseInt(req.params.id);
    const { confirmedCost, notes } = req.body;

    const quote = await prisma.quote.findUnique({ where: { id }, include: { embroideryJob: true } });
    const embroideryItems = parseJsonField(quote?.embroideryItemsJson, []);
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (quote.status !== 'AWAITING_EMBROIDERY') {
      return res.status(400).json({ error: 'Orçamento não está aguardando bordado' });
    }

    // Atualiza job de bordado se custo confirmado for diferente
    if (quote.embroideryJobId && confirmedCost !== undefined) {
      await prisma.embroideryJob.update({
        where: { id: quote.embroideryJobId },
        data:  { applicationCost: confirmedCost, isConfirmed: true },
      });
    }

    const updated = await prisma.quote.update({
      where: { id },
      data:  {
        embroideryStatus: 'CONFIRMED',
        status:           'PENDING_APPROVAL',
        embroideryItemsJson: embroideryItems.length
          ? JSON.stringify(syncConfirmedEmbroideryItems(embroideryItems, confirmedCost))
          : quote.embroideryItemsJson,
        internalNotes:    notes ? `${quote.internalNotes || ''}\n[Bordado confirmado]: ${notes}` : quote.internalNotes,
      },
    });

    res.json({ quote: updated });
  } catch (err) { next(err); }
});

// ─── DELETE /api/quotes/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const id    = parseInt(req.params.id);
    const quote = await prisma.quote.findUnique({ where: { id } });

    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (req.user.role === 'COMMERCIAL' && quote.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (quote.status === 'APPROVED') {
      return res.status(400).json({ error: 'Orçamento aprovado não pode ser excluído' });
    }

    await prisma.quote.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
