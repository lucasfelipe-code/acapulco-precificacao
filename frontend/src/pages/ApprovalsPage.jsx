import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { approvalsAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';

const DecisionModal = ({ approval, onClose, onDecide }) => {
  const [decision, setDecision] = useState('APPROVED');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    await onDecide(approval.quoteId, decision, notes);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-md">
        <h3 className="font-semibold text-gray-900 mb-1">Decisão de Aprovação</h3>
        <p className="text-sm text-gray-500 mb-4">{approval.quote.number} — {approval.quote.clientName}</p>

        <div className="space-y-2 mb-4">
          {[
            { value: 'APPROVED', label: '✅ Aprovar', color: 'border-green-400 bg-green-50 text-green-800' },
            { value: 'REJECTED', label: '❌ Rejeitar', color: 'border-red-400 bg-red-50 text-red-800' },
            { value: 'REVISION_REQUESTED', label: '🔄 Solicitar Revisão', color: 'border-blue-400 bg-blue-50 text-blue-800' },
          ].map((opt) => (
            <label key={opt.value} className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
              decision === opt.value ? opt.color : 'border-gray-200'
            }`}>
              <input type="radio" name="decision" value={opt.value} checked={decision === opt.value} onChange={() => setDecision(opt.value)} />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="mb-4">
          <label className="label">Observações {decision !== 'APPROVED' ? '*' : '(opcional)'}</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Justifique sua decisão..."
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            onClick={handle}
            disabled={loading || (decision !== 'APPROVED' && !notes)}
            className="btn-primary"
          >
            {loading ? 'Salvando...' : 'Confirmar Decisão'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [selectedApproval, setSelectedApproval] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => approvalsAPI.pending(),
    refetchInterval: 30_000,
  });

  const decideMutation = useMutation({
    mutationFn: ({ quoteId, decision, notes }) =>
      approvalsAPI.decide(quoteId, decision, notes),
    onSuccess: (_, vars) => {
      const labels = { APPROVED: 'aprovado', REJECTED: 'rejeitado', REVISION_REQUESTED: 'revisão solicitada' };
      toast.success(`Orçamento ${labels[vars.decision]}!`);
      qc.invalidateQueries(['approvals']);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro'),
  });

  const approvals = data?.data?.approvals || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Aprovações Pendentes</h1>
        <p className="text-sm text-gray-500">{approvals.length} aguardando sua decisão</p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : approvals.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma aprovação pendente!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{approval.quote.number}</span>
                    {approval.quote.urgent && <span className="text-xs text-red-600 font-medium">⚡ Urgente</span>}
                  </div>
                  <p className="text-sm text-gray-600">{approval.quote.clientName}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>Ref: {approval.quote.reference}</span>
                    <span>{approval.quote.quantity} pcs</span>
                    <span>{formatCurrency(approval.quote.totalOrderValue || 0)}</span>
                    <span>Margem: {(approval.quote.estimatedMargin || 0).toFixed(1)}%</span>
                    <span>Criado por {approval.quote.createdBy?.name}</span>
                    <span>{formatDate(approval.createdAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedApproval(approval)}
                  className="btn-primary"
                >
                  Decidir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedApproval && (
        <DecisionModal
          approval={selectedApproval}
          onClose={() => setSelectedApproval(null)}
          onDecide={(quoteId, decision, notes) =>
            decideMutation.mutateAsync({ quoteId, decision, notes })
          }
        />
      )}
    </div>
  );
}
