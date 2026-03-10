import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { quotesAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

export default function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasRole } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesAPI.get(id),
  });

  const submitMutation = useMutation({
    mutationFn: () => quotesAPI.submit(id),
    onSuccess: () => {
      toast.success('Enviado para aprovação!');
      qc.invalidateQueries(['quote', id]);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro'),
  });

  const quote = data?.data?.quote;
  if (isLoading) return <div className="text-center py-16 text-gray-400">Carregando...</div>;
  if (!quote) return <div className="text-center py-16 text-red-500">Orçamento não encontrado</div>;

  const isOwner = quote.createdById === user?.id;
  const canSubmit = isOwner && ['DRAFT', 'REVISION_REQUESTED'].includes(quote.status);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{quote.number}</h1>
            <StatusBadge status={quote.status} />
            {quote.urgent && <span className="text-sm text-red-600 font-medium">⚡ Urgente</span>}
          </div>
          <p className="text-sm text-gray-500">Criado por {quote.createdBy?.name} em {formatDate(quote.createdAt)}</p>
        </div>
        {canSubmit && (
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="btn-primary"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? 'Enviando...' : 'Enviar para Aprovação'}
          </button>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client & Product */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Pedido</h3>
          <dl className="space-y-2">
            {[
              ['Cliente', quote.clientName],
              ['Segmento', quote.clientSegment],
              ['Referência', quote.reference],
              ['Produto', quote.productName],
              ['Tipo', quote.itemType],
              ['Quantidade', `${quote.quantity} pcs`],
              ['Tipo Pedido', quote.orderType === 'RETAIL' ? 'Varejo' : 'Atacado'],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Pricing summary */}
        <div className="card p-5 bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
          <h3 className="text-sm font-semibold text-orange-700 mb-3">Resultado Financeiro</h3>
          <dl className="space-y-2">
            {[
              ['Custo por Peça', formatCurrency(quote.costPerPiece)],
              ['Preço por Peça', formatCurrency(quote.pricePerPiece)],
              ['Margem', `${(quote.estimatedMargin || 0).toFixed(1)}%`],
              ['Markup', `${quote.markup}%`],
              ['Desconto', `${quote.discount || 0}%`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <dt className="text-gray-600">{k}</dt>
                <dd className="font-semibold text-gray-900">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 border-t border-orange-200">
              <dt className="font-semibold text-gray-700">Total do Pedido</dt>
              <dd className="font-bold text-orange-700 text-base">{formatCurrency(quote.totalOrderValue)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Approvals */}
      {quote.approvals?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Histórico de Aprovação</h3>
          <div className="space-y-2">
            {quote.approvals.map((approval) => (
              <div key={approval.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <StatusBadge status={approval.status} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{approval.approver?.name}</p>
                  {approval.notes && (
                    <p className="text-xs text-gray-500 mt-0.5">{approval.notes}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400">{formatDate(approval.updatedAt || approval.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {quote.notes && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Observações</h3>
          <p className="text-sm text-gray-600">{quote.notes}</p>
        </div>
      )}
    </div>
  );
}
