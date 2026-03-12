import { useState, useRef, useEffect } from 'react';
import {
  Loader2, Sparkles, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, BookOpen, Edit2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { embroideryAPI, costsAPI } from '../../../services/api';

const PRINT_TYPES = [
  { value: 'SILK_SCREEN', label: 'Serigrafia / Silk' },
  { value: 'DTF', label: 'DTF' },
  { value: 'SUBLIMATION', label: 'Sublimacao' },
  { value: 'TRANSFER', label: 'Transfer' },
];

const COMPLEXITY_MAP = {
  SIMPLE: { label: 'Simples', color: 'green' },
  MEDIUM: { label: 'Medio', color: 'yellow' },
  COMPLEX: { label: 'Complexo', color: 'orange' },
  VERY_COMPLEX: { label: 'Muito Complexo', color: 'red' },
};

const toNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeFabricItem = (item = {}) => {
  const quantity = toNumber(item.quantity, 1);
  const unitCost = toNumber(item.unitCost, 0);
  return {
    ...item,
    quantity,
    unitCost,
    totalCost: toNumber(item.totalCost, unitCost * quantity),
  };
};

function ComplexityBadge({ level }) {
  const c = COMPLEXITY_MAP[level] || { label: level, color: 'gray' };
  const colors = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[c.color]}`}>{c.label}</span>;
}

function SimilarEmbroideryCard({ job, onSelect }) {
  const points = toNumber(job.confirmedPoints ?? job.estimatedPoints, 0);
  const applicationCost = toNumber(job.applicationCost, 0);
  const programCost = toNumber(job.programCost, 0);

  return (
    <div
      className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors"
      onClick={() => onSelect(job)}
    >
      <div className="flex items-start gap-3">
        {job.imageBase64 && (
          <img
            src={job.imageBase64}
            alt={job.name}
            className="w-14 h-14 object-contain rounded border bg-white shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{job.name}</p>
          <p className="text-xs text-gray-500">
            {points.toLocaleString('pt-BR')} pts · {job.colorCount} cor(es) · {job.widthCm}x{job.heightCm}cm
          </p>
          <div className="flex items-center gap-2 mt-1">
            <ComplexityBadge level={job.complexity} />
            {job.isConfirmed && <span className="text-xs text-green-700 font-medium">Confirmado</span>}
          </div>
          <p className="text-xs text-orange-700 font-semibold mt-1">
            R$ {applicationCost.toFixed(2)}/peca
            {programCost > 0 && ` + R$ ${programCost.toFixed(2)} programa`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Step3Processes({ data, update, onNext, onBack }) {
  const [analyzingEmbroidery, setAnalyzingEmbroidery] = useState(false);
  const [embroideryAnalysis, setEmbroideryAnalysis] = useState(null);
  const [similarJobs, setSimilarJobs] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const fileRef = useRef();

  const [calcPrint, setCalcPrint] = useState(false);

  const [fabricItems, setFabricItems] = useState((data.fabricationItems || []).map(normalizeFabricItem));
  const [loadingFabric, setLoadingFabric] = useState(false);

  useEffect(() => {
    setFabricItems((data.fabricationItems || []).map(normalizeFabricItem));
  }, [data.fabricationItems]);

  useEffect(() => {
    const hasLocalItems = data.fabricationItems?.some((f) => f.categoria);
    if (data.itemType && data.quantity && !hasLocalItems) {
      loadFabricationCosts();
    }
  }, []);

  async function loadFabricationCosts() {
    setLoadingFabric(true);
    try {
      const { data: res } = await costsAPI.lookup({
        referencia: data.reference,
        itemType: data.itemType,
        quantity: data.quantity,
        processos: ['costura', 'talhacao', 'embalagem', 'caseado'],
      });
      const normalizedItems = (res.items || []).map(normalizeFabricItem);
      setFabricItems(normalizedItems);
      update({ fabricationItems: normalizedItems });
    } catch {
      toast.error('Nao foi possivel carregar custos de fabricacao automaticamente');
    } finally {
      setLoadingFabric(false);
    }
  }

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setPreviewImage(ev.target.result);
    reader.readAsDataURL(file);

    setAnalyzingEmbroidery(true);
    setEmbroideryAnalysis(null);
    setSimilarJobs([]);

    try {
      const formData = new FormData();
      formData.append('image', file);
      if (data.embroideryPricePerK) formData.append('pricePerK', data.embroideryPricePerK);

      const { data: res } = await embroideryAPI.analyze(formData);
      const analysis = res.analysis;

      setEmbroideryAnalysis(analysis);
      setSimilarJobs(res.similar || []);

      update({
        embroideryPoints: toNumber(analysis.estimatedPoints, 0),
        embroideryCost: toNumber(analysis.estimatedCost, 0),
        embroideryPricePerK: toNumber(analysis.pricePerK, 0.9),
        embroideryStatus: 'ESTIMATED',
      });

      toast.success(
        `Bordado analisado: ~${toNumber(analysis.estimatedPoints, 0).toLocaleString('pt-BR')} pts · Complexidade ${COMPLEXITY_MAP[analysis.complexity]?.label}`
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro na analise de bordado');
    } finally {
      setAnalyzingEmbroidery(false);
    }
  };

  const selectSimilarJob = (job) => {
    const points = toNumber(job.confirmedPoints ?? job.estimatedPoints, 0);
    const cost = toNumber(job.applicationCost, 0);
    update({
      embroideryJobId: job.id,
      embroideryPoints: points,
      embroideryCost: cost,
      embroideryPricePerK: toNumber(job.pricePerK, toNumber(data.embroideryPricePerK, 0.9)),
      embroideryStatus: job.isConfirmed ? 'CONFIRMED' : 'ESTIMATED',
    });
    setShowLibrary(false);
    toast.success(`Referencia "${job.name}" selecionada`);
  };

  const handlePrintChange = async (field, value) => {
    const updated = { ...data, [field]: value };
    update({ [field]: value });

    if (toNumber(updated.printWidthCm, 0) > 0 && toNumber(updated.printHeightCm, 0) > 0) {
      setCalcPrint(true);
      try {
        const { data: res } = await embroideryAPI.calculatePrint({
          widthCm: toNumber(updated.printWidthCm, 0),
          heightCm: toNumber(updated.printHeightCm, 0),
          colorCount: toNumber(updated.printColors, 1),
          quantity: toNumber(data.quantity, 1),
        });
        update({ [field]: value, printCostPerPiece: toNumber(res.cost, 0) });
      } finally {
        setCalcPrint(false);
      }
    }
  };

  const fabricTotal = fabricItems.reduce((sum, item) => sum + toNumber(item.unitCost, 0), 0);
  const embroideryTotal = data.hasEmbroidery ? toNumber(data.embroideryCost, 0) : 0;
  const printTotal = data.hasPrint ? toNumber(data.printCostPerPiece, 0) : 0;
  const processTotal = fabricTotal + embroideryTotal + printTotal;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 3 - Processos Produtivos</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Fabricacao calculada automaticamente. Configure bordado ou estampa se houver personalizacao.
        </p>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-800">Custos de Fabricacao</p>
          <div className="flex items-center gap-2">
            {loadingFabric && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
            <span className="text-sm font-semibold text-orange-700">R$ {fabricTotal.toFixed(2)}/peca</span>
          </div>
        </div>

        {fabricItems.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {fabricItems.map((f, i) => (
              <div key={i} className="px-4 py-2.5 flex justify-between items-center text-sm">
                <div>
                  <span className="text-gray-800">{f.descricao}</span>
                  {f.tierApplied && <span className="ml-2 text-xs text-gray-400">({f.tierApplied})</span>}
                </div>
                <span className="font-medium text-gray-900">R$ {toNumber(f.unitCost, 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
            {loadingFabric ? (
              'Calculando custos...'
            ) : (
              <>
                Nenhum custo de fabricacao identificado.
                <button onClick={loadFabricationCosts} className="text-orange-600 underline text-xs">
                  Tentar novamente
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.hasEmbroidery || false}
              onChange={(e) => update({ hasEmbroidery: e.target.checked })}
              className="w-4 h-4 text-orange-600 rounded"
            />
            <span className="text-sm font-medium text-gray-800">Bordado</span>
          </label>
          {data.hasEmbroidery && embroideryTotal > 0 && (
            <div className="flex items-center gap-2">
              {data.embroideryStatus === 'ESTIMATED' && (
                <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">
                  Aguarda confirmacao do bordador
                </span>
              )}
              {data.embroideryStatus === 'CONFIRMED' && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                  Confirmado
                </span>
              )}
              <span className="text-sm font-semibold text-orange-700">R$ {embroideryTotal.toFixed(2)}/peca</span>
            </div>
          )}
        </div>

        {data.hasEmbroidery && (
          <div className="p-4 space-y-4">
            <div>
              <label className="label">Analisar arte com IA</label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  analyzingEmbroidery ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-orange-400 hover:bg-orange-50'
                }`}
              >
                {previewImage ? (
                  <div className="flex items-start gap-4">
                    <img
                      src={previewImage}
                      alt="Arte do bordado"
                      className="w-20 h-20 object-contain rounded-lg border bg-white shrink-0"
                    />
                    <div className="text-left flex-1">
                      {analyzingEmbroidery ? (
                        <div className="flex items-center gap-2 text-orange-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm font-medium">IA analisando a arte...</span>
                        </div>
                      ) : embroideryAnalysis ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">Analise concluida</span>
                            <ComplexityBadge level={embroideryAnalysis.complexity} />
                          </div>
                          <p className="text-xs text-gray-700">
                            <strong>Pontos estimados:</strong>{' '}
                            {toNumber(embroideryAnalysis.estimatedPointsMin, 0).toLocaleString('pt-BR')}-
                            {toNumber(embroideryAnalysis.estimatedPointsMax, 0).toLocaleString('pt-BR')} pts
                            (media: {toNumber(embroideryAnalysis.estimatedPoints, 0).toLocaleString('pt-BR')})
                          </p>
                          <p className="text-xs text-gray-600">
                            <strong>Cores:</strong> {embroideryAnalysis.colorCount} ·{' '}
                            <strong>Tipos de ponto:</strong> {embroideryAnalysis.stitchTypes?.join(', ')}
                          </p>
                          <p className="text-xs text-gray-500 italic mt-1">{embroideryAnalysis.technicalObservations}</p>
                          <p className="text-xs text-orange-600 mt-1">
                            Custo estimado: R$ {toNumber(embroideryAnalysis.estimatedCostMin, 0).toFixed(2)}-R$ {toNumber(embroideryAnalysis.estimatedCostMax, 0).toFixed(2)}/peca
                          </p>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileRef.current?.click();
                        }}
                        className="text-xs text-orange-600 mt-2 underline"
                      >
                        Trocar imagem
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Sparkles className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">Upload da arte do bordado</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG ou WebP · Max 5MB</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>

            {similarJobs.length > 0 && (
              <div>
                <button
                  onClick={() => setShowLibrary(!showLibrary)}
                  className="flex items-center gap-1.5 text-sm text-orange-700 font-medium"
                >
                  <BookOpen className="w-4 h-4" />
                  {similarJobs.length} bordado(s) similar(es) na biblioteca
                  {showLibrary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showLibrary && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-gray-500">Selecione um bordado similar para usar como referencia de preco:</p>
                    {similarJobs.map((job) => (
                      <SimilarEmbroideryCard key={job.id} job={job} onSelect={selectSimilarJob} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <button
                onClick={() => setManualMode(!manualMode)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Ajuste manual de pontos e preco
                {manualMode ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {manualMode && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Pontos estimados</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      className="input"
                      value={data.embroideryPoints || ''}
                      onChange={(e) => {
                        const pts = parseInt(e.target.value, 10) || 0;
                        const prk = toNumber(data.embroideryPricePerK, 0.9);
                        update({ embroideryPoints: pts, embroideryCost: (pts / 1000) * prk });
                      }}
                      placeholder="Ex: 15000"
                    />
                  </div>
                  <div>
                    <label className="label">Preco/1.000 pts (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={data.embroideryPricePerK || 0.9}
                      onChange={(e) => {
                        const prk = toNumber(e.target.value, 0);
                        update({
                          embroideryPricePerK: prk,
                          embroideryCost: (toNumber(data.embroideryPoints, 0) / 1000) * prk,
                        });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Custo de programa (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={data.embroideryProgramCost || ''}
                      onChange={(e) => update({ embroideryProgramCost: toNumber(e.target.value, 0) })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              )}
            </div>

            {data.embroideryStatus === 'ESTIMATED' && embroideryTotal > 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800">
                  Este orcamento ficara em status <strong>Aguardando Bordador</strong> ate que o programador confirme o preco.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.hasPrint || false}
              onChange={(e) => update({ hasPrint: e.target.checked })}
              className="w-4 h-4 text-orange-600 rounded"
            />
            <span className="text-sm font-medium text-gray-800">Estampa / Silk / DTF</span>
          </label>
          {data.hasPrint && printTotal > 0 && (
            <span className="text-sm font-semibold text-orange-700">R$ {printTotal.toFixed(2)}/peca</span>
          )}
        </div>

        {data.hasPrint && (
          <div className="p-4 space-y-3">
            <div>
              <label className="label">Tipo de impressao</label>
              <div className="flex flex-wrap gap-2">
                {PRINT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => update({ printType: t.value })}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      data.printType === t.value
                        ? 'bg-orange-600 border-orange-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Largura (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={data.printWidthCm || ''}
                  onChange={(e) => handlePrintChange('printWidthCm', toNumber(e.target.value, 0))}
                />
              </div>
              <div>
                <label className="label">Altura (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={data.printHeightCm || ''}
                  onChange={(e) => handlePrintChange('printHeightCm', toNumber(e.target.value, 0))}
                />
              </div>
              <div>
                <label className="label">No de cores</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="input"
                  value={data.printColors || 1}
                  onChange={(e) => handlePrintChange('printColors', parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            {calcPrint && (
              <div className="flex items-center gap-2 text-xs text-orange-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Calculando custo da tabela...
              </div>
            )}

            {printTotal > 0 && !calcPrint && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Area: {(toNumber(data.printWidthCm, 0) * toNumber(data.printHeightCm, 0)).toFixed(1)} cm2 · {data.printColors} cor(es)
                {' '}· Custo: <strong>R$ {printTotal.toFixed(2)}/peca</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {processTotal > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Total Processos Produtivos</p>
          <div className="space-y-1">
            {fabricTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Fabricacao (M.O., corte, embalagem)</span>
                <span>R$ {fabricTotal.toFixed(2)}</span>
              </div>
            )}
            {embroideryTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>
                  Bordado ({toNumber(data.embroideryPoints, 0).toLocaleString('pt-BR')} pts)
                  {data.embroideryStatus === 'ESTIMATED' && ' pendente'}
                </span>
                <span>R$ {embroideryTotal.toFixed(2)}</span>
              </div>
            )}
            {printTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Estampa</span>
                <span>R$ {printTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-orange-200 font-semibold">
              <span>Total</span>
              <span className="text-orange-700">R$ {processTotal.toFixed(2)}/peca</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">Voltar</button>
        <button onClick={onNext} className="btn-primary">Proxima Etapa</button>
      </div>
    </div>
  );
}
