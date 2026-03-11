/**
 * routes/clients.js
 * Clientes buscados exclusivamente do ERP Sisplan (/entidade?tipoEntidade=C).
 * Nenhum dado de cliente é persistido localmente.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getEntidades, getEntidade } from '../services/erpService.js';

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
  };
}

// GET /api/clients?q=texto
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const entidades = await getEntidades(q, 30);
    res.json(entidades.map(mapEntidade));
  } catch (err) {
    next(err);
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const entidade = await getEntidade(req.params.id);
    if (!entidade) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(mapEntidade(entidade));
  } catch (err) {
    next(err);
  }
});

export default router;
