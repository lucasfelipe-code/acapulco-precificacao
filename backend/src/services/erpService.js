/**
 * erpService.js
 * Integração com Sisplan via Cloudflare Tunnel
 * Base URL: https://erp.lourencosolucoesengenharia.com.br  →  http://localhost:10005
 *
 * Endpoints reais (API Sisplan v2.0.0):
 *   POST /login                       → JWT token
 *   GET  /produto/{codigo}            → produto por referência
 *   GET  /consumo/{codigo}            → consumo de materiais do produto
 *   GET  /precomaterial/{codigo}      → preço do material + campo `data` (usado p/ guard 15 dias)
 *   GET  /formacao-preco?produto=REF  → formação de preço estruturada
 *   GET  /combinacao/{codigo}         → grades/cores/tamanhos do produto
 *   GET  /markup/{codigo}             → markup configurado
 *   GET  /tabela-preco/{codigo}       → tabela de preço
 *   GET  /preco/{tabela}/{codigo}     → preço em tabela específica
 */

import axios from 'axios';
import prisma from '../config/database.js';

const ERP_BASE_URL = process.env.ERP_BASE_URL || 'https://erp.lourencosolucoesengenharia.com.br';
const ERP_LOGIN    = process.env.ERP_LOGIN    || '';
const ERP_SENHA    = process.env.ERP_SENHA    || '';

// ─── Token cache ───────────────────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = null;

async function getToken() {
  if (_token && _tokenExpiry && Date.now() < _tokenExpiry) return _token;

  const res = await axios.post(`${ERP_BASE_URL}/login`, {
    login: ERP_LOGIN,
    senha: ERP_SENHA,
  });

  // Sisplan retorna { token: "...", expiracao: "..." } ou similar
  _token = res.data.token ?? res.data.accessToken ?? res.data;
  // Renova 5 min antes de expirar (assume 1h de vida)
  _tokenExpiry = Date.now() + (55 * 60 * 1000);
  return _token;
}

function authHeaders() {
  return { Authorization: `Bearer ${_token}` };
}

// ─── Helper ────────────────────────────────────────────────────────────────────
async function erpGet(path, params = {}) {
  await getToken();
  const res = await axios.get(`${ERP_BASE_URL}${path}`, {
    headers: authHeaders(),
    params,
    timeout: 10000,
  });
  return res.data;
}

// ─── Guard: dados com mais de 15 dias são bloqueados ──────────────────────────
function isDataStale(dateStr) {
  if (!dateStr) return true;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff > 15 * 24 * 60 * 60 * 1000; // 15 dias em ms
}

// ─── Cache DB (ErpCache) ───────────────────────────────────────────────────────
async function fromCache(key) {
  const cached = await prisma.erpCache.findUnique({ where: { key } });
  if (!cached) return null;
  if (isDataStale(cached.fetchedAt)) return null; // cache expirado (> 15 dias)
  return JSON.parse(cached.data);
}

async function toCache(key, data) {
  await prisma.erpCache.upsert({
    where: { key },
    create: { key, data: JSON.stringify(data), fetchedAt: new Date() },
    update: { data: JSON.stringify(data), fetchedAt: new Date() },
  });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Busca produto por referência (campo `codigo` no Sisplan).
 * Usa cache de 15 dias — se expirado, bloqueia e exige atualização manual.
 */
export async function getProdutoByCodigo(referencia, forceRefresh = false) {
  const cacheKey = `produto:${referencia}`;

  if (!forceRefresh) {
    const cached = await fromCache(cacheKey);
    if (cached) return cached;

    // Verifica se existe registro stale no DB
    const stale = await prisma.erpCache.findUnique({ where: { key: cacheKey } });
    if (stale && isDataStale(stale.fetchedAt)) {
      throw Object.assign(
        new Error(`Dados do ERP para referência "${referencia}" estão desatualizados (> 15 dias). Force a atualização.`),
        { code: 'ERP_STALE', referencia }
      );
    }
  }

  const data = await erpGet(`/produto/${referencia}`);
  await toCache(cacheKey, data);
  return data;
}

/**
 * Busca consumo de materiais do produto (fibras, malha, aviamentos…).
 * Retorna array de { insumo, consumo, setor, ... }
 */
export async function getConsumoProduto(referencia) {
  const cacheKey = `consumo:${referencia}`;
  const cached = await fromCache(cacheKey);
  if (cached) return cached;

  const data = await erpGet(`/consumo/${referencia}`);
  await toCache(cacheKey, Array.isArray(data) ? data : [data]);
  return data;
}

/**
 * Busca preço de um material específico.
 * Verifica campo `data` da resposta — se > 15 dias, lança erro.
 * preco1..preco4 = faixas de quantidade do material
 */
export async function getPrecoMaterial(codigoMaterial) {
  const cacheKey = `precomat:${codigoMaterial}`;
  const cached = await fromCache(cacheKey);
  if (cached) return cached;

  const data = await erpGet(`/precomaterial/${codigoMaterial}`);

  if (isDataStale(data.data)) {
    throw Object.assign(
      new Error(`Preço do material "${codigoMaterial}" está desatualizado no ERP (> 15 dias). Atualize o cadastro.`),
      { code: 'MAT_STALE', codigoMaterial, dataPreco: data.data }
    );
  }

  await toCache(cacheKey, data);
  return data;
}

/**
 * Formação de preço estruturada (Sisplan calcula automaticamente).
 * GET /formacao-preco?produto={ref}&markup={markup}&ordem={ordem}
 */
export async function getFormacaoPreco(referencia, markup = null, ordem = null) {
  const params = { produto: referencia };
  if (markup) params.markup = markup;
  if (ordem)  params.ordem  = ordem;

  return erpGet('/formacao-preco', params);
}

/**
 * Busca grades, cores e tamanhos disponíveis de um produto.
 * Útil para listar variantes no wizard de orçamento.
 */
export async function getCombinacaoProduto(referencia) {
  const cacheKey = `combinacao:${referencia}`;
  const cached = await fromCache(cacheKey);
  if (cached) return cached;

  const data = await erpGet(`/combinacao/${referencia}`);
  await toCache(cacheKey, data);
  return data;
}

/**
 * Composição do produto (estrutura de materiais vinculada).
 */
export async function getComposicaoProduto(referencia) {
  return erpGet(`/composicao-do-produto/${referencia}`);
}

/**
 * Markup configurado por código.
 */
export async function getMarkup(codigoMarkup) {
  return erpGet(`/markup/${codigoMarkup}`);
}

/**
 * Tabela de preços ativa.
 */
export async function getTabelaPreco(codigoTabela) {
  return erpGet(`/tabela-preco/${codigoTabela}`);
}

/**
 * Preço de um produto em uma tabela específica.
 * GET /preco/{tabela}/{codigo}
 */
export async function getPrecoNaTabela(codigoTabela, codigoProduto) {
  return erpGet(`/preco/${codigoTabela}/${codigoProduto}`);
}

/**
 * Busca resumida completa para o wizard de orçamento.
 * Retorna produto + consumo + preços dos materiais em paralelo.
 * Bloqueia se qualquer dado > 15 dias.
 */
export async function getDadosProdutoParaOrcamento(referencia, forceRefresh = false) {
  const produto = await getProdutoByCodigo(referencia, forceRefresh);

  let consumos = [];
  let precosMateria = [];
  let composicao = null;

  try {
    consumos = await getConsumoProduto(referencia);
    if (!Array.isArray(consumos)) consumos = [consumos];

    // Para cada insumo, busca preço — em paralelo
    precosMateria = await Promise.allSettled(
      consumos
        .filter(c => c.insumo)
        .map(c => getPrecoMaterial(c.insumo).then(p => ({ ...p, consumo: c.consumo, setor: c.setor })))
    );

    composicao = await getComposicaoProduto(referencia);
  } catch (e) {
    if (e.code === 'ERP_STALE' || e.code === 'MAT_STALE') throw e;
    // outros erros: retorna o que tiver
    console.warn(`[ERP] Aviso ao buscar consumo/preços de ${referencia}:`, e.message);
  }

  return {
    produto,
    consumos,
    composicao,
    precosMateria: precosMateria
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value),
    errosMateria: precosMateria
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message),
  };
}
