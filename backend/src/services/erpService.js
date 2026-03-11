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
 */
export async function getMateriaisCatalog() {
  if (_materialCatalog && Date.now() < _catalogExpiry) return _materialCatalog;

  // /material suporta ativo + limit (ao contrário de /precomaterial que requer codigo)
  const data = await erpGet('/material', { ativo: 'true', limit: 500 });
  _materialCatalog = Array.isArray(data) ? data : [];
  _catalogExpiry   = Date.now() + CATALOG_TTL_MS;
  return _materialCatalog;
}

/**
 * Busca preços de múltiplos materiais em uma única chamada ao ERP.
 * GET /precomaterial?codigo=001,002,003
 * Retorna array com: codigo, descricao, preco1, precoCompra, data, unidade.
 * O campo `data` = data da última entrada de NF — base do guard de 15 dias.
 */
export async function getPrecosMateriais(codigos = []) {
  if (!codigos.length) return [];
  const data = await erpGet('/precomaterial', { codigo: codigos.join(',') });
  return Array.isArray(data) ? data : [];
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
export async function getEntidades(nome = '', limit = 30) {
  const params = { tipoEntidade: 'C', ativo: 'true', limit };
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
  // codigoImpressao: "9" = tecido principal → sujeito ao guard dos 15 dias
  //                  outros (acessório, embalagem, etc.) → sem guard de preço
  const materials = itens
    .filter(item => item.abreviado === 'C')
    .map(item => {
      const dateStr    = item.dataAtualizacao || item.data || null;
      const isFabric   = item.codigoImpressao === '9'; // tecido/malha principal
      const stale      = isFabric ? isMaterialDateStale(dateStr) : false;
      const staleDaysV = stale ? staleDaysFrom(dateStr) : null;

      return {
        erpCode:      item.referencia?.codigo   || item.codigo  || null,
        name:         item.referencia?.descricao || item.descricao || item.nome || 'Material',
        // codigoImpressao: "9"=tecido principal, "2"=acessório, "3"=embalagem
        category:     item.codigoImpressao    || null,
        isFabric,
        unit:         item.unidade            || 'un',
        consumption:  parseFloat(item.quantidade) || 1,
        unitPrice:    parseFloat(item.custo)  || 0,
        costPerPiece: parseFloat(item.valor)  || parseFloat(item.custo) * (parseFloat(item.quantidade) || 1) || 0,
        erpPriceDate: (!dateStr || dateStr.startsWith(DELPHI_NULL_PREFIX)) ? null : new Date(dateStr),
        isStale:      stale,
        staleDays:    staleDaysV,
        raw:          item,
      };
    });

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
