import { useQuery } from '@tanstack/react-query';
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { quotesAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="card p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  </div>
);

export default function DashboardPage() {
  const { user, hasRole } = useAuthStore();

  const { data: quotesData } = useQuery({
    queryKey: ['quotes', 'recent'],
    queryFn: () => quotesAPI.list({ limit: 5 }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['quotes', 'stats'],
    queryFn: () => quotesAPI.stats(),
    enabled: hasRole('ADMIN', 'APPROVER'),
  });

  const quotes = quotesData?.data?.quotes || [];
  const stats = statsData?.data || {};
  const byStatus = stats.byStatus || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Olá, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link to="/quotes/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Orçamento
        </Link>
      </div>

      {/* Stats */}
      {hasRole('ADMIN', 'APPROVER') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total de Orçamentos"
            value={stats.total || 0}
            icon={FileText}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="Aguardando Aprovação"
            value={byStatus.PENDING_APPROVAL || 0}
            icon={Clock}
            color="bg-yellow-50 text-yellow-600"
          />
          <StatCard
            label="Aprovados"
            value={byStatus.APPROVED || 0}
            icon={CheckCircle}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            label="Valor Aprovado (30d)"
            value={formatCurrency(stats.approvedValueLast30Days || 0)}
            icon={TrendingUp}
            color="bg-orange-50 text-orange-600"
          />
        </div>
      )}

      {/* Recent Quotes */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Orçamentos Recentes</h2>
          <Link to="/quotes" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
            Ver todos
          </Link>
        </div>

        {quotes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhum orçamento ainda</p>
            <Link to="/quotes/new" className="btn-primary mt-4 inline-flex">
              Criar primeiro orçamento
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {quotes.map((quote) => (
              <Link
                key={quote.id}
                to={`/quotes/${quote.id}`}
                className="flex items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{quote.number}</span>
                    <StatusBadge status={quote.status} />
                    {quote.urgent && (
                      <span className="text-xs text-red-600 font-medium">⚡ Urgente</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {quote.clientName} · Ref: {quote.reference} · {quote.quantity} pcs
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatCurrency(quote.totalOrderValue || 0)}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(quote.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
