import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciais inválidas', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas', code: 'INVALID_CREDENTIALS' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Senha atual incorreta' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter ao menos 6 caracteres' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile — atualiza dados do próprio perfil
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;
    const data = {};
    if (name?.trim())  data.name  = name.trim();
    if (email?.trim()) data.email = email.trim();
    if (phone !== undefined) data.phone = phone || null;

    if (email) {
      const exists = await prisma.user.findFirst({ where: { email, NOT: { id: req.user.id } } });
      if (exists) return res.status(409).json({ error: 'E-mail já em uso por outro usuário' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, name: true, role: true, phone: true, avatarUrl: true },
    });
    res.json({ user });
  } catch (err) { next(err); }
});

// PUT /api/auth/avatar — atualiza avatar (base64 pequeno, max 200KB)
router.put('/avatar', requireAuth, async (req, res, next) => {
  try {
    const { avatarBase64 } = req.body;
    if (!avatarBase64) return res.status(400).json({ error: 'avatarBase64 é obrigatório' });
    if (avatarBase64.length > 280000) return res.status(400).json({ error: 'Imagem muito grande. Máx 200KB.' });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data:  { avatarUrl: avatarBase64 },
      select: { id: true, avatarUrl: true },
    });
    res.json({ user });
  } catch (err) { next(err); }
});

export default router;
