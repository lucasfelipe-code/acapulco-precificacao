/**
 * routes/costs.js
 * CRUD da tabela local de custos de fabricação (planilha Acapulco).
 * Também expõe endpoint de lookup automático por categoria + quantidade.
 */

import { Router } from 'express';
import prisma from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolveTier } from '../services/pricingEngine.js';

const router = Router();
router.use(requireAuth);

// GET /api/costs — lista todos
router.get('/', async (req, res, next) => {
  try {
    const { categoria } = req.query;
    const where = { active: true };
    if (categoria) where.categoria = categoria;

    const costs = await prisma.manufacturingCost.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { descricao: 'asc' }],
    });

    res.json({ costs });
  } catch (err) { next(err); }
});

// GET /api/costs/grouped — agrupado por categoria
router.get('/grouped', async (req, res, next) => {
  try {
    const costs = await prisma.manufacturingCost.findMany({
      where:   { active: true },
      orderBy: [{ categoria: 'asc' }, { descricao: 'asc' }],
    });

    const grouped = costs.reduce((acc, c) => {
      if (!acc[c.categoria]) acc[c.categoria] = [];
      acc[c.categoria].push({
        ...c,
        tiers:  c.tiers  ? JSON.parse(c.tiers)  : null,
        extras: c.extras ? JSON.parse(c.extras) : null,
      });
      return acc;
    }, {});

    res.json({ grouped });
  } catch (err) { next(err); }
});

/**
 * POST /api/costs/lookup
 * Resolve automaticamente os custos de fabricação para um produto,
 * dado o tipo de item e quantidade.
 *
 * Body: { referencia, itemType, quantity, processos: ["costura","talhacao",...] }
 * Retorna: lista de { manufacturingCostId, categoria, descricao, tierApplied, unitCost, totalCost }
 */
router.post('/lookup', async (req, res, next) => {
  try {
    const { referencia, itemType, quantity, processos = [] } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Quantidade obrigatória' });
    }

    // Busca todos os custos ativos
    const all = await prisma.manufacturingCost.findMany({ where: { active: true } });
    const resolved = [];

    for (const proc of processos) {
      // Normaliza o nome do processo para buscar na tabela
      const cat = normalizarCategoria(proc);
      const match = all.find(
        (c) =>
          c.categoria === cat &&
          (
            !referencia ||
            c.referencia.toLowerCase().includes(itemType?.toLowerCase() || '') ||
            referencia.toLowerCase().includes(c.referencia.toLowerCase()) ||
            c.descricao.toLowerCase().includes(itemType?.toLowerCase() || '')
          )
      );

      if (match) {
        const tiers    = match.tiers ? JSON.parse(match.tiers) : null;
        const { cost, tier } = resolveTier(match.basePrice, tiers, quantity);
        resolved.push({
          manufacturingCostId: match.id,
          categoria:   match.categoria,
          descricao:   match.descricao,
          tierApplied: tier,
          unitCost:    cost,
          quantity:    1,
          totalCost:   cost,
        });
      }
    }

    res.json({ items: resolved, quantity });
  } catch (err) { next(err); }
});

function normalizarCategoria(proc) {
  const map = {
    costura:    'camisaria',
    sewing:     'camisaria',
    talhacao:   'talhacao',
    corte:      'talhacao',
    cut:        'talhacao',
    embalagem:  'embalagem',
    packaging:  'embalagem',
    caseado:    'caseado_botao',
    botao:      'caseado_botao',
    estamparia: 'estamparia',
    silk:       'estamparia',
    print:      'estamparia',
    sublimacao: 'sublimacao',
  };
  return map[proc?.toLowerCase()] || proc?.toLowerCase();
}

// GET /api/costs/:id
router.get('/:id', async (req, res, next) => {
  try {
    const cost = await prisma.manufacturingCost.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!cost) return res.status(404).json({ error: 'Custo não encontrado' });

    res.json({
      cost: {
        ...cost,
        tiers:  cost.tiers  ? JSON.parse(cost.tiers)  : null,
        extras: cost.extras ? JSON.parse(cost.extras) : null,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/costs — criar (apenas ADMIN)
router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { referencia, descricao, categoria, subcategoria, basePrice, tiers, extras } = req.body;
    const cost = await prisma.manufacturingCost.create({
      data: {
        referencia,
        descricao,
        categoria,
        subcategoria: subcategoria || null,
        basePrice:    parseFloat(basePrice),
        tiers:        tiers  ? JSON.stringify(tiers)  : null,
        extras:       extras ? JSON.stringify(extras) : null,
      },
    });
    res.status(201).json({ cost });
  } catch (err) { next(err); }
});

// PUT /api/costs/:id — editar (apenas ADMIN)
router.put('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { descricao, categoria, subcategoria, basePrice, tiers, extras, active } = req.body;
    const cost = await prisma.manufacturingCost.update({
      where: { id: parseInt(req.params.id) },
      data: {
        descricao,
        categoria,
        subcategoria: subcategoria ?? undefined,
        basePrice:    basePrice !== undefined ? parseFloat(basePrice) : undefined,
        tiers:        tiers  !== undefined ? JSON.stringify(tiers)  : undefined,
        extras:       extras !== undefined ? JSON.stringify(extras) : undefined,
        active:       active !== undefined ? active : undefined,
      },
    });
    res.json({ cost });
  } catch (err) { next(err); }
});

// DELETE /api/costs/:id — soft delete (apenas ADMIN)
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.manufacturingCost.update({
      where: { id: parseInt(req.params.id) },
      data:  { active: false },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
