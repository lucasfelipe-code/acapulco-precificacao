/**
 * erpService.js
 * Integração com Sisplan via Cloudflare Tunnel
 *
 * URL pública (tunnel): https://erp.lourencosolucoesengenharia.com.br/api/sisplan
 *   → roteia para: IPEXTERNO:PORTA/api/sisplan (interno)
 *
 * Autenticação CONFIRMADA (11/03/2026):
 *   POST /login  — credenciais nos HEADERS: username / password  (não no body)
 *   Resposta: { access_token, expires_in: 3600, token_type: "Bearer" }
 *
 * Endpoints Sisplan v2.0.0:
 *   GET  /produto/{codigo}             → produto por referência
 *   GET  /consumo/{codigo}             → consumo de materiais do produto
 *   GET  /precomaterial/{codigo}       → preço do material + campo `data` (guard 15 dias)
 *   GET  /formacao-preco?produto=REF   → formação de preço estruturada
 *   GET  /combinacao/{codigo}          → grades/cores/tamanhos do produto
 *   GET  /composicao-do-produto/{cod}  → composição do produto
 *   GET  /markup/{codigo}              → markup configurado
 *   GET  /tabela-preco/{codigo}        → tabela de preço
 *   GET  /preco/{tabela}/{codigo}      → preço em tabela específica
 *
 * Credenciais: API.COUTOFLOW / @123COUTOFLOW
 */

import axios from 'axios';
import prisma from '../config/database.js';

// ERP_BASE_URL já inclui /api/sisplan conforme documentação Sisplan
const ERP_BASE_URL = process.env.ERP_BASE_URL || 'https://erp.lourencosolucoesengenharia.com.br/api/sisplan';
const ERP_LOGIN    = process.env.ERP_LOGIN    || '';
const ERP_SENHA    = process.env.ERP_SENHA    || '';

// ─── Token cache ───────────────────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = null;

export async function getToken() {
  if (_token && _tokenExpiry && Date.now() < _tokenExpiry) return _token;

  // Sisplan: POST /login com credenciais nos HEADERS (não no body)
  // Resposta: { access_token, expires_in, token_type, documentation }
  const res = await axios.post(`${ERP_BASE_URL}/login`, null, {
    headers: {
      username: ERP_LOGIN,
      password: ERP_SENHA,
    },
  });

  _token = res.data.access_token;
  // expires_in vem em segundos (3600 = 1h) — renova 5 min antes
  const expiresMs = ((res.data.expires_in ?? 3600) - 300) * 1000;
  _tokenExpiry    = Date.now() + expiresMs;
  return _token;
}

function authHeaders() {
  return { Authorization: `Bearer ${_token}` };
}

// ─── Helper ────────────────────────────────────────────────────────────────────
async function erpGet(path, params = {}, timeout = 10000) {
  await getToken();
  const res = await axios.get(`${ERP_BASE_URL}${path}`, {
    headers: authHeaders(),
    params,
    timeout,
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
 * Retorna lista simplificada de todos os produtos ativos do catálogo Sisplan.
 * Cache de 1 hora (lista muda raramente — usa o mesmo mecanismo de 15 dias).
 */
export async function getProdutosList() {
  const cacheKey = 'produtos:lista';
  const cached   = await fromCache(cacheKey);
  if (cached) return cached;

  const data = await erpGet('/produto');
  const list = (Array.isArray(data) ? data : [])
    .filter(p => p.ativo && p.codigo)
    .map(p => ({
      codigo:     p.codigo,
      descricao:  p.descricao,
      descricao2: p.descricao2 || null,
      grupo:      p.grupo?.descricao || null,
      unidade:    p.unidade          || 'PC',
    }));

  await toCache(cacheKey, list);
  return list;
}

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
 * Lista todos os markups cadastrados no ERP.
 * GET /markup (sem código) — pode retornar array ou falhar em algumas versões do Sisplan.
 * Retorna array vazio em caso de erro (não crítico).
 */
export async function getMarkupsList() {
  try {
    const data = await erpGet('/markup');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[ERP] getMarkupsList failed (endpoint pode não suportar listagem):', e.message);
    return [];
  }
}

/**
 * Preço de um produto em uma tabela específica.
 * GET /preco/{tabela}/{codigo}
 */
export async function getPrecoNaTabela(codigoTabela, codigoProduto) {
  return erpGet(`/preco/${codigoTabela}/${codigoProduto}`);
}

// ─── Catálogo de materiais (cache em memória, 4h) ─────────────────────────────
let _materialCatalog  = null;
let _catalogExpiry    = null;
const CATALOG_TTL_MS  = 4 * 60 * 60 * 1000; // 4 horas

/**
 * Retorna catálogo completo de materiais ativos do ERP com preços.
 * Cache em memória de 4 horas — suficiente para evitar hammering no ERP.
 * Pagina em blocos de 500 até obter todos os registros.
 */
export async function getMateriaisCatalog() {
  if (_materialCatalog && Date.now() < _catalogExpiry) return _materialCatalog;

  // Pagina até não receber mais resultados (evita corte pelo limit)
  const PAGE = 500;
  const all  = [];
  let offset = 0;
  let keepGoing = true;

  while (keepGoing) {
    try {
      const data = await erpGet('/material', { ativo: 'true', limit: PAGE, offset });
      const page = Array.isArray(data) ? data : [];
      all.push(...page);
      if (page.length < PAGE) {
        keepGoing = false; // última página
      } else {
        offset += PAGE;
      }
    } catch (e) {
      console.warn(`[ERP] getMateriaisCatalog offset=${offset} falhou:`, e.message);
      keepGoing = false;
    }
  }

  _materialCatalog = all;
  _catalogExpiry   = Date.now() + CATALOG_TTL_MS;
  return _materialCatalog;
}

/**
 * Varredura diagnóstica do catálogo de materiais.
 * Usa limites menores e timeout maior para evitar timeouts do ERP.
 * NÃO usa cache — chama o ERP diretamente para diagnóstico real.
 */
export async function diagnosticarCatalogoMateriais() {
  const result = {};
  const TIMEOUT = 30000; // 30s para diagnóstico

  // ── 1. /material com ativo=true — limite seguro ───────────────────────────
  try {
    const data = await erpGet('/material', { ativo: 'true', limit: 200 }, TIMEOUT);
    const items = Array.isArray(data) ? data : [];
    result.materialAtivo = {
      total: items.length,
      grupos: agrupar(items),
      amostra: items.slice(0, 5),
    };
  } catch (e) { result.materialAtivo = { erro: e.message }; }

  // ── 2. /material sem filtro de ativo ─────────────────────────────────────
  try {
    const data = await erpGet('/material', { limit: 200 }, TIMEOUT);
    const items = Array.isArray(data) ? data : [];
    result.materialTodos = {
      total: items.length,
      grupos: agrupar(items),
    };
  } catch (e) { result.materialTodos = { erro: e.message }; }

  // ── 3. BOM de um produto real (formacao-preco) ────────────────────────────
  try {
    const produtos = await erpGet('/produto', { ativo: 'true', limit: 5 }, TIMEOUT);
    if (Array.isArray(produtos) && produtos.length > 0) {
      const ref = produtos[0].codigo;
      const fp  = await erpGet('/formacao-preco', { produto: ref }, TIMEOUT);
      const itens = Array.isArray(fp?.itens) ? fp.itens : (Array.isArray(fp) ? fp : []);
      result.bomAmostra = {
        produto: ref,
        totalItens: itens.length,
        itensC: itens.filter(i => i.abreviado === 'C').map(i => ({
          codigo:    i.referencia?.codigo || i.codigo,
          descricao: i.referencia?.descricao || i.descricao,
          abreviado: i.abreviado,
          setor:     i.setor?.descricao || i.setor,
          grupo:     i.referencia?.grupo?.descricao || i.referencia?.grupo,
          codigoImp: i.codigoImpressao,
          custo:     i.custo,
        })),
        itensM: itens.filter(i => i.abreviado === 'M').map(i => ({
          codigo:    i.referencia?.codigo || i.codigo,
          descricao: i.referencia?.descricao || i.descricao,
        })),
      };
    }
  } catch (e) { result.bomAmostra = { erro: e.message }; }

  return result;
}

/**
 * Constrói catálogo de materiais (abreviado="C") varrendo BOMs de todos os produtos.
 * Esta é a única forma de obter tecidos/malhas que não estão no endpoint /material.
 * Processo:
 *   1. Lista todos os produtos ativos
 *   2. Para cada produto busca /formacao-preco (em paralelo, lotes de 8)
 *   3. Coleta itens abreviado="C" (materiais/insumos do BOM)
 *   4. Deduplica por codigo
 *   5. Busca preços via /precomaterial em lote
 *
 * Cache em DB (ErpCache) com TTL de 1 dia — varredura é cara.
 */
export async function getMateriaisFromBOMs(forceRefresh = false) {
  const CACHE_KEY = 'bom:materiais:catalog';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 dia

  if (!forceRefresh) {
    try {
      const cached = await prisma.erpCache.findUnique({ where: { key: CACHE_KEY } });
      if (cached) {
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (age < CACHE_TTL) return JSON.parse(cached.data);
      }
    } catch { /* ignora erro de cache */ }
  }

  // 1. Lista de todos os produtos ativos
  const todosOsProdutos = [];
  let offset = 0;
  while (true) {
    try {
      const page = await erpGet('/produto', { ativo: 'true', limit: 200, offset }, 15000);
      const items = Array.isArray(page) ? page : [];
      todosOsProdutos.push(...items);
      if (items.length < 200) break;
      offset += 200;
    } catch { break; }
  }

  if (!todosOsProdutos.length) return [];

  // 2. Varre BOMs em lotes de 8 produtos por vez
  const LOTE = 8;
  const materiaisMap = {}; // codigo → item enriquecido

  for (let i = 0; i < todosOsProdutos.length; i += LOTE) {
    const lote = todosOsProdutos.slice(i, i + LOTE);
    await Promise.allSettled(lote.map(async (prod) => {
      try {
        const fp    = await erpGet('/formacao-preco', { produto: prod.codigo }, 15000);
        const itens = Array.isArray(fp?.itens) ? fp.itens : (Array.isArray(fp) ? fp : []);
        itens.filter(i => i.abreviado === 'C').forEach(i => {
          const cod = i.referencia?.codigo || i.codigo;
          if (!cod || materiaisMap[cod]) return; // já visto
          materiaisMap[cod] = {
            codigo:     cod,
            descricao:  i.referencia?.descricao || i.descricao || '',
            grupo:      i.referencia?.grupo?.descricao || i.setor?.descricao || null,
            setor:      i.setor?.descricao || null,
            unidade:    i.unidade || 'un',
            codigoImp:  i.codigoImpressao || null,
            // custo do BOM (pode estar desatualizado — enriquecemos depois)
            preco:      parseFloat(i.custo) || 0,
          };
        });
      } catch { /* produto sem BOM — ignora */ }
    }));
  }

  const materiais = Object.values(materiaisMap);

  // 3. Enriquece preços via /precomaterial em lote
  const codigos = materiais.map(m => m.codigo);
  if (codigos.length > 0) {
    const BATCH = 50;
    const precos = [];
    for (let i = 0; i < codigos.length; i += BATCH) {
      try {
        const data = await erpGet('/precomaterial', { codigo: codigos.slice(i, i + BATCH).join(',') }, 15000);
        if (Array.isArray(data)) precos.push(...data);
      } catch { /* ignora */ }
    }
    const precoMap = {};
    precos.forEach(p => { precoMap[p.codigo] = p; });

    materiais.forEach(m => {
      const p = precoMap[m.codigo];
      if (!p) return;
      m.preco     = parseFloat(p.preco1) || parseFloat(p.precoCompra) || m.preco;
      m.dataNF    = (!p.data || p.data.startsWith('1899-12-30')) ? null : p.data;
      m.staleDays = m.dataNF
        ? Math.floor((Date.now() - new Date(m.dataNF).getTime()) / 86400000)
        : 999;
      m.isStale   = !m.dataNF || m.staleDays > 15;
    });
  }

  // 4. Salva no cache
  try {
    await prisma.erpCache.upsert({
      where:  { key: CACHE_KEY },
      create: { key: CACHE_KEY, data: JSON.stringify(materiais), fetchedAt: new Date() },
      update: { data: JSON.stringify(materiais), fetchedAt: new Date() },
    });
  } catch { /* ignora */ }

  return materiais;
}

export async function searchMateriaisFromBOMs(query, limit = 20) {
  const term = String(query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  if (term.length < 2) return [];

  try {
    const cached = await getMateriaisFromBOMs(false);
    const fromCache = cached.filter((item) => {
      const blob = `${item.codigo || ''} ${item.descricao || ''} ${item.grupo || ''} ${item.setor || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      return blob.includes(term);
    });
    if (fromCache.length) return fromCache.slice(0, limit);
  } catch { /* segue para busca direcionada */ }

  const produtos = [];
  let offset = 0;
  while (produtos.length < 400) {
    try {
      const page = await erpGet('/produto', { ativo: 'true', limit: 100, offset }, 12000);
      const items = Array.isArray(page) ? page : [];
      produtos.push(...items);
      if (items.length < 100) break;
      offset += 100;
    } catch {
      break;
    }
  }

  const materiaisMap = new Map();
  const BATCH = 6;

  for (let i = 0; i < produtos.length && materiaisMap.size < limit; i += BATCH) {
    const lote = produtos.slice(i, i + BATCH);
    await Promise.allSettled(lote.map(async (produto) => {
      try {
        const fp = await erpGet('/formacao-preco', { produto: produto.codigo }, 12000);
        const itens = Array.isArray(fp?.itens) ? fp.itens : (Array.isArray(fp) ? fp : []);
        itens.filter((item) => item.abreviado === 'C').forEach((item) => {
          const codigo = item.referencia?.codigo || item.codigo;
          const descricao = item.referencia?.descricao || item.descricao || '';
          const grupo = item.referencia?.grupo?.descricao || item.setor?.descricao || '';
          const blob = `${codigo || ''} ${descricao} ${grupo}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
          if (!codigo || !blob.includes(term) || materiaisMap.has(codigo)) return;
          materiaisMap.set(codigo, {
            codigo,
            descricao,
            grupo,
            setor: item.setor?.descricao || null,
            unidade: item.unidade || 'un',
            codigoImp: item.codigoImpressao || null,
            preco: parseFloat(item.custo) || 0,
          });
        });
      } catch { /* ignora produto sem bom */ }
    }));
  }

  const materiais = Array.from(materiaisMap.values());
  if (!materiais.length) return [];

  const prices = await getPrecosMateriais(materiais.map((item) => item.codigo));
  const priceMap = {};
  prices.forEach((price) => { priceMap[price.codigo] = price; });

  return materiais.map((item) => {
    const price = priceMap[item.codigo];
    if (!price) return item;
    const dataNF = (!price.data || price.data.startsWith('1899-12-30')) ? null : price.data;
    return {
      ...item,
      preco: parseFloat(price.preco1) || parseFloat(price.precoCompra) || item.preco || 0,
      dataNF,
      staleDays: dataNF ? Math.floor((Date.now() - new Date(dataNF).getTime()) / 86400000) : 999,
      isStale: !dataNF || Math.floor((Date.now() - new Date(dataNF).getTime()) / 86400000) > 15,
    };
  });
}

function agrupar(items) {
  const map = {};
  items.forEach(m => {
    const g = m.grupo?.descricao || m.grupo || '(sem grupo)';
    map[g] = (map[g] || 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([grupo, count]) => ({ grupo, count }));
}

/**
 * Busca preços de múltiplos materiais em uma única chamada ao ERP.
 * GET /precomaterial?codigo=001,002,003
 * Retorna array com: codigo, descricao, preco1, precoCompra, data, unidade.
 * O campo `data` = data da última entrada de NF — base do guard de 15 dias.
 */
export async function getPrecosMateriais(codigos = []) {
  if (!codigos.length) return [];

  // Divide em lotes de 50 para evitar URLs longas demais
  const BATCH = 50;
  const results = [];
  for (let i = 0; i < codigos.length; i += BATCH) {
    const batch = codigos.slice(i, i + BATCH);
    try {
      const data = await erpGet('/precomaterial', { codigo: batch.join(',') });
      if (Array.isArray(data)) results.push(...data);
    } catch (e) {
      console.warn(`[ERP] getPrecosMateriais batch ${i}-${i + BATCH} falhou:`, e.message);
    }
  }
  return results;
}

/**
 * Força recarga do catálogo de materiais.
 */
export function clearMateriaisCatalogCache() {
  _materialCatalog = null;
  _catalogExpiry   = null;
}

/**
 * Busca produto pelo codigo2 (referência comercial dos vendedores, ex: "44560").
 * Retorna o primeiro produto encontrado ou null.
 */
export async function getProdutoByCodigo2(codigo2) {
  const data = await erpGet('/produto', { codigo2 });
  const list = Array.isArray(data) ? data : [];
  return list[0] || null;
}

/**
 * Lista clientes do ERP (tipoEntidade=C).
 * @param {string} nome   - filtro por nome (opcional)
 * @param {number} limit  - máximo de resultados (padrão 30)
 */
export async function getEntidades(nome = '', limit = 30, page = 1) {
  const params = { tipoEntidade: 'C', ativo: 'true', page, limit };
  if (nome) params.nome = nome;
  const data = await erpGet('/entidade', params);
  return Array.isArray(data) ? data : [];
}

/**
 * Retorna dados de um cliente específico pelo código (Sisplan).
 * GET /entidade/{codigo}
 */
export async function getEntidade(codigo) {
  return erpGet(`/entidade/${codigo}`);
}

// ─── Delphi null date (1899-12-30) = campo não preenchido no Sisplan ────────
const DELPHI_NULL_PREFIX = '1899-12-30';
const FRESHNESS_MS       = 15 * 24 * 60 * 60 * 1000;

function isMaterialDateStale(dateStr) {
  if (!dateStr)                              return true;
  if (dateStr.startsWith(DELPHI_NULL_PREFIX)) return true; // nunca atualizado
  return (Date.now() - new Date(dateStr).getTime()) > FRESHNESS_MS;
}

function staleDaysFrom(dateStr) {
  if (!dateStr || dateStr.startsWith(DELPHI_NULL_PREFIX)) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Detecção de tecido/malha (matéria-prima principal) ───────────────────────
// Estratégia multi-nível: setor.descricao → descrição do item → codigoImpressao
const FABRIC_KEYWORDS = [
  'TECIDO', 'MALHA', 'FIO', 'FIOS', 'FIBRA', 'FIBRAS',
  'LONA', 'BRIM', 'SARJA', 'JERSEY', 'OXFORD', 'HELANCA',
  'PIQUET', 'MOLETON', 'SPANDEX', 'ELASTANO', 'NYLON',
  'POLIESTER', 'ALGODAO', 'VISCOSE', 'LYCRA', 'MICROFIBRA',
  'NATURAL FIT', 'DRYFIT', 'DRY FIT', 'RIBANA',
];

function hasFabricKeyword(str) {
  if (!str) return false;
  const s = str.toUpperCase();
  return FABRIC_KEYWORDS.some(k => s.includes(k));
}

/**
 * Determina se um item do BOM é tecido/malha (matéria-prima principal).
 * Tenta três estratégias em ordem de confiabilidade:
 *  1. setor.descricao — campo de setor/grupo do Sisplan
 *  2. descrição do item — nome do insumo
 *  3. codigoImpressao === '9' — fallback legado (nem sempre preenchido)
 */
function isFabricItem(item) {
  // 1. Setor (campo TipoPadrao com codigo + descricao)
  const setorDesc = item.setor?.descricao || item.setor?.nome || null;
  if (setorDesc && hasFabricKeyword(setorDesc)) return true;

  // 2. Descrição do item ou referência
  const descricao = item.referencia?.descricao || item.descricao || item.nome || '';
  if (hasFabricKeyword(descricao)) return true;

  // 3. Fallback: codigoImpressao (documentação incompleta do Sisplan)
  if (item.codigoImpressao === '9') return true;

  return false;
}

function mapFormacaoMaterial(item) {
  const dateStr = item.dataAtualizacao || item.data || null;
  const isFabric = isFabricItem(item);
  const stale = isFabric ? isMaterialDateStale(dateStr) : false;
  const quantity = parseFloat(item.quantidade) || 1;
  const unitCost = parseFloat(item.custo) || 0;

  return {
    erpCode: item.referencia?.codigo || item.codigo || null,
    name: item.referencia?.descricao || item.descricao || item.nome || 'Material',
    category: item.codigoImpressao || null,
    isFabric,
    unit: item.unidade || 'un',
    consumption: quantity,
    unitPrice: unitCost,
    costPerPiece: parseFloat(item.valor) || unitCost * quantity || 0,
    erpPriceDate: (!dateStr || dateStr.startsWith(DELPHI_NULL_PREFIX)) ? null : new Date(dateStr),
    isStale: stale,
    staleDays: stale ? staleDaysFrom(dateStr) : null,
    raw: item,
  };
}

function mapConsumoMaterial(item) {
  return {
    erpCode: item.insumo?.codigo || item.referencia?.codigo || item.codigo || null,
    name: item.insumo?.descricao || item.referencia?.descricao || item.descricao || item.nome || 'Material',
    category: item.codigoImpressao || item.insumo?.codigoImpressao || null,
    isFabric: isFabricItem(item),
    unit: item.unidade || item.insumo?.unidade || 'un',
    consumption: parseFloat(item.quantidade || item.consumo) || 1,
    unitPrice: 0,
    costPerPiece: 0,
    erpPriceDate: null,
    isStale: false,
    staleDays: null,
    raw: item,
  };
}

async function enrichMaterialPrices(materials = []) {
  const codes = [...new Set(materials.map((item) => item.erpCode).filter(Boolean))];
  if (!codes.length) return materials;

  const prices = await getPrecosMateriais(codes);
  const map = {};
  prices.forEach((price) => { map[price.codigo] = price; });

  return materials.map((item) => {
    const price = map[item.erpCode];
    if (!price) return item;

    const dateStr = price.data || price.dataAtualizacao || null;
    const unitPrice = parseFloat(price.preco1) || parseFloat(price.precoCompra) || item.unitPrice || 0;
    const isFabric = item.isFabric;
    const stale = isFabric ? isMaterialDateStale(dateStr || '') : false;

    return {
      ...item,
      unitPrice,
      costPerPiece: unitPrice * (parseFloat(item.consumption) || 1),
      erpPriceDate: (!dateStr || dateStr.startsWith(DELPHI_NULL_PREFIX)) ? null : new Date(dateStr),
      isStale: stale,
      staleDays: stale ? staleDaysFrom(dateStr) : null,
      rawPrice: price,
    };
  });
}

/**
 * Busca completa para o wizard de orçamento usando /formacao-preco como fonte primária.
 * Esse endpoint do Sisplan retorna BOM completo + custos de processo já calculados.
 *
 * Estrutura retornada:
 *   produto         — dados do produto (do cache ou /produto/{ref})
 *   formacao        — resposta bruta do /formacao-preco
 *   materials       — itens abreviado="C" (materiais/tecidos/aviamentos) com staleness
 *   fabricationItems — itens abreviado="M" (custos de processo: Costura, Corte, etc.)
 *   markup          — { codigo, descricao } do ERP
 *   precoVenda      — preço de venda atual no ERP
 */
export async function getDadosProdutoParaOrcamento(referencia, forceRefresh = false) {
  // /formacao-preco é a fonte principal — retorna tudo em uma chamada
  const formacao = await getFormacaoPreco(referencia);

  // Produto complementar (dados cadastrais) — usa cache de 15 dias
  let produto = null;
  try {
    produto = await getProdutoByCodigo(referencia, forceRefresh);
  } catch (e) {
    if (e.code === 'ERP_STALE') throw e;
    console.warn(`[ERP] Aviso ao buscar produto ${referencia}:`, e.message);
  }

  // Itens da formação de preço (array principal)
  const itens = Array.isArray(formacao.itens)
    ? formacao.itens
    : Array.isArray(formacao)
      ? formacao
      : [];

  // ─── Materiais (abreviado = "C") ───────────────────────────────────────────
  // Guard 15 dias APENAS para tecidos/malhas (isFabricItem=true).
  // Acessórios, botões, embalagens → sem guard de preço.
  let materials = itens
    .filter(item => item.abreviado === 'C')
    .map(mapFormacaoMaterial);

  if (!materials.length) {
    try {
      const consumos = await getConsumoProduto(referencia);
      materials = await enrichMaterialPrices(
        (Array.isArray(consumos) ? consumos : [consumos])
          .filter(Boolean)
          .map(mapConsumoMaterial)
          .filter((item) => item.erpCode)
      );
    } catch (e) {
      console.warn(`[ERP] Fallback de consumo para ${referencia} falhou:`, e.message);
    }
  }

  // ─── Custos de processo (abreviado = "M") ──────────────────────────────────
  const fabricationItems = itens
    .filter(item => item.abreviado === 'M')
    .map(item => ({
      erpCode:   item.referencia?.codigo   || item.codigo  || null,
      name:      item.referencia?.descricao || item.descricao || 'Processo',
      quantity:  parseFloat(item.quantidade) || 1,
      unitCost:  parseFloat(item.custo)    || 0,
      totalCost: parseFloat(item.valor)    || parseFloat(item.custo) || 0,
      raw:       item,
    }));

  // ─── Markup com índices detalhados do ERP ─────────────────────────────────
  // O markup do Sisplan é divisório: precoVenda = custo / (1 - soma_indices/100)
  // Buscamos os índices para replicar o cálculo localmente com preços atualizados.
  let markupDetalhado = null;
  if (formacao.markup?.codigo) {
    try {
      const mkRaw = await getMarkup(formacao.markup.codigo);
      const indices = Array.isArray(mkRaw.indices) ? mkRaw.indices : [];
      const somaIndices = indices.reduce((s, i) => s + (parseFloat(i.indiceNacional) || 0), 0);
      const coeficiente = somaIndices < 100 ? 1 / (1 - somaIndices / 100) : null;
      markupDetalhado = {
        codigo:       mkRaw.codigo,
        descricao:    mkRaw.descricao,
        indices,
        somaIndices:  parseFloat(somaIndices.toFixed(4)),
        coeficiente:  coeficiente ? parseFloat(coeficiente.toFixed(6)) : null,
      };
    } catch (e) {
      console.warn(`[ERP] Não foi possível buscar índices do markup ${formacao.markup.codigo}:`, e.message);
    }
  }

  return {
    produto:         produto || { referencia },
    formacao,
    materials,
    fabricationItems,
    markup:          markupDetalhado || formacao.markup || null,
    precoVenda:      formacao.precoVenda ?? null,
    // Campos legados
    consumos:        materials,
    precosMateria:   materials,
    errosMateria:    [],
  };
}
