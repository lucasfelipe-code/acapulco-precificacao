import { useMemo } from 'react';

const calcPricing = (data) => {
  const fabricCost = data.fabricPrice * data.fabricConsumption * (1 + data.cuttingWaste / 100);
  const totalMaterial = fabricCost + (data.accessoriesCost || 0);
  const complexity = { LOW: 1.0, MEDIUM: 1.15, HIGH: 1.35 }[data.complexity] || 1.0;
  const totalProcess = ((data.baseProcessCost || 0) + (data.embroideryCost || 0) + (data.printCost || 0)) * complexity;
  const urgency = data.urgent ? (totalMaterial + totalProcess) * 0.15 : 0;
  const costPerPiece = totalMaterial + totalProcess + urgency;

  let effectiveMarkup = data.markup || 0;
  if (data.quantity >= 500) effectiveMarkup = Math.max(effectiveMarkup * 0.8, 15);
  else if (data.quantity >= 100) effectiveMarkup = Math.max(effectiveMarkup * 0.9, 20);

  const priceBeforeDiscount = costPerPiece * (1 + effectiveMarkup / 100);
  const pricePerPiece = priceBeforeDiscount * (1 - (data.discount || 0) / 100);
  const margin = costPerPiece > 0 ? ((pricePerPiece - costPerPiece) / pricePerPiece) * 100 : 0;

  return {
    costPerPiece,
    pricePerPiece,
    margin,
    totalOrderValue: pricePerPiece * data.quantity,
    effectiveMarkup,
  };
};

export default function Step4Pricing({ data, update, onNext, onBack }) {
  const pricing = useMemo(() => calcPricing(data), [
    data.fabricPrice, data.fabricConsumption, data.cuttingWaste, data.accessoriesCost,
    data.baseProcessCost, data.embroideryCost, data.printCost,
    data.complexity, data.urgent, data.markup, data.discount, data.quantity
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Markup (%)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="500"
            className="input"
            value={data.markup}
            onChange={(e) => update({ markup: parseFloat(e.target.value) || 0 })}
          />
          {data.quantity >= 100 && (
            <p className="text-xs text-orange-600 mt-1">
              ⚡ Desconto de volume aplicado: {data.markup.toFixed(0)}% → {pricing.effectiveMarkup.toFixed(0)}%
            </p>
          )}
        </div>

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
