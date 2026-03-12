import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { quotesAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

function getApprovalStatus(approval) {
  return approval.status || approval.decision || 'PENDING_APPROVAL';
}

function getApprovalUser(approval) {
  return approval.approver || approval.user || null;
}

export default function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesAPI.get(id),
  });

  const submitMutation = useMutation({
    mutationFn: () => quotesAPI.submit(id),
    onSuccess: () => {
      toast.success('Enviado para aprovacao!');
      queryClient.invalidateQueries({ queryKey: ['quote', id] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Erro'),
  });

  const quote = data?.data?.quote;

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400">Carregando...</div>;
  }

  if (!quote) {
    return <div className="text-center py-16 text-red-500">Orcamento nao encontrado</div>;
  }

  const ownerId = quote.createdById ?? quote.createdByUserId ?? quote.createdBy ?? null;
  const creatorName = quote.createdBy?.name || quote.user?.name || '-';
  const marginPercent = quote.marginPercent ?? quote.estimatedMargin ?? 0;
  const markupPercent = quote.markupPercent ?? quote.markup ?? 0;
  const discountPercent = quote.discountPercent ?? quote.discount ?? 0;
  const isOwner = ownerId === user?.id;
  const canSubmit = isOwner && ['DRAFT', 'REVISION_REQUESTED'].includes(quote.status);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
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
          <p className="text-sm text-gray-500">
            Criado por {creatorName} em {formatDate(quote.createdAt)}
          </p>
        </div>

        {canSubmit && (
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="btn-primary"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? 'Enviando...' : 'Enviar para Aprovacao'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Pedido</h3>
          <dl className="space-y-2">
            {[
              ['Cliente', quote.clientName],
              ['Segmento', quote.clientSegment],
              ['Referencia', quote.reference],
              ['Produto', quote.productName],
              ['Tipo', quote.itemType],
              ['Quantidade', `${quote.quantity} pcs`],
              ['Tipo Pedido', quote.orderType === 'RETAIL' ? 'Varejo' : 'Atacado'],
            ].filter(([, value]) => value).map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card p-5 bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
          <h3 className="text-sm font-semibold text-orange-700 mb-3">Resultado Financeiro</h3>
          <dl className="space-y-2">
            {[
              ['Custo por Peca', formatCurrency(quote.costPerPiece)],
              ['Preco por Peca', formatCurrency(quote.pricePerPiece)],
              ['Margem', `${marginPercent.toFixed(1)}%`],
              ['Markup', `${markupPercent}%`],
              ['Desconto', `${discountPercent}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-gray-600">{label}</dt>
                <dd className="font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 border-t border-orange-200">
              <dt className="font-semibold text-gray-700">Total do Pedido</dt>
              <dd className="font-bold text-orange-700 text-base">{formatCurrency(quote.totalOrderValue)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {quote.approvals?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Historico de Aprovacao</h3>
          <div className="space-y-2">
            {quote.approvals.map((approval) => {
              const approvalStatus = getApprovalStatus(approval);
              const approvalUser = getApprovalUser(approval);

              return (
                <div key={approval.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <StatusBadge status={approvalStatus} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{approvalUser?.name || '-'}</p>
                    {approval.notes && <p className="text-xs text-gray-500 mt-0.5">{approval.notes}</p>}
                  </div>
                  <p className="text-xs text-gray-400">{formatDate(approval.updatedAt || approval.createdAt)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quote.notes && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Observacoes</h3>
          <p className="text-sm text-gray-600">{quote.notes}</p>
        </div>
      )}
    </div>
  );
}
