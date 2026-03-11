/**
 * routes/materials.js
 *
 * GET  /api/materials/search?q=  — busca textual no catálogo ERP (cache 4h)
 * POST /api/materials/ai-suggest — IA sugere melhor match + até 10 similares (≥80%)
 *
 * Regra dos 15 dias:
 *   A atualização de preço da matéria-prima ocorre na entrada da nota fiscal de compra.
 *   O campo `data` de /precomaterial armazena a data da última NF entrada.
 *   Se data ausente (Delphi null: 1899-12-30) ou > 15 dias → preço stale → bloqueio.
 *
 *   Fluxo de enriquecimento:
 *   1. Catálogo de descrições vem de /material (suporta limit + ativo)
 *   2. Após filtrar resultados, busca preços reais em lote via /precomaterial?codigo=...
 *   3. Junta os dados → aplica guard dos 15 dias com a data real da última NF
 */

import { Router } from 'express';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/auth.js';
import {
  getMateriaisCatalog,
  clearMateriaisCatalogCache,
  getPrecosMateriais,
} from '../services/erpService.js';

const router = Router();
router.use(requireAuth);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DELPHI_NULL = '1899-12-30';
const STALE_MS    = 15 * 24 * 60 * 60 * 1000;

function isStale(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL)) return true;
  return (Date.now() - new Date(dateStr).getTime()) > STALE_MS;
}

function staleDays(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL)) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/** Base do catálogo (/material): apenas descrição + unidade + grupo */
function mapBase(m, similarity = null) {
  return {
    codigo:    m.codigo,
    descricao: m.descricao || '',
    grupo:     m.grupo?.descricao || null,
    unidade:   m.unidade || 'un',
    preco:     parseFloat(m.precoMedio) || 0,
    data:      null,
    isStale:   true,   // provisório — será substituído após enriquecimento
    staleDays: null,
    ...(similarity !== null && { similarity }),
  };
}

/**
 * Enriquece lista de materiais com preço real + data da última NF (15-day guard).
 * Chama /precomaterial?codigo=... em lote — uma única requisição ao ERP.
 */
async function enrichWithPrices(items) {
  if (!items.length) return items;
  try {
    const codigos = items.map(m => m.codigo);
    const precos  = await getPrecosMateriais(codigos);

    // Índice por código para O(1) lookup
    const precoMap = {};
    precos.forEach(p => { precoMap[p.codigo] = p; });

    return items.map(m => {
      const p = precoMap[m.codigo];
      if (!p) return m; // sem preço no ERP → mantém stale=true

      const stale  = isStale(p.data);
      const dataNF = (!p.data || p.data.startsWith(DELPHI_NULL)) ? null : p.data;

      return {
        ...m,
        preco:     parseFloat(p.preco1) || parseFloat(p.precoCompra) || m.preco || 0,
        data:      dataNF,
        isStale:   stale,
        staleDays: stale ? staleDays(p.data) : null,
        // Mensagem explicativa para o vendedor
        staleReason: stale
          ? (dataNF
              ? `Última NF de compra: ${new Date(dataNF).toLocaleDateString('pt-BR')} (${staleDays(p.data)} dias atrás)`
              : 'Nenhuma NF de compra registrada no ERP')
          : null,
      };
    });
  } catch (e) {
    console.warn('[Materials] Falha ao buscar preços (/precomaterial):', e.message);
    return items; // retorna sem enriquecimento — stale=true por padrão
  }
}

/**
 * GET /api/materials/search?q=texto
 * Filtra catálogo por substring, depois enriquece com preço real + 15-day guard.
 * Retorna até 20 resultados.
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json([]);

    const catalog = await getMateriaisCatalog();
    const matched = catalog
      .filter(m => m.descricao?.toLowerCase().includes(q))
      .slice(0, 20)
      .map(m => mapBase(m));

    const enriched = await enrichWithPrices(matched);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/materials/ai-suggest
 * body: { description: string }
 *
 * Fluxo:
 *   1. IA interpreta descrição → sugere códigos com similarity
 *   2. Enriquece cada sugestão com preço real + data última NF
 *   3. Aplica guard dos 15 dias
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
      .map(m => `${m.codigo}|${m.descricao}|${m.grupo?.descricao || ''}|${m.unidade || 'un'}`)
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

    // Mapeia códigos da IA → objetos do catálogo
    const toItem = (item) => {
      const mat = catalog.find(m => m.codigo === item.codigo);
      return mat ? mapBase(mat, item.similarity) : null;
    };

    const rawBest = aiResult.bestMatch ? toItem(aiResult.bestMatch) : null;
    const rawAlt  = (aiResult.alternatives || [])
      .map(toItem)
      .filter(Boolean)
      .filter(a => !rawBest || a.codigo !== rawBest.codigo);

    // Enriquece tudo em um único lote
    const allItems = [...(rawBest ? [rawBest] : []), ...rawAlt];
    const enriched = await enrichWithPrices(allItems);

    const bestMatch    = enriched[0] && rawBest ? enriched[0] : null;
    const alternatives = enriched.slice(rawBest ? 1 : 0);

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
