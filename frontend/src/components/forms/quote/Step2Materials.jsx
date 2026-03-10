const FABRIC_TYPES = [
  'Malha PV', 'Malha 100% Algodão', 'Malha Dry Fit', 'Brim', 'Oxford', 'Tricoline',
  'Microfibra', 'Neoprene', 'Moletom', 'Helanca', 'Gabardine', 'Jeans', 'Outro'
];

export default function Step2Materials({ data, update, onNext, onBack }) {
  const fabricCostPerPiece = data.fabricPrice * data.fabricConsumption * (1 + data.cuttingWaste / 100);
  const totalMaterial = fabricCostPerPiece + data.accessoriesCost;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 2 — Matéria-Prima</h2>
        <p className="text-sm text-gray-500 mt-0.5">Informe os dados de tecido e aviamentos</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Tipo de Tecido</label>
          <select className="input" value={data.fabricType} onChange={(e) => update({ fabricType: e.target.value })}>
            <option value="">Selecione...</option>
            {FABRIC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Preço do Tecido (R$/metro)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={data.fabricPrice || ''}
            onChange={(e) => update({ fabricPrice: parseFloat(e.target.value) || 0 })}
            placeholder="0,00"
          />
        </div>

        <div>
          <label className="label">Consumo por Peça (metros)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={data.fabricConsumption || ''}
            onChange={(e) => update({ fabricConsumption: parseFloat(e.target.value) || 0 })}
            placeholder="1,50"
          />
        </div>

        <div>
          <label className="label">Desperdício de Corte (%)</label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="50"
            className="input"
            value={data.cuttingWaste}
            onChange={(e) => update({ cuttingWaste: parseFloat(e.target.value) || 0 })}
          />
        </div>

        <div>
          <label className="label">Custo de Aviamentos (R$/peça)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={data.accessoriesCost || ''}
            onChange={(e) => update({ accessoriesCost: parseFloat(e.target.value) || 0 })}
            placeholder="0,00"
          />
          <p className="text-xs text-gray-400 mt-1">Botões, zíperes, linhas, etiquetas, etc.</p>
        </div>
      </div>

      {/* Cost preview */}
      {(data.fabricPrice > 0 || data.accessoriesCost > 0) && (
        <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Prévia de Custo</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Tecido por peça</span>
              <span className="font-medium">R$ {fabricCostPerPiece.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Aviamentos</span>
              <span className="font-medium">R$ {data.accessoriesCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-orange-200 font-semibold">
              <span>Total Matéria-Prima</span>
              <span className="text-orange-700">R$ {totalMaterial.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">← Voltar</button>
        <button onClick={onNext} className="btn-primary">Próxima Etapa →</button>
      </div>
    </div>
  );
}
