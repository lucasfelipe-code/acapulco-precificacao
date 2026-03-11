import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Clock, CheckCircle, TrendingUp, Plus, Filter, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { quotesAPI, usersAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

// ─── Atalhos de período ───────────────────────────────────────────────────────
const todayRange = () => {
  const d = new Date().toISOString().slice(0, 10);
  return { dateFrom: d, dateTo: d, label: 'Hoje' };
};
const weekRange = () => {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - now.getDay() + 1);
  return { dateFrom: mon.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10), label: 'Esta semana' };
};
const monthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: first.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10), label: 'Este mês' };
};
const QUICK_FILTERS = [
  { label: 'Hoje',        fn: todayRange },
  { label: 'Esta semana', fn: weekRange },
  { label: 'Este mês',    fn: monthRange },
];

// ─── StatCard ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className="card p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  </div>
);

export default function DashboardPage() {
  const { user, hasRole } = useAuthStore();
  const isManager = hasRole('ADMIN', 'APPROVER');

  // ─── Filtros (somente gerenciais) ─────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', userId: '', quick: '' });

  const statsParams = useMemo(() => {
    if (!isManager) return {};
    const p = {};
    if (filters.dateFrom) p.dateFrom = filters.dateFrom;
    if (filters.dateTo)   p.dateTo   = filters.dateTo;
    if (filters.userId)   p.userId   = filters.userId;
    return p;
  }, [filters, isManager]);

  const hasActiveFilter = isManager && !!(filters.dateFrom || filters.dateTo || filters.userId);

  const applyQuick = (fn) => {
    const { dateFrom, dateTo, label } = fn();
    setFilters(f => ({ ...f, dateFrom, dateTo, quick: label }));
  };
  const clearFilters = () => setFilters({ dateFrom: '', dateTo: '', userId: '', quick: '' });

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: quotesData } = useQuery({
    queryKey: ['quotes', 'recent'],
    queryFn:  () => quotesAPI.list({ limit: 5 }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['quotes', 'stats', statsParams],
    queryFn:  () => quotesAPI.stats(statsParams),
    enabled:  isManager,
  });

  const { data: sellersData } = useQuery({
    queryKey: ['users', 'sellers'],
    queryFn:  () => usersAPI.sellers(),
    enabled:  isManager,
  });

  const quotes  = quotesData?.data?.quotes || [];
  const stats   = statsData?.data || {};
  const sellers = sellersData?.data?.sellers || [];

  const periodLabel = [
    filters.dateFrom && filters.dateTo
      ? `${new Date(filters.dateFrom + 'T00:00').toLocaleDateString('pt-BR')} – ${new Date(filters.dateTo + 'T00:00').toLocaleDateString('pt-BR')}`
      : filters.dateFrom ? `A partir de ${new Date(filters.dateFrom + 'T00:00').toLocaleDateString('pt-BR')}`
      : filters.dateTo   ? `Até ${new Date(filters.dateTo + 'T00:00').toLocaleDateString('pt-BR')}` : null,
    filters.userId && sellers.find(s => String(s.id) === filters.userId)?.name,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Olá, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                hasActiveFilter
                  ? 'border-orange-400 bg-orange-50 text-orange-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {hasActiveFilter && <span className="w-2 h-2 rounded-full bg-orange-500" />}
            </button>
          )}
          <Link to="/quotes/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Orçamento
          </Link>
        </div>
      </div>

      {/* Painel de filtros — visível somente para ADMIN e APPROVER */}
      {isManager && showFilters && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Filtros gerenciais</p>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
                <X className="w-3 h-3" /> Limpar filtros
              </button>
            )}
          </div>

          {/* Atalhos rápidos */}
          <div className="flex gap-2 flex-wrap">
            {QUICK_FILTERS.map(q => (
              <button
                key={q.label}
                onClick={() => applyQuick(q.fn)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  filters.quick === q.label
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Intervalo personalizado + vendedor */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">De</label>
              <input
                type="date"
                className="input text-sm"
                value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value, quick: '' }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Até</label>
              <input
                type="date"
                className="input text-sm"
                value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value, quick: '' }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Vendedor</label>
              <select
                className="input text-sm"
                value={filters.userId}
                onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))}
              >
                <option value="">Todos os vendedores</option>
                {sellers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilter && (
            <p className="text-xs text-orange-600 font-medium">{periodLabel}</p>
          )}
        </div>
      )}

      {/* Cards de stats — somente ADMIN/APPROVER */}
      {isManager && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total de Orçamentos"
            value={stats.total ?? 0}
            icon={FileText}
            color="bg-blue-50 text-blue-600"
            sub={hasActiveFilter ? 'no período selecionado' : 'histórico geral'}
          />
          <StatCard
            label="Aguardando Aprovação"
            value={stats.pending ?? 0}
            icon={Clock}
            color="bg-yellow-50 text-yellow-600"
          />
          <StatCard
            label="Aprovados"
            value={stats.approved ?? 0}
            icon={CheckCircle}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            label={hasActiveFilter ? 'Valor no Período' : 'Valor Aprovado (30d)'}
            value={formatCurrency(stats.approvedValueLast30Days ?? 0)}
            icon={TrendingUp}
            color="bg-orange-50 text-orange-600"
          />
        </div>
      )}

      {/* Orçamentos recentes */}
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
            <Link to="/quotes/new" className="btn-primary mt-4 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Criar primeiro orçamento
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
                    {isManager && quote.user?.name && (
                      <span className="text-gray-400"> · {quote.user.name}</span>
                    )}
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
