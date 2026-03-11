/**
 * routes/products.js
 * Busca produto no ERP (Sisplan) via Cloudflare Tunnel.
 * Retorna dados do produto + BOM completo com staleness por material.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getDadosProdutoParaOrcamento,
  getFormacaoPreco,
  getCombinacaoProduto,
  getProdutosList,
  getProdutoByCodigo2,
} from '../services/erpService.js';

const router = Router();
router.use(requireAuth);

const FRESHNESS_LIMIT = parseInt(process.env.ERP_FRESHNESS_DAYS || '15');

/**
 * GET /api/products
 * Lista todos os produtos ativos do catálogo Sisplan (para autocomplete).
 * Suporta filtro: ?q=camisa (filtra por codigo ou descricao)
 */
router.get('/', async (req, res, next) => {
  try {
    const lista = await getProdutosList();
    const q = (req.query.q || '').toLowerCase().trim();
    const result = q
      ? lista.filter(p =>
          p.codigo.toLowerCase().includes(q) ||
          p.descricao.toLowerCase().includes(q)
        )
      : lista;
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:referencia
 * Busca produto + BOM + custos de processo + markup no ERP via /formacao-preco.
 * Query: ?refresh=true para forçar atualização do cache do produto.
 *
 * Retorna:
 *   product          — dados do produto
 *   materials        — materiais/tecidos/aviamentos com staleness por linha
 *   fabricationItems — custos de processo do ERP (Costura, Corte, Bordado, Embalagem...)
 *   staleItems       — materiais com preço > 15 dias sem atualização
 *   hasStale         — flag global para bloquear próximo passo
 *   markup           — código e descrição do markup configurado no ERP
 *   erpSalePrice     — preço de venda atual cadastrado no ERP
 *   combinacoes      — grades, cores e tamanhos disponíveis
 */
router.get('/:referencia', async (req, res, next) => {
  const { referencia } = req.params;
  const forceRefresh   = req.query.refresh === 'true';

  /**
   * Resolução de código (codigo2 é a referência comercial usada pelos vendedores):
   * 1. Tenta resolver pelo codigo2 → obtém o codigo interno do ERP
   * 2. Usa o codigo interno para /formacao-preco e demais chamadas
   * 3. Fallback: usa o código informado diretamente (compatibilidade)
   */
  async function resolveErp(code) {
    // Tenta primeiro por codigo2 (referência comercial, ex: "44560")
    let actualCode = code;
    try {
      const byCode2 = await getProdutoByCodigo2(code);
      if (byCode2?.codigo) actualCode = byCode2.codigo;
    } catch { /* silencioso — prossegue com código original */ }

    try {
      return await getDadosProdutoParaOrcamento(actualCode, forceRefresh);
    } catch (firstErr) {
      const isNotFound = firstErr.response?.status === 400 || firstErr.response?.status === 404;
      if (!isNotFound || actualCode === code) throw firstErr;

      // Fallback: tenta com código original caso resolução por codigo2 tenha mudado algo
      return getDadosProdutoParaOrcamento(code, forceRefresh);
    }
  }

  try {
    const erp = await resolveErp(referencia);

    const { materials, fabricationItems } = erp;
    const staleItems = materials.filter((m) => m.isStale);
    const hasStale   = staleItems.length > 0;

    // Tamanhos — vêm do campo `faixa` do produto (ex: "PP/P/M/G/GG/XG/XGG")
    const faixaStr = erp.produto?.faixa?.descricao || erp.produto?.faixa || null;
    const sizes    = faixaStr
      ? faixaStr.split('/').map(s => s.trim()).filter(Boolean)
      : [];

    let combinacoes = null;
    try { combinacoes = await getCombinacaoProduto(referencia); } catch { /* opcional */ }

    res.json({
      product: {
        reference: referencia,
        name:      erp.produto.descricao || erp.produto.nome || referencia,
        itemType:  erp.produto.grupo?.descricao || erp.produto.grupo || erp.produto.tipo || null,
        sizes,                   // ["PP","P","M","G","GG","XG","XGG"] do ERP
        erpRaw:    erp.produto,
      },
      materials,
      fabricationItems,
      staleItems,
      hasStale,
      freshnessLimitDays: FRESHNESS_LIMIT,
      markup: erp.markup
        ? {
            source:       'ERP',
            codigo:       erp.markup.codigo,
            descricao:    erp.markup.descricao,
            indices:      erp.markup.indices      || [],
            somaIndices:  erp.markup.somaIndices  ?? null,
            coeficiente:  erp.markup.coeficiente  ?? null,
          }
        : null,
      erpSalePrice: erp.precoVenda,
      combinacoes,
    });
  } catch (err) {
    if (err.code === 'ERP_STALE') {
      return res.status(422).json({
        error:   err.message,
        code:    'ERP_DATA_STALE',
        details: { referencia: err.referencia, freshnessLimit: FRESHNESS_LIMIT },
      });
    }
    if (err.response?.status === 400 || err.response?.status === 404) {
      const erpMsg = err.response?.data?.error || null;
      return res.status(404).json({
        error:   erpMsg || `Referência "${referencia}" não encontrada no ERP.`,
        code:    'ERP_PRODUCT_NOT_FOUND',
        details: { referencia },
      });
    }
    next(err);
  }
});

/**
 * GET /api/products/:referencia/formacao-preco
 * Formação de preço calculada pelo próprio ERP.
 */
router.get('/:referencia/formacao-preco', async (req, res, next) => {
  try {
    const data = await getFormacaoPreco(req.params.referencia);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products/cache/clear
 * Limpa o cache da lista de produtos — forçar recarga do ERP.
 */
router.post('/cache/clear', async (_req, res, next) => {
  try {
    const { default: prisma } = await import('../config/database.js');
    await prisma.erpCache.deleteMany({ where: { key: 'produtos:lista' } });
    res.json({ ok: true, message: 'Cache de produtos limpo — próxima busca recarregará do ERP' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/erp/status
 * Verifica conectividade com o ERP.
 */
router.get('/erp/status', async (_req, res) => {
  try {
    const { getToken } = await import('../services/erpService.js');
    await getToken();
    res.json({ connected: true, url: process.env.ERP_BASE_URL });
  } catch (err) {
    res.status(503).json({ connected: false, error: err.message });
  }
});

export default router;
