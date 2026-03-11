/**
 * Step2Materials.jsx
 *
 * Regras de negócio:
 * 1. DUPLA VALIDAÇÃO DE TECIDO
 *    - Backend seta isFabric via setor.descricao / descrição / codigoImpressao
 *    - Frontend aplica segunda camada: keywords na descrição do item
 *    - Ambas as camadas em OR → garante que nenhum tecido escape
 *    - Guard 15 dias SOMENTE em tecidos/malhas (+3% frete — calculado na Step4)
 *
 * 2. CHECKLIST DE COMPLETUDE
 *    - Todo item vindo do BOM do ERP exige revisão explícita antes de avançar
 *    - Revisão = confirmar consumo, corrigir preço, ou remover conscientemente
 *    - Itens adicionados manualmente pelo vendedor já nascem confirmados
 */

import { useState, useRef } from 'react';
import {
  AlertTriangle, CheckCircle, Edit2, X, Plus,
  Package, ChevronDown, ChevronUp, Search, Sparkles,
  RefreshCw, Info, ClipboardCheck, CheckSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { materialsAPI } from '../../../services/api';

const FRESHNESS_LIMIT = 15;

// ─── Dupla validação de tecido ────────────────────────────────────────────────
// Camada 1 (backend): isFabric=true ou category==='9'
// Camada 2 (frontend): keyword na descrição — net de segurança caso o backend falhe
const FABRIC_KEYWORDS = [
  'TECIDO', 'MALHA', 'FIO', 'FIOS', 'FIBRA', 'LONA', 'BRIM', 'SARJA',
  'JERSEY', 'OXFORD', 'HELANCA', 'PIQUET', 'MOLETON', 'SPANDEX', 'ELASTANO',
  'NYLON', 'POLIESTER', 'ALGODAO', 'VISCOSE', 'LYCRA', 'MICROFIBRA',
  'NATURAL FIT', 'DRY FIT', 'DRYFIT', 'RIBANA',
];

const hasFabricKeyword = (str) =>
  !!str && FABRIC_KEYWORDS.some((k) => str.toUpperCase().includes(k));

// Retorna true se QUALQUER uma das duas camadas identificar como tecido
const isMaterialFabric = (m) =>
  m.category === '9' || m.isFabric === true || hasFabricKeyword(m.name);

// ─── Stale badge ─────────────────────────────────────────────────────────────
function StaleBadge({ mat }) {
  if (mat.removed) return null;
  if (mat.isStale && !mat.priceOverride) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
        <AlertTriangle className="w-3 h-3" />
        {mat.staleDays}d sem atualização
      </span>
    );
  }
  if (mat.priceOverride) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
        <Edit2 className="w-3 h-3" />
        Preço atualizado manualmente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
      <CheckCircle className="w-3 h-3" />
      Atualizado
    </span>
  );
}

// ─── MaterialRow ─────────────────────────────────────────────────────────────
function MaterialRow({ mat, onOverride, onRemove, onRestore, onConfirm }) {
  const [editing, setEditing]       = useState(false);
  const [newPrice, setNewPrice]     = useState('');
  const [priceNote, setPriceNote]   = useState('');
  const [newConsumption, setNewCons] = useState('');
  const [editingCons, setEditingCons] = useState(false);

  const effectivePrice = mat.priceOverride ?? mat.unitPrice;
  const effectiveCons  = mat.consumptionOverride ?? mat.consumption;
  const costPerPiece   = effectivePrice * effectiveCons;
  const isFabric       = isMaterialFabric(mat);
  const needsReview    = !mat.confirmed && !mat.addedManually && !mat.removed;

  const saveOverride = () => {
    const val = parseFloat(newPrice);
    if (!val || val <= 0) { toast.error('Preço inválido'); return; }
    onOverride(mat.erpCode, val, priceNote);
    setEditing(false);
    setNewPrice('');
  };

  const saveCons = () => {
    const val = parseFloat(newConsumption);
    if (!val || val <= 0) { toast.error('Consumo inválido'); return; }
    onConfirm(mat.erpCode, { consumptionOverride: val });
    setEditingCons(false);
    setNewCons('');
    toast.success('Consumo atualizado');
  };

  if (mat.removed) {
    return (
      <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg opacity-50 border border-dashed border-gray-300">
        <span className="text-sm text-gray-400 line-through">{mat.name}</span>
        <button onClick={() => onRestore(mat.erpCode)} className="text-xs text-orange-600 hover:underline">
          Restaurar
        </button>
      </div>
    );
  }

  return (
    <div className={`border rounded-xl p-3 space-y-2 transition-colors ${
      needsReview
        ? 'border-amber-300 bg-amber-50'
        : mat.isStale && !mat.priceOverride
          ? 'border-red-200 bg-red-50'
          : mat.addedManually
            ? 'border-blue-200 bg-blue-50'
            : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">{mat.name}</span>
            {isFabric && (
              <span className="text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded font-medium">Tecido</span>
            )}
            {mat.addedManually && (
              <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Adicionado</span>
            )}
            {mat.confirmed && !mat.addedManually && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                <CheckSquare className="w-3 h-3" /> Revisado
              </span>
            )}
            {needsReview && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium">
                <ClipboardCheck className="w-3 h-3" /> Revisar
              </span>
            )}
            {isFabric && <StaleBadge mat={mat} />}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Cód: {mat.erpCode} · {effectiveCons} {mat.unit}/peça
          </p>
        </div>
        <button onClick={() => onRemove(mat.erpCode)} className="text-gray-400 hover:text-red-500 shrink-0" title="Remover">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs">Preço/un</span>
            <p className={`font-semibold ${mat.priceOverride ? 'text-blue-700' : mat.isStale && isFabric ? 'text-red-600' : 'text-gray-900'}`}>
              R$ {effectivePrice.toFixed(2)}
            </p>
            {mat.priceOverride && (
              <p className="text-xs text-gray-400 line-through">ERP: R$ {mat.unitPrice.toFixed(2)}</p>
            )}
          </div>
          <div>
            <span className="text-gray-500 text-xs">Custo/peça</span>
            <p className="font-semibold text-gray-900">R$ {costPerPiece.toFixed(2)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditingCons(!editingCons)}
            className="text-xs text-gray-500 hover:text-gray-700 underline">
            {editingCons ? 'Cancelar' : 'Ajustar consumo'}
          </button>
          {isFabric && (
            <button onClick={() => setEditing(!editing)}
              className={`text-xs font-medium underline ${
                mat.isStale && !mat.priceOverride
                  ? 'text-red-600 hover:text-red-700 font-semibold'
                  : 'text-orange-600 hover:text-orange-700'
              }`}>
              {editing ? 'Cancelar' : mat.isStale && !mat.priceOverride ? '⚠ Corrigir preço (obrigatório)' : 'Corrigir preço'}
            </button>
          )}
          {/* Confirmar só aparece se: item pendente E (não é tecido stale sem correção) */}
          {needsReview && !editing && !editingCons && !(isFabric && mat.isStale && !mat.priceOverride) && (
            <button
              onClick={() => onConfirm(mat.erpCode, {})}
              className="text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-lg flex items-center gap-1"
            >
              <CheckSquare className="w-3 h-3" /> Confirmar
            </button>
          )}
        </div>
      </div>

      {/* Ajuste de consumo inline */}
      {editingCons && (
        <div className="border-t border-gray-200 pt-2 space-y-2">
          <p className="text-xs text-gray-600 font-medium">Ajustar consumo por peça</p>
          <div className="flex items-center gap-2">
            <input type="number" step="0.001" min="0.001" value={newConsumption}
              onChange={(e) => setNewCons(e.target.value)}
              placeholder={effectiveCons.toString()} className="input text-sm w-32" autoFocus />
            <span className="text-xs text-gray-400">{mat.unit}/peça</span>
            <button onClick={saveCons} className="btn-primary text-xs py-1.5 px-3">Salvar</button>
          </div>
        </div>
      )}

      {/* Alerta stale (somente tecidos) */}
      {isFabric && mat.isStale && !mat.priceOverride && (
        <div className="flex items-start gap-2 p-2 bg-red-100 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            <strong>Preço desatualizado</strong> — {mat.name} está sem compra há{' '}
            <strong>{mat.staleDays} dias</strong> (limite: {FRESHNESS_LIMIT} dias).
            Solicite ao <strong>setor de compras</strong> ou corrija o preço abaixo.
          </p>
        </div>
      )}

      {/* Correção de preço (somente tecidos) */}
      {isFabric && editing && (
        <div className="border-t border-gray-200 pt-2 space-y-2">
          <p className="text-xs text-gray-600 font-medium">Correção manual de preço</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Novo preço (R$/un)</label>
              <input type="number" step="0.01" min="0" value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder={effectivePrice.toFixed(2)} className="input text-sm mt-0.5" autoFocus />
            </div>
            <div>
              <label className="text-xs text-gray-500">Observação</label>
              <input type="text" value={priceNote} onChange={(e) => setPriceNote(e.target.value)}
                placeholder="Ex: verificado c/ Fornecedor X" className="input text-sm mt-0.5" />
            </div>
          </div>
          <button onClick={saveOverride} className="btn-primary text-xs py-1.5">Salvar correção</button>
        </div>
      )}

      {mat.priceNote && !editing && (
        <p className="text-xs text-blue-600 italic">📝 {mat.priceNote}</p>
      )}
    </div>
  );
}

// ─── SimilarityBadge ─────────────────────────────────────────────────────────
function SimilarityBadge({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 95 ? 'bg-green-100 text-green-700' : pct >= 85 ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700';
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${color}`}>{pct}% similar</span>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────
function ResultCard({ mat, onAdd, isBest }) {
  const [consumption, setConsumption] = useState('1');

  const handleAdd = () => {
    const cons = parseFloat(consumption);
    if (!cons || cons <= 0) { toast.error('Informe o consumo por peça'); return; }
    onAdd(mat, cons);
  };

  return (
    <div className={`border rounded-xl p-3 space-y-2 ${
      isBest ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isBest && (
              <span className="text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                Melhor match
              </span>
            )}
            {mat.similarity !== undefined && <SimilarityBadge value={mat.similarity} />}
            {mat.isFabric && (
              <span className="text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">Tecido</span>
            )}
            {mat.isStale && (
              <span className="text-xs text-red-600 bg-red-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{mat.staleDays}d sem atualização
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 mt-1">{mat.descricao}</p>
          <p className="text-xs text-gray-500">
            Cód: {mat.codigo} · {mat.unidade} {mat.grupo ? `· ${mat.grupo}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-semibold ${mat.isStale ? 'text-red-600' : 'text-gray-900'}`}>
            R$ {(mat.preco || 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">/{mat.unidade}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <label className="text-xs text-gray-500 shrink-0">Consumo/peça</label>
        <input
          type="number" step="0.01" min="0.01"
          value={consumption}
          onChange={(e) => setConsumption(e.target.value)}
          className="input text-sm w-24 py-1"
          placeholder="1"
        />
        <span className="text-xs text-gray-400">{mat.unidade}</span>
        <button onClick={handleAdd} className="btn-primary text-xs py-1 px-3 ml-auto">
          + Adicionar
        </button>
      </div>

      {mat.isStale && (
        <p className="text-xs text-red-600">
          ⚠ {mat.staleReason || 'Preço desatualizado — corrija manualmente após adicionar.'}
        </p>
      )}
    </div>
  );
}

// ─── AddMaterialPanel ─────────────────────────────────────────────────────────
function AddMaterialPanel({ onAdd, onClose }) {
  const [query, setQuery]          = useState('');
  const [mode, setMode]            = useState(null); // 'search' | 'ai'
  const [loading, setLoading]      = useState(false);
  const [searchResults, setSearch] = useState([]);
  const [aiResult, setAiResult]    = useState(null);
  const debounceRef                = useRef(null);

  const runSearch = async (q) => {
    if (q.length < 2) { setSearch([]); return; }
    setLoading(true);
    try {
      const { data } = await materialsAPI.search(q);
      setSearch(data);
    } catch {
      toast.error('Erro ao buscar no ERP');
    } finally {
      setLoading(false);
    }
  };

  const runAI = async () => {
    if (!query.trim()) { toast.error('Descreva o material para a IA buscar'); return; }
    setLoading(true);
    setMode('ai');
    setAiResult(null);
    try {
      const { data } = await materialsAPI.aiSuggest(query);
      setAiResult(data);
      if (!data.bestMatch && !data.alternatives?.length) {
        toast('IA não encontrou material com similaridade ≥ 80%. Tente uma descrição mais específica.', { icon: '🤖' });
      }
    } catch {
      toast.error('Erro ao consultar IA');
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (val) => {
    setQuery(val);
    if (mode === 'search') {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(val), 350);
    }
  };

  const handleAdd = (mat, consumption) => {
    onAdd({
      erpCode:       mat.codigo,
      name:          mat.descricao,
      category:      null,
      isFabric:      mat.isFabric || hasFabricKeyword(mat.descricao),
      unit:          mat.unidade || 'un',
      consumption,
      unitPrice:     mat.preco || 0,
      priceOverride: null,
      priceNote:     null,
      priceSource:   'ERP',
      erpPriceDate:  mat.data ? new Date(mat.data) : null,
      isStale:       mat.isStale,
      staleDays:     mat.staleDays,
      staleReason:   mat.staleReason || null,
      costPerPiece:  (mat.preco || 0) * consumption,
      addedManually: true,   // adicionado pelo vendedor = já confirmado
      confirmed:     true,
      removed:       false,
    });
    toast.success(`${mat.descricao} adicionado`);
  };

  const hasAIResults = aiResult && (aiResult.bestMatch || aiResult.alternatives?.length > 0);

  return (
    <div className="mt-3 p-4 border border-orange-200 rounded-xl bg-orange-50 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-orange-800">Buscar material no ERP</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Ex: malha piquet algodão, tecido oxford, botão pressão..."
          autoFocus
        />
        <button
          onClick={() => { setMode('search'); runSearch(query); }}
          disabled={loading || query.length < 2}
          className="btn-secondary text-xs px-3 flex items-center gap-1 disabled:opacity-50"
          title="Busca textual no catálogo ERP"
        >
          <Search className="w-3.5 h-3.5" />
          ERP
        </button>
        <button
          onClick={runAI}
          disabled={loading || !query.trim()}
          className="btn-primary text-xs px-3 flex items-center gap-1 disabled:opacity-50 bg-purple-600 hover:bg-purple-700"
          title="IA sugere melhor match + similares ≥ 80%"
        >
          <Sparkles className="w-3.5 h-3.5" />
          IA
        </button>
      </div>

      <p className="text-xs text-orange-600 flex items-start gap-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>ERP</strong>: busca por texto no catálogo. &nbsp;
          <strong>IA</strong>: interpreta a descrição e sugere o material correto + até 10 similares (≥ 80%).
          Regra dos {FRESHNESS_LIMIT} dias aplicada em ambos.
        </span>
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {mode === 'ai' ? 'Consultando IA...' : 'Buscando no ERP...'}
        </div>
      )}

      {!loading && mode === 'search' && searchResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">{searchResults.length} resultado(s) no ERP</p>
          {searchResults.map((mat) => (
            <ResultCard key={mat.codigo} mat={mat} onAdd={handleAdd} isBest={false} />
          ))}
        </div>
      )}
      {!loading && mode === 'search' && searchResults.length === 0 && query.length >= 2 && (
        <p className="text-sm text-gray-500 py-2 text-center">Nenhum material encontrado. Tente a IA.</p>
      )}

      {!loading && mode === 'ai' && hasAIResults && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">
            Sugestões da IA
            {aiResult.alternatives?.length > 0 && ` · ${aiResult.alternatives.length} alternativa(s)`}
          </p>
          {aiResult.bestMatch && (
            <ResultCard mat={aiResult.bestMatch} onAdd={handleAdd} isBest />
          )}
          {aiResult.alternatives?.map((mat) => (
            <ResultCard key={mat.codigo} mat={mat} onAdd={handleAdd} isBest={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step2Materials (principal) ───────────────────────────────────────────────
export default function Step2Materials({ data, update, onNext, onBack }) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showRemoved, setShowRemoved]   = useState(false);

  const materials   = data.materials || [];
  const activeMats  = materials.filter((m) => !m.removed);
  const removedMats = materials.filter((m) => m.removed);

  // Regra 1 — guard 15 dias (somente tecidos sem override)
  const staleBlocking = activeMats.filter((m) => isMaterialFabric(m) && m.isStale && !m.priceOverride);

  // Regra 2 — precisa de pelo menos 1 tecido/malha
  const hasTecido = activeMats.some(isMaterialFabric);

  // Regra 3 — checklist: itens do BOM que ainda não foram revisados
  const pendingReview = activeMats.filter((m) => !m.confirmed && !m.addedManually);

  const canProceed =
    staleBlocking.length === 0 &&
    activeMats.length > 0 &&
    hasTecido &&
    pendingReview.length === 0;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const updateMat = (erpCode, patch) =>
    update({ materials: materials.map((m) => m.erpCode === erpCode ? { ...m, ...patch } : m) });

  const handleConfirm = (erpCode, extraPatch = {}) =>
    updateMat(erpCode, { confirmed: true, ...extraPatch });

  const handleOverride = (erpCode, newPrice, note) => {
    updateMat(erpCode, {
      priceOverride: newPrice,
      priceNote:     note || `Preço corrigido em ${new Date().toLocaleDateString('pt-BR')}`,
      priceSource:   'MANUAL',
      isStale:       false,
      confirmed:     true, // corrigir preço = revisão concluída
    });
    toast.success('Preço corrigido');
  };

  const handleRemove = (erpCode) =>
    updateMat(erpCode, { removed: true, confirmed: true }); // remover = decisão consciente

  const handleRestore = (erpCode) =>
    updateMat(erpCode, { removed: false, confirmed: false }); // restaurar volta a pendente

  const handleAddFromERP = (mat) => {
    if (materials.some((m) => m.erpCode === mat.erpCode)) {
      toast.error('Material já está na lista');
      return;
    }
    update({ materials: [...materials, mat] });
    setShowAddPanel(false);
  };

  // Confirmar todos os pendentes de uma vez
  const handleConfirmAll = () => {
    // Tecidos stale sem correção NÃO podem ser confirmados em lote — exigem correção de preço
    const staleFabrics = pendingReview.filter((m) => isMaterialFabric(m) && m.isStale && !m.priceOverride);
    const confirmable  = pendingReview.filter((m) => !(isMaterialFabric(m) && m.isStale && !m.priceOverride));

    if (!confirmable.length && staleFabrics.length) {
      toast.error(`Corrija o preço dos ${staleFabrics.length} tecido(s) desatualizado(s) primeiro`);
      return;
    }

    update({
      materials: materials.map((m) => {
        const canConfirm = !m.confirmed && !m.addedManually && !m.removed &&
          !(isMaterialFabric(m) && m.isStale && !m.priceOverride);
        return canConfirm ? { ...m, confirmed: true } : m;
      }),
    });

    if (staleFabrics.length) {
      toast(`${confirmable.length} item(ns) confirmado(s). Corrija o preço dos ${staleFabrics.length} tecido(s) restante(s).`, { icon: '⚠️' });
    } else {
      toast.success('Todos os itens confirmados');
    }
  };

  const totalMaterial = activeMats.reduce((sum, m) => {
    const price = m.priceOverride ?? m.unitPrice ?? 0;
    const cons  = m.consumptionOverride ?? m.consumption ?? 1;
    return sum + price * cons;
  }, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 2 — Matéria-Prima</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Revise todos os itens do BOM. Confirme consumo, corrija preços ou remova o que não se aplica.
        </p>
      </div>

      {/* ── Checklist de revisão ────────────────────────────────────────────── */}
      {pendingReview.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {pendingReview.length} item(ns) aguardando revisão
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Verifique cada item do ERP: confirme o consumo, corrija o preço ou remova se não se aplica.
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {pendingReview.map((m) => {
                    const needsPriceCorrection = isMaterialFabric(m) && m.isStale && !m.priceOverride;
                    return (
                      <li key={m.erpCode} className="text-xs text-amber-800 flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${needsPriceCorrection ? 'bg-red-500' : 'bg-amber-500'}`} />
                        {m.name}
                        {needsPriceCorrection
                          ? <span className="text-red-600 font-semibold">(corrigir preço — obrigatório)</span>
                          : isMaterialFabric(m) && <span className="text-purple-600 font-medium">(tecido)</span>
                        }
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <button
              onClick={handleConfirmAll}
              className="shrink-0 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg whitespace-nowrap"
            >
              Confirmar todos
            </button>
          </div>
        </div>
      )}

      {/* ── Alerta: sem tecido ──────────────────────────────────────────────── */}
      {!hasTecido && activeMats.length > 0 && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-purple-800">Nenhum tecido / malha identificado</p>
            <p className="text-xs text-purple-700 mt-0.5">
              O produto precisa de pelo menos um tecido ou malha principal.
              Adicione via busca ERP ou sugestão IA para continuar.
            </p>
          </div>
        </div>
      )}

      {/* ── Alerta: stale ───────────────────────────────────────────────────── */}
      {staleBlocking.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {staleBlocking.length} tecido(s) com preço desatualizado
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Corrija os preços abaixo ou solicite atualização ao setor de compras.
            </p>
            <ul className="mt-1 space-y-0.5">
              {staleBlocking.map((m) => (
                <li key={m.erpCode} className="text-xs text-red-700">
                  · {m.name} — {m.staleDays} dias sem atualização
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Lista vazia ─────────────────────────────────────────────────────── */}
      {activeMats.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum material. Busque o produto no ERP na etapa anterior.</p>
        </div>
      )}

      {/* ── Lista de materiais ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        {activeMats.map((mat) => (
          <MaterialRow
            key={mat.erpCode}
            mat={mat}
            onOverride={handleOverride}
            onRemove={handleRemove}
            onRestore={handleRestore}
            onConfirm={handleConfirm}
          />
        ))}
      </div>

      {/* ── Materiais removidos ─────────────────────────────────────────────── */}
      {removedMats.length > 0 && (
        <div>
          <button onClick={() => setShowRemoved(!showRemoved)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
            {showRemoved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {removedMats.length} material(is) removido(s)
          </button>
          {showRemoved && (
            <div className="mt-2 space-y-1">
              {removedMats.map((mat) => (
                <MaterialRow key={mat.erpCode} mat={mat}
                  onOverride={handleOverride} onRemove={handleRemove}
                  onRestore={handleRestore} onConfirm={handleConfirm} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Adicionar via ERP / IA ──────────────────────────────────────────── */}
      <div>
        {!showAddPanel && (
          <button onClick={() => setShowAddPanel(true)}
            className="flex items-center gap-2 text-sm text-orange-600 font-medium hover:text-orange-700">
            <Plus className="w-4 h-4" />
            {!hasTecido ? 'Adicionar tecido / material (obrigatório)' : 'Adicionar material / aviamento extra'}
          </button>
        )}
        {showAddPanel && (
          <AddMaterialPanel onAdd={handleAddFromERP} onClose={() => setShowAddPanel(false)} />
        )}
      </div>

      {/* ── Total matéria-prima ─────────────────────────────────────────────── */}
      {totalMaterial > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Total Matéria-Prima</p>
          <div className="space-y-1 text-sm">
            {activeMats.map((m) => {
              const price = m.priceOverride ?? m.unitPrice ?? 0;
              const cons  = m.consumptionOverride ?? m.consumption ?? 1;
              const cost  = price * cons;
              return (
                <div key={m.erpCode} className="flex justify-between text-gray-600">
                  <span className="truncate max-w-[200px]">
                    {m.name} ({cons} {m.unit})
                    {isMaterialFabric(m) && <span className="text-purple-500 text-xs ml-1">●</span>}
                  </span>
                  <span>R$ {cost.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="flex justify-between pt-1.5 border-t border-orange-200 font-semibold">
              <span>Total</span>
              <span className="text-orange-700">R$ {totalMaterial.toFixed(2)}/peça</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">● = tecido/malha (inclui +3% frete na etapa de precificação)</p>
        </div>
      )}

      {/* ── Navegação ───────────────────────────────────────────────────────── */}
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">← Voltar</button>
        <button onClick={onNext} disabled={!canProceed}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          Próxima Etapa →
        </button>
      </div>

      {!canProceed && (
        <p className="text-xs text-red-600 text-right -mt-2">
          {pendingReview.length > 0
            ? `Revise os ${pendingReview.length} item(ns) pendentes para avançar`
            : staleBlocking.length > 0
              ? 'Corrija os preços de tecidos desatualizados para avançar'
              : !hasTecido
                ? 'Adicione um tecido/malha para avançar'
                : 'Adicione pelo menos um material para avançar'}
        </p>
      )}
    </div>
  );
}
