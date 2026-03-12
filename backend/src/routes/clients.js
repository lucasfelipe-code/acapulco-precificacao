/**
 * routes/clients.js
 * Clientes: ERP Sisplan + fallback ManualClient (Supabase).
 *
 * GET  /api/clients?q=  → busca ERP + local em paralelo
 * GET  /api/clients/:id → ERP primeiro; se não encontrar, tenta local (id=local-N)
 * POST /api/clients     → cria ManualClient no Supabase
 * PUT  /api/clients/:id → atualiza ManualClient (id=local-N)
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getEntidades, getEntidade } from '../services/erpService.js';
import prisma from '../config/database.js';

const router = Router();
router.use(requireAuth);

function mapEntidade(e) {
  return {
    id:      e.codigo,
    name:    e.nome    || e.fantasia || '',
    cnpj:    e.cnpj    || null,
    email:   e.email   || null,
    phone:   [e.dddTelefone, e.telefone].filter(Boolean).join('') || null,
    city:    e.endereco?.municipio || null,
    state:   e.uf      || e.endereco?.uf || null,
    segment: e.ramoAtividade?.descricao || null,
    source:  'ERP',
  };
}

function mapManual(c) {
  return {
    id:      `local-${c.id}`,
    name:    c.name,
    cnpj:    c.cnpj    || null,
    email:   c.email   || null,
    phone:   c.phone   || null,
    segment: c.segment || null,
    city:    null,
    state:   null,
    source:  'LOCAL',
  };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildSearchVariants(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [''];

  const titleCase = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return [...new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase(), titleCase])];
}

function scoreClientMatch(client, query) {
  const q = normalizeText(query);
  if (!q) return 0;

  const name = normalizeText(client.name);
  const cnpj = normalizeText(client.cnpj);
  const email = normalizeText(client.email);

  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (cnpj.includes(q)) return 50;
  if (email.includes(q)) return 40;

  const tokens = q.split(/\s+/).filter(Boolean);
  const tokenHits = tokens.filter((token) => name.includes(token)).length;
  return tokenHits > 0 ? tokenHits * 10 : -1;
}

function dedupeClients(clients = []) {
  return clients.reduce((acc, client) => {
    const key = `${client.source}:${client.id}`;
    if (!acc.some((item) => `${item.source}:${item.id}` === key)) acc.push(client);
    return acc;
  }, []);
}

function rankClients(clients = [], query = '') {
  if (!query) return clients;

  return clients
    .map((client) => ({ client, score: scoreClientMatch(client, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name, 'pt-BR'))
    .map((entry) => entry.client);
}

// GET /api/clients?q=texto
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const searchVariants = buildSearchVariants(q);

    const [erpResults, localResults] = await Promise.allSettled([
      Promise.allSettled(searchVariants.map((variant) => getEntidades(variant, 20))),
      prisma.manualClient.findMany({
        where: {
          active: true,
          ...(q
            ? { OR: [
                { name:  { contains: q, mode: 'insensitive' } },
                { cnpj:  { contains: q } },
                { email: { contains: q, mode: 'insensitive' } },
              ]}
            : {}
          ),
        },
        orderBy: { name: 'asc' },
        take: 10,
      }),
    ]);

    const erp = erpResults.status === 'fulfilled'
      ? erpResults.value
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => result.value)
          .map(mapEntidade)
      : [];

    const local = localResults.status === 'fulfilled' ? localResults.value.map(mapManual) : [];

    let deduped = dedupeClients([...erp, ...local]);
    let ranked = rankClients(deduped, q);

    // Fallback: alguns ERPs só retornam bem em buscas amplas.
    // Se a busca direta vier vazia, carrega um lote maior e filtra localmente.
    if (q && ranked.length === 0) {
      try {
        const broadErp = await getEntidades('', 200);
        deduped = dedupeClients([...broadErp.map(mapEntidade), ...local]);
        ranked = rankClients(deduped, q);
      } catch {
        // Mantém o resultado anterior caso o fallback amplo também falhe.
      }
    }

    const finalList = q ? (ranked.length > 0 ? ranked : deduped) : deduped;
    res.json(finalList.slice(0, 20));
  } catch (err) {
    next(err);
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id.startsWith('local-')) {
      const numId = parseInt(id.replace('local-', ''));
      const client = await prisma.manualClient.findUnique({ where: { id: numId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
      return res.json(mapManual(client));
    }

    const entidade = await getEntidade(id);
    if (!entidade) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(mapEntidade(entidade));
  } catch (err) {
    next(err);
  }
});

// POST /api/clients — cria ManualClient
router.post('/', async (req, res, next) => {
  try {
    const { name, cnpj, email, phone, segment, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

    const client = await prisma.manualClient.create({
      data: {
        name:      name.trim(),
        cnpj:      cnpj  || null,
        email:     email || null,
        phone:     phone || null,
        segment:   segment || null,
        notes:     notes || null,
        createdBy: req.user.id,
      },
    });

    res.status(201).json({ client: mapManual(client) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/clients/:id — atualiza ManualClient
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id.startsWith('local-')) {
      return res.status(400).json({ error: 'Apenas clientes locais podem ser atualizados' });
    }
    const numId = parseInt(id.replace('local-', ''));
    const { name, cnpj, email, phone, segment, notes } = req.body;

    const data = {};
    if (name    !== undefined) data.name    = name?.trim() || undefined;
    if (cnpj    !== undefined) data.cnpj    = cnpj    || null;
    if (email   !== undefined) data.email   = email   || null;
    if (phone   !== undefined) data.phone   = phone   || null;
    if (segment !== undefined) data.segment = segment || null;
    if (notes   !== undefined) data.notes   = notes   || null;

    const client = await prisma.manualClient.update({ where: { id: numId }, data });
    res.json({ client: mapManual(client) });
  } catch (err) {
    next(err);
  }
});

export default router;
