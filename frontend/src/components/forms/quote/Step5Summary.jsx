import { useMemo } from 'react';
import { Send, Save, FileDown } from 'lucide-react';
import { formatCurrency } from '../../../utils/format';
import { calculateQuotePricing } from '../../../utils/quotePricing';

const Row = ({ label, value, highlight }) => (
  <div className={`flex justify-between py-2 border-b border-gray-100 ${highlight ? 'font-semibold' : ''}`}>
    <span className={highlight ? 'text-gray-900' : 'text-gray-600'}>{label}</span>
    <span className={highlight ? 'text-orange-700' : 'text-gray-900'}>{value}</span>
  </div>
);

export default function Step5Summary({ data, onBack, saving, onSaveDraft, onSubmit }) {
  const pricing = useMemo(() => calculateQuotePricing(data), [data]);
  const customization = pricing.customization;

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ ...data, pricing }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orcamento-${data.reference}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const activeMaterials = (data.materials || []).filter((material) => !material.removed);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 5 - Resumo do Orcamento</h2>
        <p className="text-sm text-gray-500 mt-0.5">Revise todos os dados antes de enviar</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pedido</p>
          <Row label="Cliente" value={data.clientName || '-'} />
          <Row label="Segmento" value={data.clientSegment || '-'} />
          <Row label="Referencia" value={data.reference || '-'} />
          <Row label="Produto" value={data.erpProductData?.name || data.productName || '-'} />
          <Row label="Tipo" value={data.itemType || '-'} />
          <Row label="Quantidade" value={`${data.quantity} pcs`} />
          <Row label="Tipo Pedido" value={data.orderType === 'RETAIL' ? 'Varejo' : 'Atacado'} />
          <Row label="Urgente" value={data.urgent ? 'Sim (+15%)' : 'Nao'} />
        </div>

        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Materia-Prima ({activeMaterials.length} itens)
          </p>

          {activeMaterials.slice(0, 5).map((material) => {
            const consumption = material.consumptionOverride ?? material.consumption ?? 1;
            const price = (material.priceOverride ?? material.unitPrice ?? 0) * consumption;

            return (
              <Row key={material.erpCode || material.id} label={material.name} value={formatCurrency(price)} />
            );
          })}

          {activeMaterials.length > 5 && (
            <p className="text-xs text-gray-400 py-1">+ {activeMaterials.length - 5} outros materiais</p>
          )}

          {pricing.fabricFreight > 0 && (
            <Row label="Frete tecidos/malhas (3%)" value={formatCurrency(pricing.fabricFreight)} />
          )}

          <Row label="Total Materia-Prima" value={formatCurrency(pricing.totalMaterial + pricing.fabricFreight)} highlight />
        </div>

        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Processos</p>

          {(data.fabricationItems || []).map((item, index) => (
            <Row
              key={`${item.manufacturingCostId || item.name || item.descricao}-${index}`}
              label={item.name || item.descricao}
              value={formatCurrency((item.unitCost ?? 0) * (item.quantity ?? 1))}
            />
          ))}

          {customization.embroideryItems.map((item, index) => (
            <Row
              key={item.id}
              label={`Bordado ${index + 1}${item.position ? ` - ${item.position}` : ''}`}
              value={formatCurrency(item.totalCostPerPiece)}
            />
          ))}

          {customization.printItems.map((item, index) => (
            <Row
              key={item.id}
              label={`Estampa ${index + 1}${item.position ? ` - ${item.position}` : ''}`}
              value={formatCurrency(item.totalCostPerPiece)}
            />
          ))}

          <Row label="Total Processos" value={formatCurrency(pricing.totalProcess)} highlight />
        </div>

        <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">Precificacao</p>
          <Row label="Custo por peca" value={formatCurrency(pricing.costPerPiece)} />
          {data.markupCoeficiente
            ? (
              <Row
                label={`Markup ERP (coef. ${data.markupCoeficiente.toFixed(2)}x)`}
                value={`${data.erpMarkup?.descricao || ''} - ${pricing.effectiveMarkup.toFixed(1)}% s/custo`}
              />
            )
            : <Row label="Markup" value={`${pricing.effectiveMarkup.toFixed(0)}%`} />}
          <Row label="Desconto" value={`${pricing.discount || 0}%`} />
          <Row label="Preco por peca" value={formatCurrency(pricing.pricePerPiece)} highlight />
          <Row label="Margem estimada" value={`${pricing.margin.toFixed(1)}%`} highlight />
          <Row label={`Total (${data.quantity} pcs)`} value={formatCurrency(pricing.totalOrderValue)} highlight />
        </div>
      </div>

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
            {saving ? 'Enviando...' : 'Enviar para Aprovacao'}
          </button>
        </div>
      </div>
    </div>
  );
}
