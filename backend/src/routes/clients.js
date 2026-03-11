/**
 * routes/clients.js
 * Clientes buscados do ERP Sisplan (/entidade?tipoEntidade=C).
 * POST local (Prisma) serve como fallback para clientes não cadastrados no ERP.
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { getEntidades, getEntidade } from '../services/erpService.js';

const router = Router();
router.use(requireAuth);

/** Mapeia entidade Sisplan → formato padrão da API */
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
  };
}

/**
 * GET /api/clients
 * Lista clientes do ERP. ?q=texto filtra por nome.
 */
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const entidades = await getEntidades(q, 30);
    res.json(entidades.map(mapEntidade));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id
 * Retorna dados de um cliente pelo código Sisplan.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const entidade = await getEntidade(req.params.id);
    if (!entidade) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(mapEntidade(entidade));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/clients
 * Cria novo cliente. Apenas `name` é obrigatório.
 */
router.post('/',
  body('name').trim().notEmpty().withMessage('Nome do cliente é obrigatório'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const { name, cnpj, email, phone, address, city, state, segment, notes } = req.body;
      const client = await prisma.client.create({
        data: { name, cnpj: cnpj || null, email: email || null, phone: phone || null,
                address: address || null, city: city || null, state: state || null,
                segment: segment || null, notes: notes || null },
      });
      res.status(201).json(client);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/clients/:id
 * Atualiza um cliente existente.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { name, cnpj, email, phone, address, city, state, segment, notes, active } = req.body;
    const client = await prisma.client.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(name      !== undefined && { name }),
        ...(cnpj      !== undefined && { cnpj }),
        ...(email     !== undefined && { email }),
        ...(phone     !== undefined && { phone }),
        ...(address   !== undefined && { address }),
        ...(city      !== undefined && { city }),
        ...(state     !== undefined && { state }),
        ...(segment   !== undefined && { segment }),
        ...(notes     !== undefined && { notes }),
        ...(active    !== undefined && { active }),
      },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

export default router;
