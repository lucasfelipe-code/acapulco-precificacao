/**
 * routes/clients.js
 * Clientes: ERP Sisplan + fallback ManualClient (Supabase).
 *
 * Mantem a busca ERP no formato mais simples possivel para evitar
 * regressao no endpoint /entidade do Sisplan.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getEntidades, getEntidade } from '../services/erpService.js';
import prisma from '../config/database.js';

const router = Router();
router.use(requireAuth);

function mapEntidade(e) {
  return {
    id: e.codigo,
    name: e.nome || e.fantasia || '',
    cnpj: e.cnpj || null,
    email: e.email || null,
    phone: [e.dddTelefone, e.telefone].filter(Boolean).join('') || null,
    city: e.endereco?.municipio || null,
    state: e.uf || e.endereco?.uf || null,
    segment: e.ramoAtividade?.descricao || null,
    source: 'ERP',
  };
}

function mapManual(c) {
  return {
    id: `local-${c.id}`,
    name: c.name,
    cnpj: c.cnpj || null,
    email: c.email || null,
    phone: c.phone || null,
    segment: c.segment || null,
    city: null,
    state: null,
    source: 'LOCAL',
  };
}

// GET /api/clients?q=texto
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    const [erpResults, localResults] = await Promise.allSettled([
      getEntidades(q, 20),
      prisma.manualClient.findMany({
        where: {
          active: true,
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { cnpj: { contains: q } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 10,
      }),
    ]);

    const erp = erpResults.status === 'fulfilled' ? erpResults.value.map(mapEntidade) : [];
    const local = localResults.status === 'fulfilled' ? localResults.value.map(mapManual) : [];

    res.json([...erp, ...local]);
  } catch (err) {
    next(err);
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id.startsWith('local-')) {
      const numId = parseInt(id.replace('local-', ''), 10);
      const client = await prisma.manualClient.findUnique({ where: { id: numId } });
      if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
      return res.json(mapManual(client));
    }

    const entidade = await getEntidade(id);
    if (!entidade) return res.status(404).json({ error: 'Cliente nao encontrado' });
    res.json(mapEntidade(entidade));
  } catch (err) {
    next(err);
  }
});

// POST /api/clients
router.post('/', async (req, res, next) => {
  try {
    const { name, cnpj, email, phone, segment, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome e obrigatorio' });

    const client = await prisma.manualClient.create({
      data: {
        name: name.trim(),
        cnpj: cnpj || null,
        email: email || null,
        phone: phone || null,
        segment: segment || null,
        notes: notes || null,
        createdBy: req.user.id,
      },
    });

    res.status(201).json({ client: mapManual(client) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id.startsWith('local-')) {
      return res.status(400).json({ error: 'Apenas clientes locais podem ser atualizados' });
    }

    const numId = parseInt(id.replace('local-', ''), 10);
    const { name, cnpj, email, phone, segment, notes } = req.body;

    const data = {};
    if (name !== undefined) data.name = name?.trim() || undefined;
    if (cnpj !== undefined) data.cnpj = cnpj || null;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    if (segment !== undefined) data.segment = segment || null;
    if (notes !== undefined) data.notes = notes || null;

    const client = await prisma.manualClient.update({ where: { id: numId }, data });
    res.json({ client: mapManual(client) });
  } catch (err) {
    next(err);
  }
});

export default router;
