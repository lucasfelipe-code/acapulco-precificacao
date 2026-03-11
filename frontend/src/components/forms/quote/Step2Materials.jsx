/**
 * Step2Materials.jsx
 * Exibe o BOM (Bill of Materials) do produto vindo do ERP.
 * Cada material mostra: nome, consumo, preço ERP, status de frescor.
 * Lucas pode corrigir o preço de um material stale (override manual).
 * Materiais do BOM podem ser removidos; novos podem ser adicionados manualmente.
 */

import { useState } from 'react';
import {
  AlertTriangle, CheckCircle, Edit2, X, Plus,
  Package, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const FRESHNESS_LIMIT = 15;

function staleBadge(mat) {
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

function MaterialRow({ mat, onOverride, onRemove, onRestore }) {
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [priceNote, setPriceNote] = useState('');

  const effectivePrice = mat.priceOverride ?? mat.unitPrice;
  const costPerPiece   = effectivePrice * mat.consumption;

  const saveOverride = () => {
    const val = parseFloat(newPrice);
    if (!val || val <= 0) { toast.error('Preço inválido'); return; }
    onOverride(mat.erpCode, val, priceNote);
    setEditing(false);
    setNewPrice('');
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
      mat.isStale && !mat.priceOverride
        ? 'border-red-200 bg-red-50'
        : mat.addedManually
          ? 'border-blue-200 bg-blue-50'
          : 'border-gray-200 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">{mat.name}</span>
            {mat.addedManually && (
              <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Adicionado</span>
            )}
            {staleBadge(mat)}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Cód: {mat.erpCode} · {mat.consumption} {mat.unit}/peça
            {mat.category && ` · ${mat.category}`}
          </p>
        </div>
        <button
          onClick={() => onRemove(mat.erpCode)}
          className="text-gray-400 hover:text-red-500 shrink-0"
          title="Remover do orçamento"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preços */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs">Preço/un</span>
            <p className={`font-semibold ${mat.priceOverride ? 'text-blue-700' : mat.isStale ? 'text-red-600' : 'text-gray-900'}`}>
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
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-orange-600 hover:text-orange-700 font-medium underline"
        >
          {editing ? 'Cancelar' : 'Corrigir preço'}
        </button>
      </div>

      {/* Alerta de material stale */}
      {mat.isStale && !mat.priceOverride && (
        <div className="flex items-start gap-2 p-2 bg-red-100 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            <strong>Preço desatualizado</strong> — o material <strong>{mat.name}</strong> está sem compra
            há <strong>{mat.staleDays} dias</strong> (limite: {FRESHNESS_LIMIT} dias).
            Solicite atualização ao <strong>setor de compras</strong> ou corrija o preço abaixo
            após verificar com o fornecedor.
          </p>
        </div>
      )}

      {/* Override de preço */}
      {editing && (
        <div className="border-t border-gray-200 pt-2 space-y-2">
          <p className="text-xs text-gray-600 font-medium">Correção manual de preço</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Novo preço (R$/un)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder={effectivePrice.toFixed(2)}
                className="input text-sm mt-0.5"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Observação</label>
              <input
                type="text"
                value={priceNote}
                onChange={(e) => setPriceNote(e.target.value)}
                placeholder="Ex: verificado c/ Fornecedor X"
                className="input text-sm mt-0.5"
              />
            </div>
          </div>
          <button onClick={saveOverride} className="btn-primary text-xs py-1.5">
            Salvar correção
          </button>
        </div>
      )}

      {/* Nota de override salva */}
      {mat.priceNote && !editing && (
        <p className="text-xs text-blue-600 italic">📝 {mat.priceNote}</p>
      )}
    </div>
  );
}

export default function Step2Materials({ data, update, onNext, onBack }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMat, setNewMat]           = useState({ name: '', erpCode: '', unit: 'un', consumption: 1, unitPrice: 0 });
  const [showRemoved, setShowRemoved] = useState(false);

  const materials    = data.materials || [];
  const activeMats   = materials.filter((m) => !m.removed);
  const removedMats  = materials.filter((m) => m.removed);
  const staleBlocking = activeMats.filter((m) => m.isStale && !m.priceOverride);

  const updateMat = (erpCode, patch) => {
    update({
      materials: materials.map((m) =>
        m.erpCode === erpCode ? { ...m, ...patch } : m
      ),
    });
  };

  const handleOverride = (erpCode, newPrice, note) => {
    updateMat(erpCode, {
      priceOverride: newPrice,
      priceNote:     note || `Preço corrigido em ${new Date().toLocaleDateString('pt-BR')}`,
      priceSource:   'MANUAL',
      isStale:       false, // override resolve o stale
    });
    toast.success('Preço corrigido');
  };

  const handleRemove = (erpCode) => {
    updateMat(erpCode, { removed: true });
  };

  const handleRestore = (erpCode) => {
    updateMat(erpCode, { removed: false });
  };

  const handleAddManual = () => {
    if (!newMat.name || !newMat.unitPrice) {
      toast.error('Nome e preço obrigatórios');
      return;
    }
    const mat = {
      erpCode:       `MANUAL-${Date.now()}`,
      name:          newMat.name,
      category:      newMat.category || 'aviamento',
      unit:          newMat.unit || 'un',
      consumption:   parseFloat(newMat.consumption) || 1,
      unitPrice:     parseFloat(newMat.unitPrice),
      priceOverride: null,
      priceNote:     newMat.priceNote || null,
      priceSource:   'MANUAL',
      erpPriceDate:  null,
      isStale:       false,
      staleDays:     null,
      costPerPiece:  parseFloat(newMat.unitPrice) * (parseFloat(newMat.consumption) || 1),
      addedManually: true,
      removed:       false,
    };
    update({ materials: [...materials, mat] });
    setNewMat({ name: '', erpCode: '', unit: 'un', consumption: 1, unitPrice: 0 });
    setShowAddForm(false);
    toast.success('Material adicionado');
  };

  // Total de matéria-prima
  const totalMaterial = activeMats.reduce((sum, m) => {
    const price = m.priceOverride ?? m.unitPrice ?? 0;
    return sum + price * (m.consumption ?? 1);
  }, 0);

  const canProceed = staleBlocking.length === 0 && activeMats.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 2 — Matéria-Prima</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Materiais do BOM do ERP. Corrija preços desatualizados antes de continuar.
        </p>
      </div>

      {/* Alerta global de stale */}
      {staleBlocking.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {staleBlocking.length} material(is) com preço desatualizado
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Corrija os preços abaixo (após verificar com os fornecedores) para liberar o orçamento.
              Ou solicite ao setor de compras que atualize a última compra no ERP.
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

      {/* Lista de materiais */}
      {activeMats.length === 0 && !data.erpProductData && (
        <div className="text-center py-8 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum material. Busque o produto no ERP na etapa anterior.</p>
        </div>
      )}

      <div className="space-y-2">
        {activeMats.map((mat) => (
          <MaterialRow
            key={mat.erpCode}
            mat={mat}
            onOverride={handleOverride}
            onRemove={handleRemove}
            onRestore={handleRestore}
          />
        ))}
      </div>

      {/* Materiais removidos */}
      {removedMats.length > 0 && (
        <div>
          <button
            onClick={() => setShowRemoved(!showRemoved)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            {showRemoved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {removedMats.length} material(is) removido(s)
          </button>
          {showRemoved && (
            <div className="mt-2 space-y-1">
              {removedMats.map((mat) => (
                <MaterialRow
                  key={mat.erpCode}
                  mat={mat}
                  onOverride={handleOverride}
                  onRemove={handleRemove}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Adicionar material manual */}
      <div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 text-sm text-orange-600 font-medium hover:text-orange-700"
        >
          <Plus className="w-4 h-4" />
          Adicionar material / aviamento extra
        </button>

        {showAddForm && (
          <div className="mt-3 p-4 border border-orange-200 rounded-xl bg-orange-50 space-y-3">
            <p className="text-xs text-orange-700 font-medium">
              Use para aviamentos personalizados ou materiais não cadastrados no ERP.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Nome do material</label>
                <input
                  className="input"
                  value={newMat.name}
                  onChange={(e) => setNewMat({ ...newMat, name: e.target.value })}
                  placeholder="Ex: Botão personalizado logo cliente"
                />
              </div>
              <div>
                <label className="label">Preço unitário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={newMat.unitPrice || ''}
                  onChange={(e) => setNewMat({ ...newMat, unitPrice: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="label">Consumo por peça</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={newMat.consumption || ''}
                  onChange={(e) => setNewMat({ ...newMat, consumption: e.target.value })}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="label">Unidade</label>
                <select className="input" value={newMat.unit} onChange={(e) => setNewMat({ ...newMat, unit: e.target.value })}>
                  <option value="un">Unidade</option>
                  <option value="m">Metro</option>
                  <option value="kg">Kg</option>
                  <option value="par">Par</option>
                </select>
              </div>
              <div>
                <label className="label">Observação</label>
                <input
                  className="input"
                  value={newMat.priceNote || ''}
                  onChange={(e) => setNewMat({ ...newMat, priceNote: e.target.value })}
                  placeholder="Ex: cotado com Fornecedor X"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddManual} className="btn-primary text-sm">Adicionar</button>
              <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Prévia de custo total */}
      {totalMaterial > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Total Matéria-Prima</p>
          <div className="space-y-1 text-sm">
            {activeMats.map((m) => {
              const price = m.priceOverride ?? m.unitPrice ?? 0;
              const cost  = price * (m.consumption ?? 1);
              return (
                <div key={m.erpCode} className="flex justify-between text-gray-600">
                  <span className="truncate max-w-[200px]">{m.name} ({m.consumption} {m.unit})</span>
                  <span>R$ {cost.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="flex justify-between pt-1.5 border-t border-orange-200 font-semibold">
              <span>Total</span>
              <span className="text-orange-700">R$ {totalMaterial.toFixed(2)}/peça</span>
            </div>
          </div>
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">← Voltar</button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Próxima Etapa →
        </button>
      </div>

      {!canProceed && staleBlocking.length > 0 && (
        <p className="text-xs text-red-600 text-right -mt-2">
          Corrija os preços desatualizados para avançar
        </p>
      )}
    </div>
  );
}
