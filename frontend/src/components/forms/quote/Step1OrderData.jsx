import { useState } from 'react';
import { Search, AlertTriangle, CheckCircle, RefreshCw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { productsAPI } from '../../../services/api';
import { formatDate } from '../../../utils/format';

const SEGMENTS = ['Saúde', 'Indústria', 'Corporativo', 'Educação', 'Gastronomia', 'Segurança', 'Outro'];
const ITEM_TYPES = ['Jaleco', 'Camisa Social', 'Camiseta', 'Calça', 'Avental', 'Colete', 'Bermuda', 'Saia', 'Peça Avulsa'];
const ORDER_TYPES = [{ value: 'RETAIL', label: 'Varejo' }, { value: 'WHOLESALE', label: 'Atacado' }];
const SIZE_OPTIONS = ['PP', 'P', 'M', 'G', 'GG', 'XGG', '36', '38', '40', '42', '44', '46', '48'];
const COLOR_OPTIONS = ['Branco', 'Preto', 'Azul Marinho', 'Azul Royal', 'Cinza', 'Vermelho', 'Verde', 'Amarelo', 'Laranja'];

export default function Step1OrderData({ data, update, onNext }) {
  const [searching, setSearching] = useState(false);
  const [erpError, setErpError] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);

  const searchERP = async (forceRefresh = false) => {
    if (!data.reference) {
      toast.error('Digite a referência do produto');
      return;
    }

    setSearching(true);
    setErpError(null);

    try {
      const { data: res } = await productsAPI.getByReference(data.reference, forceRefresh);
      const product = res.product;
      const freshness = res.freshness;

      update({
        productName: product.name,
        itemType: product.itemType || data.itemType,
        fabricType: product.fabricType || data.fabricType,
        erpProductData: product,
        erpFetchedAt: freshness.fetchedAt,
      });

      const msg = freshness.fromCache
        ? `Produto encontrado (cache ${freshness.daysOld}d atrás)`
        : 'Produto encontrado no ERP';
      toast.success(msg);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'ERP_DATA_STALE') {
        setErpError({
          type: 'stale',
          message: errData.error,
          details: errData.details,
        });
      } else {
        setErpError({
          type: 'error',
          message: errData?.error || 'Produto não encontrado no ERP',
        });
      }
    } finally {
      setSearching(false);
    }
  };

  const toggleSize = (size) => {
    const next = selectedSizes.includes(size)
      ? selectedSizes.filter((s) => s !== size)
      : [...selectedSizes, size];
    setSelectedSizes(next);
    update({ variations: [...next.map((v) => ({ type: 'SIZE', value: v })), ...selectedColors.map((c) => ({ type: 'COLOR', value: c }))] });
  };

  const toggleColor = (color) => {
    const next = selectedColors.includes(color)
      ? selectedColors.filter((c) => c !== color)
      : [...selectedColors, color];
    setSelectedColors(next);
    update({ variations: [...selectedSizes.map((s) => ({ type: 'SIZE', value: s })), ...next.map((c) => ({ type: 'COLOR', value: c }))] });
  };

  const canProceed = data.clientName && data.reference && data.quantity >= 1 && data.erpProductData;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 1 — Dados do Pedido</h2>
        <p className="text-sm text-gray-500 mt-0.5">Informe o cliente e busque o produto pelo ERP</p>
      </div>

      {/* Client info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Nome do Cliente *</label>
          <input
            className="input"
            value={data.clientName}
            onChange={(e) => update({ clientName: e.target.value })}
            placeholder="Ex: Hospital São Lucas"
          />
        </div>
        <div>
          <label className="label">Segmento</label>
          <select className="input" value={data.clientSegment} onChange={(e) => update({ clientSegment: e.target.value })}>
            <option value="">Selecione...</option>
            {SEGMENTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ERP reference search */}
      <div>
        <label className="label">Referência do Produto (ERP) *</label>
        <div className="flex gap-2">
          <input
            className="input"
            value={data.reference}
            onChange={(e) => { update({ reference: e.target.value, erpProductData: null, erpFetchedAt: null }); setErpError(null); }}
            placeholder="Ex: JL-0042"
            onKeyDown={(e) => e.key === 'Enter' && searchERP()}
          />
          <button
            type="button"
            onClick={() => searchERP()}
            disabled={searching || !data.reference}
            className="btn-primary shrink-0"
          >
            {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        {/* ERP stale error */}
        {erpError?.type === 'stale' && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800">Dados desatualizados no ERP</p>
                <p className="text-xs text-yellow-700 mt-0.5">
                  Última consulta: {formatDate(erpError.details?.fetchedAt)} ({erpError.details?.daysOld} dias atrás)
                  — Limite: {erpError.details?.freshnessLimit} dias
                </p>
                <button
                  onClick={() => searchERP(true)}
                  disabled={searching}
                  className="mt-2 text-xs text-yellow-700 font-medium underline hover:no-underline"
                >
                  Forçar atualização do ERP
                </button>
              </div>
            </div>
          </div>
        )}

        {erpError?.type === 'error' && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {erpError.message}
          </p>
        )}

        {/* ERP success */}
        {data.erpProductData && !erpError && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">{data.erpProductData.name}</p>
              <p className="text-xs text-green-600">
                Custo unitário: R$ {data.erpProductData.unitCost?.toFixed(2)} · Estoque: {data.erpProductData.stock}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Item details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo de Item</label>
          <select className="input" value={data.itemType} onChange={(e) => update({ itemType: e.target.value })}>
            <option value="">Selecione...</option>
            {ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Quantidade *</label>
          <input
            type="number"
            min="1"
            className="input"
            value={data.quantity}
            onChange={(e) => update({ quantity: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div>
          <label className="label">Tipo de Pedido</label>
          <select className="input" value={data.orderType} onChange={(e) => update({ orderType: e.target.value })}>
            {ORDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input
            type="checkbox"
            id="urgent"
            checked={data.urgent}
            onChange={(e) => update({ urgent: e.target.checked })}
            className="w-4 h-4 rounded text-orange-600"
          />
          <label htmlFor="urgent" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer">
            <Zap className="w-3.5 h-3.5 text-orange-500" />
            Pedido Urgente (+15%)
          </label>
        </div>
      </div>

      {/* Size variations */}
      <div>
        <label className="label">Tamanhos</label>
        <div className="flex flex-wrap gap-2">
          {SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                selectedSizes.includes(size)
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Color variations */}
      <div>
        <label className="label">Cores</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => toggleColor(color)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                selectedColors.includes(color)
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
              }`}
            >
              {color}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button onClick={onNext} disabled={!canProceed} className="btn-primary">
          Próxima Etapa →
        </button>
      </div>

      {!canProceed && (
        <p className="text-xs text-gray-400 text-right -mt-2">
          Preencha cliente, referência, quantidade e busque o produto no ERP para continuar
        </p>
      )}
    </div>
  );
}
