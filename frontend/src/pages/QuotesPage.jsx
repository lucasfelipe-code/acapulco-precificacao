import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { quotesAPI } from '../services/api';
import StatusBadge from '../components/ui/StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'PENDING_APPROVAL', label: 'Aguardando' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Rejeitados' },
  { value: 'REVISION_REQUESTED', label: 'Revisao' },
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
  const totalPages = result.totalPages || result.pages || 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Orcamentos</h1>
        <Link to="/quotes/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Orcamento
        </Link>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por numero, cliente ou referencia..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                status === filter.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">Nenhum orcamento encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Numero</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Referencia</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Qtd</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Valor</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/quotes/${quote.id}`} className="text-sm font-medium text-orange-600 hover:text-orange-700">
                      {quote.number}
                    </Link>
                    {quote.urgent && <span className="ml-1.5 text-xs text-red-500">⚡</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">{quote.clientName}</p>
                    <p className="text-xs text-gray-400">{quote.createdBy?.name || quote.user?.name || '-'}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-sm font-mono text-gray-600">{quote.reference}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600">{quote.quantity} pcs</td>
                  <td className="px-4 py-3"><StatusBadge status={quote.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(quote.totalOrderValue || 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-xs text-gray-400">
                    {formatDate(quote.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">{result.total} orcamentos</p>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((currentPage) => (
                <button
                  key={currentPage}
                  onClick={() => setPage(currentPage)}
                  className={`w-7 h-7 text-xs rounded ${
                    currentPage === page ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {currentPage}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
