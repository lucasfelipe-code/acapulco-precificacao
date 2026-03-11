import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { crmAPI } from '../services/api';
import { formatCurrency } from '../utils/format';
import StatusBadge from '../components/ui/StatusBadge';
import toast from 'react-hot-toast';

const STAGES = [
  { key: 'BUDGET_GENERATED', label: 'Orçamento Gerado',  color: 'bg-gray-100 border-gray-300',   dot: 'bg-gray-400' },
  { key: 'SEND_QUOTE',       label: 'Enviar Proposta',   color: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-400' },
  { key: 'FOLLOW_UP',        label: 'Acompanhamento',    color: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-400' },
  { key: 'REVISION',         label: 'Revisão',           color: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  { key: 'WON',              label: 'Fechado — Ganho',   color: 'bg-green-50 border-green-200',   dot: 'bg-green-500' },
  { key: 'LOST',             label: 'Fechado — Perdido', color: 'bg-red-50 border-red-200',       dot: 'bg-red-400' },
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
      toast.error(err.response?.data?.error || 'Erro ao mover orçamento');
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

  const pipeline = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">Arraste os orçamentos entre as colunas</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-400">Carregando pipeline...</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {STAGES.map((stage) => (
              <KanbanColumnWrapper
                key={stage.key}
                stage={stage}
                quotes={pipeline[stage.key] || []}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanColumnWrapper({ stage, quotes, onDrop, onDragOver, onDragStart }) {
  const total = quotes.reduce((sum, q) => sum + (q.totalOrderValue || 0), 0);

  return (
    <div
      className={`flex flex-col min-w-60 w-60 shrink-0 rounded-xl border-2 ${stage.color} p-3`}
      onDrop={(e) => onDrop(e, stage.key)}
      onDragOver={onDragOver}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${stage.dot}`} />
        <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{stage.label}</span>
        <span className="text-xs bg-white border border-gray-200 px-1.5 py-0.5 rounded-full text-gray-500 font-medium">
          {quotes.length}
        </span>
      </div>

      <div className="space-y-2 flex-1 min-h-20">
        {quotes.map((q) => (
          <div
            key={q.id}
            draggable
            onDragStart={(e) => onDragStart(e, q.id)}
            className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-orange-600">{q.number}</span>
              <StatusBadge status={q.status} />
            </div>
            <p className="text-sm font-medium text-gray-900 truncate">{q.clientName}</p>
            <p className="text-xs text-gray-500 truncate">{q.productName} · {q.quantity} pcs</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-semibold text-gray-800">{formatCurrency(q.totalOrderValue || 0)}</span>
              <Link
                to={`/quotes/${q.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-orange-600 hover:underline"
              >
                Ver
              </Link>
            </div>
            {q.urgent && (
              <span className="inline-block mt-1 text-xs text-red-600 font-medium">⚡ Urgente</span>
            )}
          </div>
        ))}
        {quotes.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center">
            <p className="text-xs text-gray-400">Solte aqui</p>
          </div>
        )}
      </div>

      {quotes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-right">{formatCurrency(total)}</p>
        </div>
      )}
    </div>
  );
}
