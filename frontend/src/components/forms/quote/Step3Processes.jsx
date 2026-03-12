import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { costsAPI, embroideryAPI } from '../../../services/api';
import {
  buildCustomizationFields,
  createEmbroideryItem,
  createPrintItem,
  summarizeCustomizations,
  toNumber,
} from '../../../utils/customizations';

const PRINT_TYPES = [
  { value: 'SILK_SCREEN', label: 'Silk / Serigrafia' },
  { value: 'DTF', label: 'DTF' },
  { value: 'SUBLIMATION', label: 'Sublimacao' },
  { value: 'TRANSFER', label: 'Transfer' },
];

const COMPLEXITY_MAP = {
  SIMPLE: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  COMPLEX: 'bg-orange-100 text-orange-700',
  VERY_COMPLEX: 'bg-red-100 text-red-700',
};

const normalizeFabricItem = (item = {}) => ({
  ...item,
  quantity: toNumber(item.quantity, 1),
  unitCost: toNumber(item.unitCost, 0),
});

function ComplexityBadge({ level }) {
  if (!level) return null;
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${COMPLEXITY_MAP[level] || 'bg-gray-100 text-gray-700'}`}>{level}</span>;
}

export default function Step3Processes({ data, update, onNext, onBack }) {
  const fileRefs = useRef({});
  const [fabricItems, setFabricItems] = useState((data.fabricationItems || []).map(normalizeFabricItem));
  const [loadingFabric, setLoadingFabric] = useState(false);
  const [setupCosts, setSetupCosts] = useState({ embroideryProgram: null, screenFrame: null });
  const [analyzing, setAnalyzing] = useState({});
  const [calcPrint, setCalcPrint] = useState({});

  const summary = useMemo(() => summarizeCustomizations(data), [data]);
  const embroideryItems = summary.embroideryItems;
  const printItems = summary.printItems;

  useEffect(() => {
    setFabricItems((data.fabricationItems || []).map(normalizeFabricItem));
  }, [data.fabricationItems]);

  useEffect(() => {
    const hasLocalItems = data.fabricationItems?.some((item) => item.categoria);
    if (data.itemType && data.quantity && !hasLocalItems) loadFabricationCosts();
  }, []);

  useEffect(() => {
    embroideryAPI.setupCosts().then(({ data: res }) => setSetupCosts(res)).catch(() => {});
  }, []);

  function syncEmbroideryItems(items) {
    update(buildCustomizationFields(data, { embroideryItems: items }));
  }

  function syncPrintItems(items) {
    update(buildCustomizationFields(data, { printItems: items }));
  }

  function patchEmbroidery(id, fields) {
    syncEmbroideryItems(embroideryItems.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...fields };
      if (!next.isNewProgram) next.programCost = 0;
      return next;
    }));
  }

  function patchPrint(id, fields) {
    syncPrintItems(printItems.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...fields };
      if (next.type !== 'SILK_SCREEN' || !next.needsScreenFrame) next.screenFrameCost = 0;
      return next;
    }));
  }

  async function loadFabricationCosts() {
    setLoadingFabric(true);
    try {
      const { data: res } = await costsAPI.lookup({
        referencia: data.reference,
        itemType: data.itemType,
        quantity: data.quantity,
        processos: ['costura', 'talhacao', 'embalagem', 'caseado'],
      });
      const items = (res.items || []).map(normalizeFabricItem);
      setFabricItems(items);
      update({ fabricationItems: items });
    } catch {
      toast.error('Nao foi possivel carregar custos de fabricacao automaticamente');
    } finally {
      setLoadingFabric(false);
    }
  }

  async function handleEmbroideryFile(id, file) {
    if (!file) return;
    const item = embroideryItems.find((entry) => entry.id === id);
    const reader = new FileReader();
    reader.onload = (event) => patchEmbroidery(id, { previewImage: event.target.result, imageBase64: event.target.result });
    reader.readAsDataURL(file);

    setAnalyzing((prev) => ({ ...prev, [id]: true }));
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('pricePerK', item?.pricePerK || 0.9);
      if (toNumber(item?.widthCm, 0) > 0) formData.append('widthCm', item.widthCm);
      if (toNumber(item?.heightCm, 0) > 0) formData.append('heightCm', item.heightCm);

      const { data: res } = await embroideryAPI.analyze(formData);
      const analysis = res.analysis;

      patchEmbroidery(id, {
        name: item?.name || analysis.referenceExample || '',
        widthCm: toNumber(item?.widthCm, 0) > 0 ? item.widthCm : toNumber(analysis.widthCmEstimate, 0),
        heightCm: toNumber(item?.heightCm, 0) > 0 ? item.heightCm : toNumber(analysis.heightCmEstimate, 0),
        points: toNumber(analysis.estimatedPoints, 0),
        colorCount: toNumber(analysis.colorCount, 0),
        complexity: analysis.complexity,
        stitchTypes: analysis.stitchTypes || [],
        technicalObservations: analysis.technicalObservations || '',
        pricePerK: toNumber(analysis.pricePerK, item?.pricePerK || 0.9),
        applicationCost: toNumber(analysis.estimatedCost, 0),
        status: 'ESTIMATED',
        similarJobs: res.similar || [],
      });
      toast.success('Bordado analisado com sucesso');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro na analise de bordado');
    } finally {
      setAnalyzing((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function recalcPrint(id, nextItem) {
    if (toNumber(nextItem.widthCm, 0) <= 0 || toNumber(nextItem.heightCm, 0) <= 0) return;
    setCalcPrint((prev) => ({ ...prev, [id]: true }));
    try {
      const { data: res } = await embroideryAPI.calculatePrint({
        widthCm: toNumber(nextItem.widthCm, 0),
        heightCm: toNumber(nextItem.heightCm, 0),
        colorCount: toNumber(nextItem.colorCount, 1),
        quantity: toNumber(data.quantity, 1),
      });
      patchPrint(id, { applicationCostPerPiece: toNumber(res.cost, 0) });
    } catch {
      toast.error('Nao foi possivel calcular a estampa');
    } finally {
      setCalcPrint((prev) => ({ ...prev, [id]: false }));
    }
  }

  const fabricTotal = fabricItems.reduce((sum, item) => sum + toNumber(item.unitCost, 0), 0);
  const processTotal = fabricTotal + summary.embroideryTotal + summary.printTotal;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 3 - Processos Produtivos</h2>
        <p className="text-sm text-gray-500 mt-0.5">Agora e possivel configurar varios bordados e varias estampas.</p>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-800">Custos de Fabricacao</p>
          <span className="text-sm font-semibold text-orange-700">R$ {fabricTotal.toFixed(2)}/peca</span>
        </div>
        <div className="divide-y divide-gray-100">
          {fabricItems.map((item, index) => (
            <div key={`${item.descricao}-${index}`} className="px-4 py-2 flex justify-between text-sm">
              <span>{item.descricao}</span>
              <span>R$ {toNumber(item.unitCost, 0).toFixed(2)}</span>
            </div>
          ))}
          {!fabricItems.length && (
            <div className="px-4 py-3 text-sm text-gray-400">
              {loadingFabric ? 'Calculando custos...' : 'Nenhum custo de fabricacao encontrado.'}
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={embroideryItems.length > 0} onChange={(e) => syncEmbroideryItems(e.target.checked ? [createEmbroideryItem()] : [])} className="w-4 h-4 text-orange-600 rounded" />
            <span className="text-sm font-medium text-gray-800">Bordados</span>
          </label>
          <div className="flex items-center gap-3">
            {summary.embroideryTotal > 0 && <span className="text-sm font-semibold text-orange-700">R$ {summary.embroideryTotal.toFixed(2)}/peca</span>}
            {embroideryItems.length > 0 && (
              <button type="button" onClick={() => syncEmbroideryItems([...embroideryItems, createEmbroideryItem()])} className="inline-flex items-center gap-1 text-xs text-orange-700 border border-orange-200 px-2 py-1 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            )}
          </div>
        </div>

        {embroideryItems.length > 0 && (
          <div className="p-4 space-y-4">
            {embroideryItems.map((item, index) => (
              <div key={item.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Bordado {index + 1}</p>
                    <p className="text-xs text-gray-500">Dimensoes entram na analise da IA e no calculo.</p>
                  </div>
                  <button type="button" onClick={() => syncEmbroideryItems(embroideryItems.filter((entry) => entry.id !== item.id))} disabled={embroideryItems.length === 1} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="input" placeholder="Descricao" value={item.name || ''} onChange={(e) => patchEmbroidery(item.id, { name: e.target.value })} />
                  <input className="input" placeholder="Local / posicao" value={item.position || ''} onChange={(e) => patchEmbroidery(item.id, { position: e.target.value })} />
                  <input className="input" type="number" step="0.1" min="0" placeholder="Largura (cm)" value={item.widthCm || ''} onChange={(e) => patchEmbroidery(item.id, { widthCm: toNumber(e.target.value, 0) })} />
                  <input className="input" type="number" step="0.1" min="0" placeholder="Altura (cm)" value={item.heightCm || ''} onChange={(e) => patchEmbroidery(item.id, { heightCm: toNumber(e.target.value, 0) })} />
                </div>

                <input ref={(node) => { fileRefs.current[item.id] = node; }} type="file" accept="image/*" className="hidden" onChange={(e) => handleEmbroideryFile(item.id, e.target.files?.[0])} />
                <button type="button" onClick={() => fileRefs.current[item.id]?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-left hover:border-orange-300 hover:bg-orange-50 transition-colors">
                  <div className="flex items-start gap-4">
                    {item.previewImage ? <img src={item.previewImage} alt="Arte" className="w-16 h-16 rounded border bg-white object-contain" /> : <Sparkles className="w-6 h-6 text-orange-400 mt-2" />}
                    <div className="flex-1">
                      {analyzing[item.id] ? (
                        <div className="flex items-center gap-2 text-orange-600 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> IA analisando arte</div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-800">Enviar arte do bordado</p>
                          {item.points > 0 && (
                            <div className="mt-2 text-xs text-gray-600 space-y-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <span>{item.points.toLocaleString('pt-BR')} pts</span>
                                <ComplexityBadge level={item.complexity} />
                              </div>
                              {item.technicalObservations && <p>{item.technicalObservations}</p>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {item.similarJobs?.length > 0 && (
                  <div className="grid gap-2">
                    {item.similarJobs.map((job) => (
                      <button key={job.id} type="button" onClick={() => patchEmbroidery(item.id, {
                        name: job.name,
                        widthCm: toNumber(job.widthCm, 0),
                        heightCm: toNumber(job.heightCm, 0),
                        points: toNumber(job.confirmedPoints ?? job.estimatedPoints, 0),
                        colorCount: toNumber(job.colorCount, 0),
                        complexity: job.complexity,
                        applicationCost: toNumber(job.applicationCost, 0),
                        pricePerK: toNumber(job.pricePerK, 0.9),
                        jobId: job.id,
                        status: job.isConfirmed ? 'CONFIRMED' : 'ESTIMATED',
                        previewImage: job.imageBase64 || null,
                        similarJobs: [],
                      })} className="text-left border border-gray-200 rounded-lg p-3 hover:border-orange-300 hover:bg-orange-50">
                        <p className="text-sm font-medium">{job.name}</p>
                        <p className="text-xs text-gray-500">R$ {toNumber(job.applicationCost, 0).toFixed(2)}/peca</p>
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input className="input" type="number" min="0" step="500" placeholder="Pontos" value={item.points || ''} onChange={(e) => patchEmbroidery(item.id, { points: toNumber(e.target.value, 0), status: 'ESTIMATED' })} />
                  <input className="input" type="number" min="0" step="0.01" placeholder="Preco/1000 pts" value={item.pricePerK || ''} onChange={(e) => patchEmbroidery(item.id, { pricePerK: toNumber(e.target.value, 0), status: 'ESTIMATED' })} />
                  <input className="input" type="number" min="0" step="0.01" placeholder="Aplicacao por peca" value={item.applicationCost || ''} onChange={(e) => patchEmbroidery(item.id, { applicationCost: toNumber(e.target.value, 0), status: 'ESTIMATED' })} />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={item.isNewProgram || false} onChange={(e) => patchEmbroidery(item.id, { isNewProgram: e.target.checked, programCost: e.target.checked ? (item.programCost || toNumber(setupCosts.embroideryProgram?.value, 0)) : 0, status: 'ESTIMATED' })} className="w-4 h-4 text-orange-600 rounded" />
                  Novo bordado? incluir custo do programa
                </label>
                {item.isNewProgram && (
                  <input className="input" type="number" min="0" step="0.01" placeholder="Custo do programa (R$ total)" value={item.programCost || ''} onChange={(e) => patchEmbroidery(item.id, { programCost: toNumber(e.target.value, 0), status: 'ESTIMATED' })} />
                )}

                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Custo deste bordado: <strong>R$ {toNumber(item.totalCostPerPiece, 0).toFixed(2)}/peca</strong>
                </div>
              </div>
            ))}

            {summary.embroideryStatus === 'ESTIMATED' && summary.embroideryTotal > 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800">Existindo algum bordado estimado, o orcamento ficara aguardando confirmacao do bordador.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={printItems.length > 0} onChange={(e) => syncPrintItems(e.target.checked ? [createPrintItem()] : [])} className="w-4 h-4 text-orange-600 rounded" />
            <span className="text-sm font-medium text-gray-800">Estampas</span>
          </label>
          <div className="flex items-center gap-3">
            {summary.printTotal > 0 && <span className="text-sm font-semibold text-orange-700">R$ {summary.printTotal.toFixed(2)}/peca</span>}
            {printItems.length > 0 && (
              <button type="button" onClick={() => syncPrintItems([...printItems, createPrintItem()])} className="inline-flex items-center gap-1 text-xs text-orange-700 border border-orange-200 px-2 py-1 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            )}
          </div>
        </div>

        {printItems.length > 0 && (
          <div className="p-4 space-y-4">
            {printItems.map((item, index) => (
              <div key={item.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-semibold text-gray-900">Estampa {index + 1}</p>
                  <button type="button" onClick={() => syncPrintItems(printItems.filter((entry) => entry.id !== item.id))} disabled={printItems.length === 1} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="input" placeholder="Descricao" value={item.name || ''} onChange={(e) => patchPrint(item.id, { name: e.target.value })} />
                  <input className="input" placeholder="Local / posicao" value={item.position || ''} onChange={(e) => patchPrint(item.id, { position: e.target.value })} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {PRINT_TYPES.map((type) => (
                    <button key={type.value} type="button" onClick={() => { const next = { ...item, type: type.value, needsScreenFrame: type.value === 'SILK_SCREEN' ? item.needsScreenFrame : false }; patchPrint(item.id, next); recalcPrint(item.id, next); }} className={`px-3 py-1.5 text-sm rounded-lg border ${item.type === type.value ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}>
                      {type.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input className="input" type="number" step="0.1" min="0" placeholder="Largura (cm)" value={item.widthCm || ''} onChange={(e) => { const next = { ...item, widthCm: toNumber(e.target.value, 0) }; patchPrint(item.id, { widthCm: next.widthCm }); recalcPrint(item.id, next); }} />
                  <input className="input" type="number" step="0.1" min="0" placeholder="Altura (cm)" value={item.heightCm || ''} onChange={(e) => { const next = { ...item, heightCm: toNumber(e.target.value, 0) }; patchPrint(item.id, { heightCm: next.heightCm }); recalcPrint(item.id, next); }} />
                  <input className="input" type="number" min="1" max="8" placeholder="Cores" value={item.colorCount || 1} onChange={(e) => { const next = { ...item, colorCount: toNumber(e.target.value, 1) }; patchPrint(item.id, { colorCount: next.colorCount }); recalcPrint(item.id, next); }} />
                  <input className="input" type="number" min="0" step="0.01" placeholder="Aplicacao por peca" value={item.applicationCostPerPiece || ''} onChange={(e) => patchPrint(item.id, { applicationCostPerPiece: toNumber(e.target.value, 0) })} />
                </div>

                {calcPrint[item.id] && <div className="flex items-center gap-2 text-xs text-orange-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando custo da tabela...</div>}

                {item.type === 'SILK_SCREEN' && (
                  <>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={item.needsScreenFrame || false} onChange={(e) => patchPrint(item.id, { needsScreenFrame: e.target.checked, screenFrameCost: e.target.checked ? (item.screenFrameCost || toNumber(setupCosts.screenFrame?.value, 0)) : 0 })} className="w-4 h-4 text-orange-600 rounded" />
                      Cliente novo / precisa fabricar quadro
                    </label>
                    {item.needsScreenFrame && (
                      <input className="input" type="number" min="0" step="0.01" placeholder="Custo do quadro (R$ total)" value={item.screenFrameCost || ''} onChange={(e) => patchPrint(item.id, { screenFrameCost: toNumber(e.target.value, 0) })} />
                    )}
                  </>
                )}

                <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Custo desta estampa: <strong>R$ {toNumber(item.totalCostPerPiece, 0).toFixed(2)}/peca</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {processTotal > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm">
          <div className="flex justify-between font-semibold">
            <span>Total Processos Produtivos</span>
            <span className="text-orange-700">R$ {processTotal.toFixed(2)}/peca</span>
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
