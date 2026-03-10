import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { quotesAPI } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'PENDING_APPROVAL', label: 'Aguardando' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Rejeitados' },
  { value: 'REVISION_REQUESTED', label: 'Revisão' },
];

export default function QuotesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', { search, status, page }],
    queryFn: () => quotesAPI.list({ search, status, page, limit: 20 }),
  });

  const result = data?.data || {};
  const quotes = result.quotes || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Orçamentos</h1>
        <Link to="/quotes/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Orçamento
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por número, cliente ou referência..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatus(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                status === f.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">Nenhum orçamento encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Número</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Referência</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Qtd</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Valor</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotes.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/quotes/${q.id}`} className="text-sm font-medium text-orange-600 hover:text-orange-700">
                      {q.number}
                    </Link>
                    {q.urgent && <span className="ml-1.5 text-xs text-red-500">⚡</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">{q.clientName}</p>
                    <p className="text-xs text-gray-400">{q.createdBy?.name}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm font-mono text-gray-600">{q.reference}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600">{q.quantity} pcs</td>
                  <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(q.totalOrderValue || 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-gray-400">
                    {formatDate(q.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {result.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">{result.total} orçamentos</p>
            <div className="flex gap-1">
              {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
