/**
 * routes/users.js
 * Gestão de usuários — somente ADMINISTRADOR.
 *
 * GET    /api/users          → lista todos (sem senha)
 * POST   /api/users          → cria novo usuário
 * PUT    /api/users/:id      → atualiza nome, email, role, active
 * DELETE /api/users/:id      → desativa (soft delete)
 * POST   /api/users/:id/reset-password → redefine senha
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('ADMINISTRADOR'));

const VALID_ROLES = ['ADMINISTRADOR', 'VENDEDOR', 'SUPERVISOR', 'COMPRADOR'];

const userSelect = {
  id: true, email: true, name: true, role: true,
  active: true, createdAt: true, updatedAt: true,
};

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !role) {
      return res.status(400).json({ error: 'name, email, password e role são obrigatórios' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role inválida. Use: ${VALID_ROLES.join(', ')}` });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await prisma.user.create({
      data: { name, email, password: hashed, role },
      select: userSelect,
    });

    res.status(201).json({ user });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id   = parseInt(req.params.id);
    const { name, email, role, active } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role inválida. Use: ${VALID_ROLES.join(', ')}` });
    }

    // Impede que o admin se auto-desative ou mude a própria role
    if (id === req.user.id && (active === false || (role && role !== req.user.role))) {
      return res.status(400).json({ error: 'Você não pode alterar sua própria role ou se desativar' });
    }

    const data = {};
    if (name  !== undefined) data.name   = name;
    if (email !== undefined) data.email  = email;
    if (role  !== undefined) data.role   = role;
    if (active !== undefined) data.active = active;

    const user = await prisma.user.update({
      where:  { id },
      data,
      select: userSelect,
    });

    res.json({ user });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id — soft delete (desativa)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
    }

    const user = await prisma.user.update({
      where:  { id },
      data:   { active: false },
      select: userSelect,
    });

    res.json({ user, message: 'Usuário desativado com sucesso' });
  } catch (err) { next(err); }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { password: hashed } });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
