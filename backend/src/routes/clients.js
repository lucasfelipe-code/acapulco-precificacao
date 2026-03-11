/**
 * routes/clients.js
 * CRUD de clientes — base local (Sisplan não tem API de clientes).
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/clients
 * Lista clientes ativos. ?q=texto filtra por nome ou CNPJ (case-insensitive).
 */
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const where = {
      active: true,
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { cnpj: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 30,
      select: {
        id: true, name: true, cnpj: true, email: true,
        phone: true, city: true, state: true, segment: true,
      },
    });

    res.json(clients);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id
 * Retorna dados completos de um cliente.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(client);
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
