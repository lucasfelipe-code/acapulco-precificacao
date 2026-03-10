import { useState, useRef } from 'react';
import { Upload, Loader2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { embroideryAPI } from '../../../services/api';

const PROCESS_OPTIONS = [
  { value: 'CUT', label: 'Corte' },
  { value: 'SEW', label: 'Costura' },
  { value: 'FINISHING', label: 'Acabamento' },
  { value: 'WASH', label: 'Lavagem' },
];

const COMPLEXITY = [
  { value: 'LOW', label: 'Baixa', desc: 'Modelos simples, retos' },
  { value: 'MEDIUM', label: 'Média', desc: 'Detalhes moderados' },
  { value: 'HIGH', label: 'Alta', desc: 'Muitos detalhes e recortes' },
];

export default function Step3Processes({ data, update, onNext, onBack }) {
  const [analyzingEmbroidery, setAnalyzingEmbroidery] = useState(false);
  const [embroideryAnalysis, setEmbroideryAnalysis] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const fileRef = useRef();

  const toggleProcess = (value) => {
    const procs = data.processes.includes(value)
      ? data.processes.filter((p) => p !== value)
      : [...data.processes, value];
    update({ processes: procs });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewImage(ev.target.result);
    reader.readAsDataURL(file);

    // Analyze
    await analyzeImage(file);
  };

  const analyzeImage = async (file) => {
    setAnalyzingEmbroidery(true);
    setEmbroideryAnalysis(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data: res } = await embroideryAPI.analyze(formData);
      const analysis = res.analysis;

      setEmbroideryAnalysis(analysis);
      update({
        embroideryPoints: analysis.estimatedPoints,
        embroideryCost: analysis.estimatedCost,
        embroideryPricePerK: analysis.pricePerK,
      });

      toast.success(`Bordado analisado: ~${analysis.estimatedPoints.toLocaleString('pt-BR')} pontos`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro na análise de bordado.');
    } finally {
      setAnalyzingEmbroidery(false);
    }
  };

  const handleManualPointsChange = async (points) => {
    update({ embroideryPoints: points });
    if (points > 0) {
      const { data: res } = await embroideryAPI.calculate(points, data.embroideryPricePerK);
      update({ embroideryCost: res.cost });
    }
  };

  const handlePrintDimensionChange = async (field, value) => {
    const updatedData = { ...data, [field]: value };
    update({ [field]: value });

    if (updatedData.printWidth > 0 && updatedData.printHeight > 0) {
      try {
        const { data: res } = await embroideryAPI.calculatePrint({
          widthCm: updatedData.printWidth,
          heightCm: updatedData.printHeight,
          colorCount: updatedData.printColors,
        });
        update({ printCost: res.cost });
      } catch {}
    }
  };

  const complexityMultiplier = { LOW: 1.0, MEDIUM: 1.15, HIGH: 1.35 }[data.complexity];
  const totalProcess = (data.baseProcessCost + data.embroideryCost + data.printCost) * complexityMultiplier;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 3 — Processos Produtivos</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure corte, costura, bordado e estampa</p>
      </div>

      {/* Base processes */}
      <div>
        <label className="label">Processos Envolvidos</label>
        <div className="flex flex-wrap gap-2">
          {PROCESS_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => toggleProcess(p.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                data.processes.includes(p.value)
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Custo Base de Processos (R$/peça)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={data.baseProcessCost || ''}
            onChange={(e) => update({ baseProcessCost: parseFloat(e.target.value) || 0 })}
            placeholder="0,00"
          />
          <p className="text-xs text-gray-400 mt-1">Corte + Costura + Acabamento</p>
        </div>

        <div>
          <label className="label">Complexidade</label>
          {COMPLEXITY.map((c) => (
            <label key={c.value} className="flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="radio"
                name="complexity"
                value={c.value}
                checked={data.complexity === c.value}
                onChange={() => update({ complexity: c.value })}
                className="text-orange-600"
              />
              <span className="text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="text-gray-400 ml-1">— {c.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Embroidery */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.hasEmbroidery}
              onChange={(e) => update({ hasEmbroidery: e.target.checked })}
              className="w-4 h-4 text-orange-600 rounded"
            />
            <span className="text-sm font-medium text-gray-800">Bordado</span>
          </label>
          {data.hasEmbroidery && data.embroideryCost > 0 && (
            <span className="text-sm font-semibold text-orange-700">
              R$ {data.embroideryCost.toFixed(2)}/peça
            </span>
          )}
        </div>

        {data.hasEmbroidery && (
          <div className="p-4 space-y-4">
            {/* AI Analysis */}
            <div>
              <label className="label">Analisar Imagem com IA</label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  analyzingEmbroidery ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-orange-400 hover:bg-orange-50'
                }`}
              >
                {previewImage ? (
                  <div className="flex items-center gap-4">
                    <img src={previewImage} alt="Preview" className="w-20 h-20 object-contain rounded-lg border" />
                    <div className="text-left">
                      {analyzingEmbroidery ? (
                        <div className="flex items-center gap-2 text-orange-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Analisando com IA...</span>
                        </div>
                      ) : embroideryAnalysis ? (
                        <div>
                          <div className="flex items-center gap-1.5 text-green-700 mb-1">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm font-medium">Análise concluída</span>
                          </div>
                          <p className="text-xs text-gray-600">
                            ~{embroideryAnalysis.estimatedPoints.toLocaleString('pt-BR')} pontos · {embroideryAnalysis.complexity}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{embroideryAnalysis.observations}</p>
                        </div>
                      ) : null}
                      <button type="button" className="text-xs text-orange-600 mt-2 underline">
                        Trocar imagem
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Sparkles className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">
                      {analyzingEmbroidery ? 'Analisando...' : 'Upload do arte do bordado'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG ou WebP · Máx 5MB</p>
                    <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-orange-600 font-medium">
                      <Sparkles className="w-3 h-3" />
                      IA analisa e estima os pontos automaticamente
                    </div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>

            {/* Manual points */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pontos Estimados</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="input"
                  value={data.embroideryPoints || ''}
                  onChange={(e) => handleManualPointsChange(parseInt(e.target.value) || 0)}
                  placeholder="5000"
                />
              </div>
              <div>
                <label className="label">Preço por 1.000 pts (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={data.embroideryPricePerK}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    update({ embroideryPricePerK: val, embroideryCost: (data.embroideryPoints / 1000) * val });
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print / Silk / DTF */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.hasPrint}
              onChange={(e) => update({ hasPrint: e.target.checked })}
              className="w-4 h-4 text-orange-600 rounded"
            />
            <span className="text-sm font-medium text-gray-800">Estampa / Silk / DTF</span>
          </label>
          {data.hasPrint && data.printCost > 0 && (
            <span className="text-sm font-semibold text-orange-700">
              R$ {data.printCost.toFixed(2)}/peça
            </span>
          )}
        </div>

        {data.hasPrint && (
          <div className="p-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Largura (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={data.printWidth || ''}
                  onChange={(e) => handlePrintDimensionChange('printWidth', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label">Altura (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={data.printHeight || ''}
                  onChange={(e) => handlePrintDimensionChange('printHeight', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="label">Nº de Cores</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="input"
                  value={data.printColors}
                  onChange={(e) => handlePrintDimensionChange('printColors', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
            {data.printCost > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Área: {(data.printWidth * data.printHeight).toFixed(1)} cm² · Custo calculado: R$ {data.printCost.toFixed(2)}/peça
              </p>
            )}
          </div>
        )}
      </div>

      {/* Cost preview */}
      {totalProcess > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg text-sm">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Custo de Processos</p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Base (corte + costura)</span>
              <span>R$ {data.baseProcessCost.toFixed(2)}</span>
            </div>
            {data.embroideryCost > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Bordado ({data.embroideryPoints?.toLocaleString('pt-BR')} pts)</span>
                <span>R$ {data.embroideryCost.toFixed(2)}</span>
              </div>
            )}
            {data.printCost > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Estampa</span>
                <span>R$ {data.printCost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-400">
              <span>Fator complexidade ({data.complexity})</span>
              <span>×{complexityMultiplier}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-orange-200 font-semibold">
              <span>Total Processos</span>
              <span className="text-orange-700">R$ {totalProcess.toFixed(2)}</span>
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
