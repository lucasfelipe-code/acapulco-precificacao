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
import prisma from '../config/database.js';
import {
  getMateriaisCatalog,
  clearMateriaisCatalogCache,
  getPrecosMateriais,
  diagnosticarCatalogoMateriais,
  getMateriaisFromBOMs,
  searchMateriaisFromBOMs,
  searchLocalMaterialCatalog,
  syncErpMaterialCatalog,
  getLocalMaterialGroups,
} from '../services/erpService.js';

const router = Router();
router.use(requireAuth);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DELPHI_NULL = '1899-12-30';
const STALE_MS    = 15 * 24 * 60 * 60 * 1000;

// Grupos de matéria-prima que exigem guard de 15 dias + frete de 3%
// (tecidos, malhas, fios e similares — excluindo aviamentos e embalagens)
const FABRIC_KEYWORDS = [
  'TECIDO', 'MALHA', 'FIO', 'FIOS', 'FIBRA', 'FIBRAS',
  'LONA', 'BRIM', 'SARJA', 'JERSEY', 'OXFORD', 'HELANCA',
  'PIQUET', 'MOLETON', 'SPANDEX', 'ELASTANO', 'NYLON',
  'POLIESTER', 'ALGODAO', 'VISCOSE', 'LYCRA',
];

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function buildSearchBlob(item) {
  return normalizeText([
    item.codigo,
    item.descricao,
    item.grupo?.descricao || item.grupo,
    item.setor,
    item.codigoImp,
  ].filter(Boolean).join(' '));
}

function scoreMaterial(item, query) {
  const q = normalizeText(query);
  const descricao = normalizeText(item.descricao || '');
  const grupo = normalizeText(item.grupo?.descricao || item.grupo || '');
  const blob = buildSearchBlob(item);

  if (!blob.includes(q)) return -1;
  if (descricao.startsWith(q)) return 400;
  if (descricao.includes(q)) return 300;
  if (grupo.includes(q)) return 220;
  return 100;
}

function isFabricGroup(grupo) {
  if (!grupo) return false;
  const g = grupo.toUpperCase();
  return FABRIC_KEYWORDS.some(k => g.includes(k));
}

function isStale(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL)) return true;
  return (Date.now() - new Date(dateStr).getTime()) > STALE_MS;
}

function staleDays(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL)) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/** Base do catálogo (/material): descrição + unidade + grupo + isFabric */
function mapBase(m, similarity = null) {
  const grupo    = m.grupo?.descricao || null;
  const fabric   = isFabricGroup(grupo);
  return {
    codigo:    m.codigo,
    descricao: m.descricao || '',
    grupo,
    unidade:   m.unidade || 'un',
    preco:     parseFloat(m.precoMedio) || 0,
    data:      null,
    isFabric:  fabric,
    isStale:   fabric, // provisório — substituído após enriquecimento; falso para não-tecidos
    staleDays: null,
    ...(similarity !== null && { similarity }),
  };
}

function mapBomBase(m, similarity = null) {
  const grupo = m.grupo || m.setor || null;
  const fabric = isFabricGroup(grupo);
  return {
    codigo: m.codigo,
    descricao: m.descricao || '',
    grupo,
    unidade: m.unidade || 'un',
    preco: parseFloat(m.preco) || 0,
    data: m.dataNF || null,
    isFabric: fabric,
    isStale: fabric ? Boolean(m.isStale) : false,
    staleDays: fabric ? (m.staleDays ?? null) : null,
    ...(similarity !== null && { similarity }),
  };
}

async function getSearchCatalog() {
  const local = await searchLocalMaterialCatalog('', 0).catch(() => []);
  if (local.length) return local;
  const [materialCatalog, bomCatalog] = await Promise.all([
    getMateriaisCatalog().catch(() => []),
    getMateriaisFromBOMs(false).catch(() => []),
  ]);

  const dedup = new Map();
  materialCatalog.forEach((item) => {
    if (!item?.codigo) return;
    dedup.set(item.codigo, mapBase(item));
  });
  bomCatalog.forEach((item) => {
    if (!item?.codigo || dedup.has(item.codigo)) return;
    dedup.set(item.codigo, mapBomBase(item));
  });
  return Array.from(dedup.values());
}

/**
 * Enriquece lista de materiais com preço real + data da última NF.
 * Guard dos 15 dias aplicado SOMENTE a tecidos/malhas (isFabric=true).
 * Uma única requisição ao ERP via /precomaterial?codigo=...
 */
async function enrichWithPrices(items) {
  if (!items.length) return items;
  try {
    const codigos = items.map(m => m.codigo);
    const precos  = await getPrecosMateriais(codigos);

    const precoMap = {};
    precos.forEach(p => { precoMap[p.codigo] = p; });

    return items.map(m => {
      const p = precoMap[m.codigo];
      if (!p) return m;

      const dataNF   = (!p.data || p.data.startsWith(DELPHI_NULL)) ? null : p.data;
      // Guard de 15 dias apenas para tecidos/malhas
      const stale    = m.isFabric ? isStale(p.data) : false;

      return {
        ...m,
        preco:       parseFloat(p.preco1) || parseFloat(p.precoCompra) || m.preco || 0,
        data:        dataNF,
        isStale:     stale,
        staleDays:   stale ? staleDays(p.data) : null,
        staleReason: stale
          ? (dataNF
              ? `Última NF de compra: ${new Date(dataNF).toLocaleDateString('pt-BR')} (${staleDays(p.data)} dias atrás)`
              : 'Nenhuma NF de compra registrada no ERP')
          : null,
      };
    });
  } catch (e) {
    console.warn('[Materials] Falha ao buscar preços (/precomaterial):', e.message);
    return items;
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

    const directMatches = await searchLocalMaterialCatalog(q, 20);

    if (directMatches.length > 0) {
      const enriched = await enrichWithPrices(directMatches);
      return res.json(enriched);
    }

    const bomMatches = await searchMateriaisFromBOMs(q, 20);
    res.json(bomMatches.map((item) => mapBomBase(item)));
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

    const catalog = await getSearchCatalog();
    if (!catalog.length) {
      return res.json({ bestMatch: null, alternatives: [] });
    }

    // Catálogo compacto para o prompt (codigo|descricao|grupo|unidade)
    const catalogLines = catalog
      .map(m => `${m.codigo}|${m.descricao}|${m.grupo?.descricao || m.grupo || ''}|${m.unidade || 'un'}`)
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
      return mat ? { ...mat, similarity: item.similarity } : null;
    };

    const rawBest = aiResult.bestMatch ? toItem(aiResult.bestMatch) : null;
    const rawAlt  = (aiResult.alternatives || [])
      .map(toItem)
      .filter(Boolean)
      .filter(a => !rawBest || a.codigo !== rawBest.codigo);

    // Enriquece tudo em um único lote
    const allItems = [...(rawBest ? [rawBest] : []), ...rawAlt];
    const needsPrice = allItems.filter((item) => !item.data && !item.preco);
    const keep = allItems.filter((item) => item.data || item.preco);
    const enriched = needsPrice.length
      ? [...keep, ...(await enrichWithPrices(needsPrice))]
      : keep;

    const bestMatch    = enriched[0] && rawBest ? enriched[0] : null;
    const alternatives = enriched.slice(rawBest ? 1 : 0);

    res.json({ bestMatch, alternatives });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/materials/fabrics-catalog
 * Todo o catálogo de matéria-prima do ERP com preço e status de atualização.
 * Suporta ?format=csv para download.
 * Retorna: codigo, descricao, grupo, unidade, preco, data, staleDays, isStale, isFabric
 */
router.get('/fabrics-catalog', async (req, res, next) => {
  try {
    const catalog = await getMateriaisCatalog();

    // Todos os materiais — sem filtro por grupo
    const baseMapped = catalog.map(m => mapBase(m));
    const enriched   = await enrichWithPrices(baseMapped);

    // Ordena: por grupo → dentro do grupo, desatualizados primeiro → nome
    const sorted = enriched.sort((a, b) => {
      const ga = a.grupo || '';
      const gb = b.grupo || '';
      if (ga !== gb) return ga.localeCompare(gb, 'pt-BR');
      if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    });

    if (req.query.format === 'csv') {
      const header = 'Código,Descrição,Grupo,Unidade,Preço ERP (R$),Data Última NF,Dias Sem Atualização,Status,Tecido/Malha\n';
      const rows   = sorted.map(m => {
        const status  = m.isStale ? 'DESATUALIZADO' : 'OK';
        const data    = m.data ? new Date(m.data).toLocaleDateString('pt-BR') : 'nunca';
        const dias    = m.staleDays != null ? m.staleDays : (m.isStale ? 999 : 0);
        const fabric  = m.isFabric ? 'SIM' : 'NÃO';
        return `${m.codigo},"${m.descricao}","${m.grupo || ''}",${m.unidade},${m.preco.toFixed(4)},${data},${dias},${status},${fabric}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="materiais-erp-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send('\uFEFF' + header + rows); // BOM para Excel reconhecer UTF-8
    }

    res.json({ total: sorted.length, items: sorted });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/materials/bom-catalog
 * Catálogo de materiais extraído dos BOMs de todos os produtos.
 * Inclui tecidos/malhas que não aparecem no endpoint /material.
 * ?format=csv  → download CSV
 * ?refresh=true → ignora cache e reprocessa (demora ~1-3 min)
 */
router.get('/bom-catalog', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const materiais    = await getMateriaisFromBOMs(forceRefresh);

    // Ordena: desatualizados primeiro → grupo → nome
    const sorted = [...materiais].sort((a, b) => {
      if ((a.isStale ?? false) !== (b.isStale ?? false)) return (a.isStale ? -1 : 1);
      const ga = a.grupo || '';
      const gb = b.grupo || '';
      if (ga !== gb) return ga.localeCompare(gb, 'pt-BR');
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    });

    if (req.query.format === 'csv') {
      const header = 'Código,Descrição,Grupo/Setor,Unidade,Preço ERP (R$),Data Última NF,Dias Sem Atualização,Status\n';
      const rows   = sorted.map(m => {
        const status = m.isStale ? 'DESATUALIZADO' : (m.dataNF ? 'OK' : 'SEM NF');
        const data   = m.dataNF ? new Date(m.dataNF).toLocaleDateString('pt-BR') : 'nunca';
        const dias   = m.staleDays ?? 999;
        return `${m.codigo},"${m.descricao}","${m.grupo || m.setor || ''}",${m.unidade},${(m.preco || 0).toFixed(4)},${data},${dias},${status}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="materiais-bom-erp-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send('\uFEFF' + header + rows);
    }

    res.json({ total: sorted.length, items: sorted });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/materials/erp-diagnostic
 * Varre o ERP com múltiplas estratégias para encontrar todos os tipos de material.
 * Uso exclusivo admin/comprador — chama o ERP diretamente (sem cache).
 * Retorna JSON com grupos encontrados em cada endpoint testado.
 */
router.get('/erp-diagnostic', async (req, res, next) => {
  try {
    const report = await diagnosticarCatalogoMateriais();
    res.json(report);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/materials/catalog/refresh
 * Força recarga do catálogo (admin/comprador utility).
 */
router.post('/catalog/refresh', async (req, res, next) => {
  try {
    clearMateriaisCatalogCache();
    const result = await syncErpMaterialCatalog(true);
    res.json({ ok: true, count: result.count, groups: result.groups });
  } catch (err) {
    next(err);
  }
});

router.get('/groups', async (_req, res, next) => {
  try {
    const groups = await getLocalMaterialGroups();
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/materials/stale-report
 * Lista todos os materiais com preço desatualizado (> 15 dias).
 * Uso exclusivo do Comprador para gestão de preços.
 * Retorna: codigo, descricao, grupo, unidade, preco, data, staleDays
 */
router.get('/stale-report', async (req, res, next) => {
  try {
    const catalog  = await getMateriaisCatalog();
    const codigos  = catalog.map(m => m.codigo);
    const precos   = await getPrecosMateriais(codigos);

    const precoMap = {};
    precos.forEach(p => { precoMap[p.codigo] = p; });

    // Carrega overrides salvos pelo comprador
    const overrides = await prisma.materialPriceOverride.findMany();
    const overrideMap = {};
    overrides.forEach(o => { overrideMap[o.codigo] = o; });

    const staleItems = catalog
      .map(m => {
        const p      = precoMap[m.codigo];
        const dataNF = p?.data && !p.data.startsWith('1899-12-30') ? p.data : null;
        const days   = staleDays(dataNF ? dataNF : null);
        const fabric = isFabricGroup(m.grupo?.descricao || m.grupo || '');
        const stale  = fabric && (!dataNF || (Date.now() - new Date(dataNF).getTime()) > 15 * 24 * 60 * 60 * 1000);
        const ov     = overrideMap[m.codigo];

        return {
          codigo:       m.codigo,
          descricao:    m.descricao,
          grupo:        m.grupo?.descricao || '',
          unidade:      m.unidade || 'un',
          preco:        parseFloat(p?.preco1) || parseFloat(p?.precoCompra) || parseFloat(m.precoMedio) || 0,
          data:         dataNF,
          staleDays:    days,
          isStale:      stale,
          novoPreco:    ov?.novoPreco ?? null,
          nota:         ov?.nota ?? null,
          overrideAt:   ov?.updatedAt ?? null,
        };
      })
      .filter(m => m.isStale)
      .sort((a, b) => b.staleDays - a.staleDays);

    // CSV se solicitado
    if (req.query.format === 'csv') {
      const header = 'Código,Descrição,Grupo,Unidade,Preço ERP,Preço Temporário,Data Última NF,Dias Sem Atualização\n';
      const rows   = staleItems.map(m =>
        `${m.codigo},"${m.descricao}","${m.grupo}",${m.unidade},${m.preco.toFixed(2)},${m.novoPreco != null ? m.novoPreco.toFixed(2) : ''},${m.data || 'nunca'},${m.staleDays}`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="materiais-desatualizados-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send('\uFEFF' + header + rows);
    }

    res.json({ total: staleItems.length, items: staleItems });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/materials/price-update
 * Comprador envia lista de correções de preço: [{ codigo, novoPreco }]
 * Armazena como overrides locais (ERP só atualiza na entrada de NF).
 */
router.post('/price-update', async (req, res, next) => {
  try {
    const { updates } = req.body; // [{ codigo, descricao, erpPreco, novoPreco, nota? }]
    if (!Array.isArray(updates) || !updates.length) {
      return res.status(400).json({ error: 'updates deve ser um array não vazio' });
    }

    // Upsert de cada override no banco
    await Promise.all(updates.map(u =>
      prisma.materialPriceOverride.upsert({
        where:  { codigo: u.codigo },
        create: {
          codigo:    u.codigo,
          descricao: u.descricao || '',
          erpPreco:  parseFloat(u.erpPreco)  || 0,
          novoPreco: parseFloat(u.novoPreco) || 0,
          nota:      u.nota || null,
          updatedBy: req.user.id,
        },
        update: {
          novoPreco: parseFloat(u.novoPreco) || 0,
          nota:      u.nota || null,
          erpPreco:  parseFloat(u.erpPreco)  || 0,
          updatedBy: req.user.id,
        },
      })
    ));

    res.json({ ok: true, saved: updates.length });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/materials/price-override/:codigo
 * Remove override — preço volta ao ERP.
 */
router.delete('/price-override/:codigo', async (req, res, next) => {
  try {
    await prisma.materialPriceOverride.deleteMany({ where: { codigo: req.params.codigo } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
