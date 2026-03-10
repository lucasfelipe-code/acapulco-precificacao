import { useMemo } from 'react';
import { Send, Save, FileDown } from 'lucide-react';
import { formatCurrency } from '../../../utils/format';

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
  return { costPerPiece, pricePerPiece, margin, totalOrderValue: pricePerPiece * data.quantity, totalMaterial, totalProcess };
};

const Row = ({ label, value, highlight }) => (
  <div className={`flex justify-between py-2 border-b border-gray-100 ${highlight ? 'font-semibold' : ''}`}>
    <span className={highlight ? 'text-gray-900' : 'text-gray-600'}>{label}</span>
    <span className={highlight ? 'text-orange-700' : 'text-gray-900'}>{value}</span>
  </div>
);

const complexityLabel = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };

export default function Step5Summary({ data, onBack, saving, onSaveDraft, onSubmit }) {
  const pricing = useMemo(() => calcPricing(data), [data]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ ...data, pricing }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orcamento-${data.reference}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 5 — Resumo do Orçamento</h2>
        <p className="text-sm text-gray-500 mt-0.5">Revise todos os dados antes de enviar</p>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client & Product */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pedido</p>
          <Row label="Cliente" value={data.clientName} />
          <Row label="Segmento" value={data.clientSegment || '—'} />
          <Row label="Referência" value={data.reference} />
          <Row label="Produto" value={data.erpProductData?.name || data.productName || '—'} />
          <Row label="Tipo" value={data.itemType || '—'} />
          <Row label="Quantidade" value={`${data.quantity} pcs`} />
          <Row label="Tipo Pedido" value={data.orderType === 'RETAIL' ? 'Varejo' : 'Atacado'} />
          <Row label="Urgente" value={data.urgent ? '⚡ Sim (+15%)' : 'Não'} />
        </div>

        {/* Materials */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Matéria-Prima</p>
          <Row label="Tecido" value={data.fabricType || '—'} />
          <Row label="Preço tecido" value={`R$ ${(data.fabricPrice || 0).toFixed(2)}/m`} />
          <Row label="Consumo" value={`${data.fabricConsumption || 0}m/peça`} />
          <Row label="Desperdício" value={`${data.cuttingWaste || 0}%`} />
          <Row label="Aviamentos" value={formatCurrency(data.accessoriesCost || 0)} />
          <Row label="Total Matéria-Prima" value={formatCurrency(pricing.totalMaterial)} highlight />
        </div>

        {/* Processes */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Processos</p>
          <Row label="Processos" value={data.processes.join(', ') || '—'} />
          <Row label="Custo base" value={formatCurrency(data.baseProcessCost || 0)} />
          <Row label="Complexidade" value={complexityLabel[data.complexity] || '—'} />
          {data.hasEmbroidery && (
            <>
              <Row label="Bordado (pontos)" value={(data.embroideryPoints || 0).toLocaleString('pt-BR')} />
              <Row label="Custo bordado" value={formatCurrency(data.embroideryCost || 0)} />
            </>
          )}
          {data.hasPrint && (
            <>
              <Row label="Estampa" value={`${data.printWidth}×${data.printHeight}cm, ${data.printColors} cor(es)`} />
              <Row label="Custo estampa" value={formatCurrency(data.printCost || 0)} />
            </>
          )}
          <Row label="Total Processos" value={formatCurrency(pricing.totalProcess)} highlight />
        </div>

        {/* Pricing */}
        <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">Precificação</p>
          <Row label="Custo por peça" value={formatCurrency(pricing.costPerPiece)} />
          <Row label="Markup" value={`${data.markup}%`} />
          <Row label="Desconto" value={`${data.discount || 0}%`} />
          <Row label="Preço por peça" value={formatCurrency(pricing.pricePerPiece)} highlight />
          <Row label="Margem estimada" value={`${pricing.margin.toFixed(1)}%`} highlight />
          <Row label={`Total (${data.quantity} pcs)`} value={formatCurrency(pricing.totalOrderValue)} highlight />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
        <button onClick={onBack} className="btn-secondary">← Voltar</button>

        <div className="flex gap-2">
          <button onClick={exportJSON} className="btn-secondary">
            <FileDown className="w-4 h-4" />
            Exportar JSON
          </button>
          <button onClick={onSaveDraft} disabled={saving} className="btn-secondary">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Rascunho'}
          </button>
          <button onClick={onSubmit} disabled={saving} className="btn-primary">
            <Send className="w-4 h-4" />
            {saving ? 'Enviando...' : 'Enviar para Aprovação'}
          </button>
        </div>
      </div>
    </div>
  );
}
