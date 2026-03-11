/**
 * CostsPage.jsx — Tabela de custos de fabricação (editável)
 * Acesso: ADMIN e COMPRADOR
 * Dados reais: ManufacturingCost { referencia, descricao, categoria, basePrice, tiers, extras }
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Edit2, X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { costsAPI } from '../services/api';

const CATEGORY_LABEL = {
  camisaria:     'Camisaria (M.O. Costura)',
  polo:          'Polo',
  camiseta:      'Camiseta / Regata',
  calca:         'Calça',
  bermuda:       'Bermuda',
  blazer:        'Blazer / Paletó',
  vestido:       'Vestido',
  colete:        'Colete',
  jaleco:        'Jaleco',
  jaqueta:       'Jaqueta',
  moletom:       'Moletom / Suéter',
  dolma:         'Dolmã',
  avental:       'Avental',
  talhacao:      'Talhação / Corte',
  embalagem:     'Embalagem',
  estamparia:    'Estamparia / Silk',
  sublimacao:    'Sublimação',
  caseado_botao: 'Caseado e Botão',
  outros:        'Outros',
};

const TIER_KEYS  = ['ate500', 'ate1000', 'ate3000', 'ate5000', 'acima5000'];
const TIER_LABEL = { ate500: '≤500', ate1000: '≤1000', ate3000: '≤3000', ate5000: '≤5000', acima5000: '>5000' };

const fmt = (v) => (v != null ? `R$ ${Number(v).toFixed(2)}` : '—');

// ─── Modal de edição ──────────────────────────────────────────────────────────
function EditModal({ cost, onClose, onSaved }) {
  // Tiers "padrão" têm as chaves ate500/ate1000/... — talhacao e estamparia têm estrutura diferente
  const isStandardTiers = cost.tiers && TIER_KEYS.some(k => cost.tiers[k] != null);
  const hasComplexTiers = cost.tiers && !isStandardTiers;
  const hasExtras = cost.extras && Object.keys(cost.extras).length > 0;

  const [basePrice, setBasePrice]   = useState(String(cost.basePrice ?? ''));
  const [tiers,     setTiers]       = useState(isStandardTiers ? { ...cost.tiers } : {});
  const [tiersJson, setTiersJson]   = useState(hasComplexTiers ? JSON.stringify(cost.tiers, null, 2) : '');
  const [extras,    setExtras]      = useState(hasExtras ? { ...cost.extras } : {});
  const [saving, setSaving] = useState(false);

  const qc = useQueryClient();

  const handleSave = async () => {
    const base = parseFloat(basePrice);
    if (isNaN(base) || base < 0) { toast.error('Preço base inválido'); return; }

    let parsedTiers = null;
    if (isStandardTiers) {
      parsedTiers = {};
      for (const k of TIER_KEYS) {
        if (tiers[k] !== undefined && tiers[k] !== '') {
          const v = parseFloat(tiers[k]);
          if (isNaN(v)) { toast.error(`Valor inválido para faixa ${TIER_LABEL[k]}`); return; }
          parsedTiers[k] = v;
        }
      }
    } else if (hasComplexTiers) {
      try { parsedTiers = JSON.parse(tiersJson); }
      catch { toast.error('JSON das faixas inválido'); return; }
    }
    const parsedExtras = {};
    for (const k of Object.keys(extras)) {
      const v = parseFloat(extras[k]);
      if (isNaN(v)) { toast.error(`Valor inválido para extra "${k}"`); return; }
      parsedExtras[k] = v;
    }

    setSaving(true);
    try {
      const { data } = await costsAPI.update(cost.id, {
        basePrice: base,
        tiers:     parsedTiers && Object.keys(parsedTiers).length ? parsedTiers : null,
        extras:    Object.keys(parsedExtras).length ? parsedExtras : null,
      });
      qc.invalidateQueries(['costs-grouped']);
      onSaved(data.cost);
      toast.success('Custo atualizado');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{cost.descricao}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ref: {cost.referencia} · {CATEGORY_LABEL[cost.categoria] || cost.categoria}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Preço base */}
          <div>
            <label className="text-xs font-medium text-gray-700">Preço base (R$)</label>
            <input
              type="number" step="0.01" min="0"
              className="input mt-1"
              value={basePrice}
              onChange={e => setBasePrice(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Usado quando não há faixa definida para a quantidade.</p>
          </div>

          {/* Faixas padrão (ate500 / ate1000 / ...) */}
          {isStandardTiers && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Faixas por quantidade (R$ / peça)</label>
              <div className="grid grid-cols-5 gap-2">
                {TIER_KEYS.map(k => (
                  <div key={k}>
                    <label className="text-xs text-gray-500 block mb-1">{TIER_LABEL[k]}</label>
                    <input
                      type="number" step="0.01" min="0"
                      className="input text-sm"
                      value={tiers[k] ?? ''}
                      onChange={e => setTiers(p => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tiers complexos (talhação, estamparia — estrutura array/matrix) */}
          {hasComplexTiers && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Faixas (JSON avançado)</label>
              <textarea
                className="input text-xs font-mono h-32 resize-none"
                value={tiersJson}
                onChange={e => setTiersJson(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Estrutura de faixas em formato JSON. Editar com cuidado.</p>
            </div>
          )}

          {/* Extras */}
          {hasExtras && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Acréscimos (R$ / peça)</label>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(extras).map(k => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 capitalize w-24 shrink-0">{k}</span>
                    <input
                      type="number" step="0.01" min="0"
                      className="input text-sm"
                      value={extras[k] ?? ''}
                      onChange={e => setExtras(p => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            <Check className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Seção de categoria ───────────────────────────────────────────────────────
function CategorySection({ categoria, items }) {
  const [open, setOpen] = useState(true);
  const [editCost, setEditCost] = useState(null);

  // Verifica se algum item nesta categoria tem tiers padrão (ate500/ate1000/...)
  const anyStandardTiers = items.some(i => i.tiers && TIER_KEYS.some(k => i.tiers[k] != null));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="font-semibold text-sm text-gray-800">{CATEGORY_LABEL[categoria] || categoria}</span>
          <span className="text-xs text-gray-400">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-20">Ref.</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Descrição</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Preço Base</th>
                {anyStandardTiers && TIER_KEYS.map(k => (
                  <th key={k} className="text-right px-3 py-2 text-xs font-medium text-gray-500">{TIER_LABEL[k]}</th>
                ))}
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-orange-50/40 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{item.referencia}</td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {item.descricao}
                    {item.subcategoria && (
                      <span className="ml-2 text-xs text-gray-400">({item.subcategoria})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(item.basePrice)}</td>
                  {anyStandardTiers && TIER_KEYS.map(k => (
                    <td key={k} className="px-3 py-2.5 text-right text-gray-600 text-xs">
                      {item.tiers?.[k] != null ? `R$ ${Number(item.tiers[k]).toFixed(2)}` : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setEditCost(item)}
                      className="p-1.5 text-gray-400 hover:text-orange-600 rounded-lg hover:bg-orange-50"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editCost && (
        <EditModal
          cost={editCost}
          onClose={() => setEditCost(null)}
          onSaved={() => setEditCost(null)}
        />
      )}
    </div>
  );
}

// ─── CostsPage ────────────────────────────────────────────────────────────────
export default function CostsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['costs-grouped'],
    queryFn:  () => costsAPI.grouped(),
    staleTime: 60_000,
  });

  const grouped = data?.data?.grouped || {};
  const totalItems = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);

  // Ordenação de categorias
  const CATEGORY_ORDER = [
    'camisaria', 'polo', 'camiseta', 'calca', 'bermuda', 'blazer',
    'vestido', 'colete', 'jaleco', 'jaqueta', 'moletom', 'dolma', 'avental',
    'talhacao', 'embalagem', 'caseado_botao', 'estamparia', 'sublimacao', 'outros',
  ];
  const sortedCategories = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-orange-500" />
            Custos de Fabricação
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Carregando...' : `${totalItems} itens em ${sortedCategories.length} categorias — clique em Editar para ajustar valores`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando tabela de custos...</div>
      ) : sortedCategories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Nenhum custo cadastrado.</div>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map(cat => (
            <CategorySection key={cat} categoria={cat} items={grouped[cat]} />
          ))}
        </div>
      )}
    </div>
  );
}
