import { useMemo } from 'react';

const calcPricing = (data) => {
  const totalMaterial = (data.materials || [])
    .filter(m => !m.removed)
    .reduce((sum, m) => sum + (m.priceOverride ?? m.unitPrice ?? 0) * (m.consumption ?? 1), 0);

  const totalFabrication = (data.fabricationItems || [])
    .reduce((sum, f) => sum + (f.unitCost ?? 0) * (f.quantity ?? 1), 0);

  const embroideryCost = data.embroideryCost || 0;
  const printCost      = data.printCostPerPiece || data.printCost || 0;
  const subtotal       = totalMaterial + totalFabrication + embroideryCost + printCost;
  const urgency        = data.urgent ? subtotal * 0.15 : 0;
  const costPerPiece   = subtotal + urgency;

  // Método divisório ERP: precoVenda = custo × coeficiente
  // Fallback aditivo: precoVenda = custo × (1 + markup/100)
  let priceBeforeDiscount;
  let effectiveMarkup;
  const coef = data.markupCoeficiente;
  if (coef && coef > 1) {
    priceBeforeDiscount = costPerPiece * coef;
    effectiveMarkup     = (coef - 1) * 100;
  } else {
    effectiveMarkup = data.markup || 0;
    if (data.quantity >= 500) effectiveMarkup = Math.max(effectiveMarkup * 0.8, 15);
    else if (data.quantity >= 100) effectiveMarkup = Math.max(effectiveMarkup * 0.9, 20);
    priceBeforeDiscount = costPerPiece * (1 + effectiveMarkup / 100);
  }

  const pricePerPiece = priceBeforeDiscount * (1 - (data.discount || 0) / 100);
  const margin        = costPerPiece > 0 ? ((pricePerPiece - costPerPiece) / pricePerPiece) * 100 : 0;

  return { totalMaterial, totalFabrication, embroideryCost, printCost, costPerPiece, pricePerPiece, margin, totalOrderValue: pricePerPiece * (data.quantity || 1), effectiveMarkup };
};

export default function Step4Pricing({ data, update, onNext, onBack }) {
  const pricing = useMemo(() => calcPricing(data), [
    data.materials, data.fabricationItems,
    data.embroideryCost, data.printCostPerPiece, data.printCost,
    data.urgent, data.markup, data.markupCoeficiente, data.discount, data.quantity,
  ]);

  const getMarginColor = (margin) => {
    if (margin >= 40) return 'text-green-700';
    if (margin >= 25) return 'text-yellow-700';
    return 'text-red-700';
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 4 — Precificação e Margem</h2>
        <p className="text-sm text-gray-500 mt-0.5">Defina markup e descontos</p>
      </div>

      {/* Markup do ERP */}
      {data.erpMarkup?.indices?.length > 0 ? (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-800">
                Markup ERP: {data.erpMarkup.descricao}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Coeficiente divisório {data.erpMarkup.coeficiente?.toFixed(4)} × custo
                {' '}= margem de {(100 - 100 / data.erpMarkup.coeficiente).toFixed(1)}% sobre o preço
              </p>
            </div>
            {data.markupSource === 'MANUAL' && (
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => update({ markupCoeficiente: data.erpMarkup.coeficiente, markupSource: 'ERP' })}
              >
                Restaurar ERP
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {data.erpMarkup.indices.map((idx) => (
              <div key={idx.codigo} className="flex justify-between bg-white rounded px-2 py-1 border border-blue-100">
                <span className="text-gray-600 truncate">{idx.descricao}</span>
                <span className="font-medium text-blue-700 ml-2 shrink-0">{idx.indiceNacional}%</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1 border-t border-blue-200">
            <span className="text-xs text-blue-700 font-medium">
              Soma: {data.erpMarkup.somaIndices?.toFixed(2)}%
            </span>
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-700 underline ml-auto"
              onClick={() => update({ markupCoeficiente: null, markupSource: 'MANUAL' })}
            >
              Substituir por markup manual
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        {(!data.erpMarkup?.indices?.length || data.markupSource === 'MANUAL') && (
        <div>
          <label className="label">Markup % (manual)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="500"
            className="input"
            value={data.markup}
            onChange={(e) => update({ markup: parseFloat(e.target.value) || 0, markupSource: 'MANUAL', markupCoeficiente: null })}
          />
          {data.quantity >= 100 && !data.markupCoeficiente && (
            <p className="text-xs text-orange-600 mt-1">
              ⚡ Volume: {data.markup}% → {pricing.effectiveMarkup.toFixed(0)}%
            </p>
          )}
        </div>
        )}

        <div>
          <label className="label">Desconto Especial (%)</label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="50"
            className="input"
            value={data.discount}
            onChange={(e) => update({ discount: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div>
        <label className="label">Observações do Orçamento</label>
        <textarea
          className="input"
          rows={3}
          value={data.notes || ''}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Condições especiais, prazos, informações adicionais..."
        />
      </div>

      {/* Live pricing preview */}
      <div className="p-5 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl">
        <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">Resultado da Precificação</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-orange-100">
            <p className="text-xs text-gray-500">Custo por Peça</p>
            <p className="text-xl font-bold text-gray-900">
              R$ {pricing.costPerPiece.toFixed(2)}
            </p>
          </div>

          <div className="bg-white rounded-lg p-3 border border-orange-100">
            <p className="text-xs text-gray-500">Preço Sugerido</p>
            <p className="text-xl font-bold text-orange-700">
              R$ {pricing.pricePerPiece.toFixed(2)}
            </p>
          </div>

          <div className="bg-white rounded-lg p-3 border border-orange-100">
            <p className="text-xs text-gray-500">Margem Estimada</p>
            <p className={`text-xl font-bold ${getMarginColor(pricing.margin)}`}>
              {pricing.margin.toFixed(1)}%
            </p>
          </div>

          <div className="bg-white rounded-lg p-3 border border-orange-100">
            <p className="text-xs text-gray-500">Total do Pedido ({data.quantity} pcs)</p>
            <p className="text-xl font-bold text-gray-900">
              R$ {pricing.totalOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {pricing.margin < 25 && pricing.margin > 0 && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700 font-medium">
              ⚠️ Margem abaixo de 25% — considere revisar o markup antes de enviar para aprovação
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">← Voltar</button>
        <button onClick={onNext} className="btn-primary">Revisar Resumo →</button>
      </div>
    </div>
  );
}
