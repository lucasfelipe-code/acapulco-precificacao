import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleDollarSign, GripVertical, Package2 } from 'lucide-react';
import { crmAPI } from '../services/api';
import { formatCurrency } from '../utils/format';
import StatusBadge from '../components/ui/StatusBadge';
import toast from 'react-hot-toast';

const STAGES = [
  { key: 'BUDGET_GENERATED', label: 'Orcamento Gerado', color: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
  { key: 'SEND_QUOTE', label: 'Enviar Proposta', color: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { key: 'FOLLOW_UP', label: 'Acompanhamento', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { key: 'REVISION', label: 'Revisao', color: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  { key: 'WON', label: 'Fechado - Ganho', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { key: 'LOST', label: 'Fechado - Perdido', color: 'bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
];

export default function CrmPage() {
  const queryClient = useQueryClient();
  const dragId = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'pipeline'],
    queryFn: () => crmAPI.pipeline(),
    select: (res) => res.data?.pipeline || {},
    refetchInterval: 30000,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }) => crmAPI.moveStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'pipeline'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Erro ao mover orcamento');
    },
  });

  const handleDragStart = (e, id) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    if (dragId.current) {
      moveMutation.mutate({ id: dragId.current, stage });
      dragId.current = null;
    }
  };

  const stageEntries = STAGES.map((stage) => ({
    ...stage,
    quotes: data?.[stage.key] || [],
  }));

  const totalQuotes = stageEntries.reduce((sum, stage) => sum + stage.quotes.length, 0);
  const totalValue = stageEntries.reduce(
    (sum, stage) => sum + stage.quotes.reduce((stageSum, quote) => stageSum + (quote.totalOrderValue || 0), 0),
    0
  );
  const activeQuotes = stageEntries
    .filter((stage) => !['WON', 'LOST'].includes(stage.key))
    .reduce((sum, stage) => sum + stage.quotes.length, 0);
  const closedQuotes = totalQuotes - activeQuotes;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden border-orange-100 bg-gradient-to-r from-white via-orange-50 to-amber-50">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">Pipeline comercial</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">Pipeline CRM</h1>
            <p className="mt-1 text-sm text-gray-600">
              Layout com leitura mais clara, colunas padronizadas e melhor visibilidade das etapas.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[560px]">
            <MetricCard
              icon={Package2}
              label="Orcamentos"
              value={totalQuotes}
              helpText={`${activeQuotes} em andamento`}
            />
            <MetricCard
              icon={CircleDollarSign}
              label="Valor total"
              value={formatCurrency(totalValue)}
              helpText={`${closedQuotes} oportunidades encerradas`}
            />
            <MetricCard
              icon={ArrowRight}
              label="Fluxo"
              value={`${STAGES.length} etapas`}
              helpText="Arraste os cards entre as colunas"
            />
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="card flex h-64 items-center justify-center">
          <p className="text-gray-400">Carregando pipeline...</p>
        </div>
      ) : (
        <section className="card p-3 sm:p-4">
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Quadro de negociacoes</h2>
              <p className="text-xs text-gray-500">Colunas com largura fixa para manter alinhamento visual.</p>
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 md:flex">
              <GripVertical className="h-3.5 w-3.5" />
              Arraste e solte para atualizar a etapa
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
              {stageEntries.map((stage) => (
                <KanbanColumnWrapper
                  key={stage.key}
                  stage={stage}
                  quotes={stage.quotes}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function KanbanColumnWrapper({ stage, quotes, onDrop, onDragOver, onDragStart }) {
  const total = quotes.reduce((sum, q) => sum + (q.totalOrderValue || 0), 0);

  return (
    <div
      className={`flex min-h-[36rem] w-[20rem] shrink-0 flex-col rounded-2xl border ${stage.color} p-3 shadow-sm`}
      onDrop={(e) => onDrop(e, stage.key)}
      onDragOver={onDragOver}
    >
      <div className="mb-3 rounded-xl bg-white/85 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stage.dot}`} />
          <span className="flex-1 truncate text-sm font-semibold text-gray-800">{stage.label}</span>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
            {quotes.length}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Volume</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(total)}</p>
          </div>
          <p className="text-[11px] text-gray-400">{quotes.length === 1 ? '1 item' : `${quotes.length} itens`}</p>
        </div>
      </div>

      <div className="min-h-[26rem] flex-1 space-y-3 rounded-xl border border-white/60 bg-white/40 p-2">
        {quotes.map((q) => (
          <article
            key={q.id}
            draggable
            onDragStart={(e) => onDragStart(e, q.id)}
            className="group cursor-grab rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-mono font-bold text-orange-600">{q.number}</span>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{q.clientName}</p>
              </div>
              <StatusBadge status={q.status} />
            </div>

            <div className="space-y-1.5 text-xs text-gray-500">
              <p className="truncate">{q.productName}</p>
              <div className="flex items-center justify-between gap-3">
                <span>{q.quantity} pcs</span>
                {q.urgent && <span className="font-semibold text-red-600">Urgente</span>}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm font-semibold text-gray-800">{formatCurrency(q.totalOrderValue || 0)}</span>
              <Link
                to={`/quotes/${q.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-orange-600 transition-colors group-hover:text-orange-700"
              >
                Abrir
              </Link>
            </div>
          </article>
        ))}

        {quotes.length === 0 && (
          <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/70">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Nenhum orcamento</p>
              <p className="mt-1 text-xs text-gray-400">Solte um card aqui para mover a etapa</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, helpText }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 text-lg font-bold text-gray-900">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{helpText}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
