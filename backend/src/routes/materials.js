/**
 * routes/materials.js
 *
 * GET  /api/materials/search?q=  — busca textual no catálogo ERP (cache 4h)
 * POST /api/materials/ai-suggest — IA sugere melhor match + até 10 similares (≥80%)
 *
 * Regra dos 15 dias: campo `data` de /precomaterial — se ausente ou > 15 dias,
 * o material é marcado como stale e o vendedor deve corrigir o preço manualmente.
 */

import { Router } from 'express';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/auth.js';
import { getMateriaisCatalog, clearMateriaisCatalogCache } from '../services/erpService.js';

const router = Router();
router.use(requireAuth);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DELPHI_NULL  = '1899-12-30';
const STALE_MS     = 15 * 24 * 60 * 60 * 1000;

function isStale(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL)) return true;
  return (Date.now() - new Date(dateStr).getTime()) > STALE_MS;
}

function staleDays(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL)) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function mapMaterial(m, similarity = null) {
  // /material schema: grupo é objeto { codigo, descricao }; preço em precoMedio
  // Não retorna campo `data` de preço — marca isStale=true para forçar verificação ao adicionar
  return {
    codigo:    m.codigo,
    descricao: m.descricao || '',
    grupo:     m.grupo?.descricao || null,
    unidade:   m.unidade || 'un',
    preco:     parseFloat(m.precoMedio) || 0,
    data:      null,
    isStale:   true,   // preço médio — vendedor deve verificar ao adicionar
    staleDays: null,
    ...(similarity !== null && { similarity }),
  };
}

/**
 * GET /api/materials/search?q=texto
 * Filtra o catálogo ERP localmente por substring na descrição.
 * Retorna até 20 resultados.
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json([]);

    const catalog = await getMateriaisCatalog();
    const results = catalog
      .filter(m => m.descricao?.toLowerCase().includes(q))
      .slice(0, 20)
      .map(m => mapMaterial(m));

    res.json(results);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/materials/ai-suggest
 * body: { description: string }
 *
 * Retorna:
 *   bestMatch:    material com maior relevância (ou null)
 *   alternatives: até 10 materiais com similarity ≥ 0.80
 */
router.post('/ai-suggest', async (req, res, next) => {
  try {
    const { description } = req.body;
    if (!description?.trim()) {
      return res.status(400).json({ error: 'description é obrigatório' });
    }

    const catalog = await getMateriaisCatalog();
    if (!catalog.length) {
      return res.json({ bestMatch: null, alternatives: [] });
    }

    // Catálogo compacto para o prompt (codigo|descricao|grupo|unidade)
    const catalogLines = catalog
      .map(m => `${m.codigo}|${m.descricao}|${m.descricaoGrupo || ''}|${m.unidade || 'un'}`)
      .join('\n');

    const prompt = `Você é um assistente especialista em matéria-prima têxtil para uniformes.
Dado o catálogo de materiais abaixo (formato: código|descrição|grupo|unidade) e uma descrição do material buscado, identifique:
1. O melhor match — o código que mais provavelmente representa o material buscado
2. Até 10 alternativas similares com similaridade ≥ 0.80

Catálogo:
${catalogLines}

Material buscado: "${description}"

Responda APENAS com JSON válido neste formato exato:
{
  "bestMatch": { "codigo": "...", "similarity": 0.95 },
  "alternatives": [
    { "codigo": "...", "similarity": 0.85 }
  ]
}

Se não houver nenhum match com similaridade ≥ 0.80, retorne: {"bestMatch": null, "alternatives": []}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const aiResult = JSON.parse(completion.choices[0].message.content);

    const enrichItem = (item) => {
      const mat = catalog.find(m => m.codigo === item.codigo);
      if (!mat) return null;
      return mapMaterial(mat, item.similarity);
    };

    const bestMatch   = aiResult.bestMatch ? enrichItem(aiResult.bestMatch) : null;
    const alternatives = (aiResult.alternatives || [])
      .map(enrichItem)
      .filter(Boolean)
      .filter(a => !bestMatch || a.codigo !== bestMatch.codigo);

    res.json({ bestMatch, alternatives });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/materials/catalog/refresh
 * Força recarga do catálogo (admin utility).
 */
router.post('/catalog/refresh', async (req, res, next) => {
  try {
    clearMateriaisCatalogCache();
    const catalog = await getMateriaisCatalog();
    res.json({ ok: true, count: catalog.length });
  } catch (err) {
    next(err);
  }
});

export default router;
