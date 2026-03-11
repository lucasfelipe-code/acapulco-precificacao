/**
 * PriceUpdatePage.jsx — Gestão de preços de matéria-prima (Comprador)
 *
 * Fluxo:
 * 1. Carrega relatório de materiais com preço desatualizado (> 15 dias)
 * 2. Comprador pode baixar CSV para atualizar no ERP/planilha
 * 3. Após atualizar no Sisplan, clica "Atualizar cache" para recarregar
 */
import { useState, useEffect } from 'react';
import {
  DollarSign, Download, RefreshCw, AlertTriangle,
  CheckCircle, Search, ChevronUp, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pricesAPI } from '../services/api';

export default function PriceUpdatePage() {
  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRef]    = useState(false);
  const [search, setSearch]     = useState('');
  const [sortField, setSort]    = useState('staleDays');
  const [sortDir, setSortDir]   = useState('desc');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await pricesAPI.staleReport();
      setReport(data);
    } catch {
      toast.error('Erro ao carregar relatório de preços');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDownloadCSV = async () => {
    try {
      const { data } = await pricesAPI.staleCSV();
      const url  = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `materiais-desatualizados-${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV baixado com sucesso');
    } catch {
      toast.error('Erro ao gerar CSV');
    }
  };

  const handleRefreshCache = async () => {
    setRef(true);
    try {
      await pricesAPI.refreshCache();
      toast.success('Cache atualizado — recarregando relatório...');
      await load();
    } catch {
      toast.error('Erro ao atualizar cache');
    } finally {
      setRef(false);
    }
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-orange-500" />
      : <ChevronDown className="w-3 h-3 text-orange-500" />;
  };

  const items = (report?.items || [])
    .filter(m => !search || m.descricao.toLowerCase().includes(search.toLowerCase()) || m.codigo.includes(search))
    .sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      const r  = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? r : -r;
    });

  const staleDaysColor = (days) => {
    if (days >= 999) return 'text-red-700 font-semibold';
    if (days > 60)   return 'text-red-600 font-medium';
    if (days > 30)   return 'text-orange-600 font-medium';
    return 'text-yellow-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-orange-500" />
            Atualização de Preços — Matéria-Prima
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Materiais sem entrada de NF de compra há mais de 15 dias.
            Atualize os preços no ERP (Sisplan) e clique em "Atualizar cache".
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleDownloadCSV}
            className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Baixar CSV
          </button>
          <button onClick={handleRefreshCache} disabled={refreshing}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar cache'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {report && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Sem atualização</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{report.total}</p>
            <p className="text-xs text-red-500 mt-0.5">materiais desatualizados</p>
          </div>
          <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
            <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">Mais crítico</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">
              {items[0]?.staleDays >= 999 ? 'Nunca' : `${items[0]?.staleDays || 0}d`}
            </p>
            <p className="text-xs text-orange-500 mt-0.5 truncate">{items[0]?.descricao || '—'}</p>
          </div>
          <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Instrução</p>
            <p className="text-sm font-medium text-green-700 mt-1">Atualizar no Sisplan</p>
            <p className="text-xs text-green-500 mt-0.5">Entrada de NF de compra</p>
          </div>
        </div>
      )}

      {/* Como funciona */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold">Como atualizar preços:</p>
          <ol className="mt-1 space-y-0.5 list-decimal list-inside text-xs">
            <li>Baixe o CSV com a lista dos materiais desatualizados</li>
            <li>Consulte fornecedores e obtenha os preços atualizados</li>
            <li>No Sisplan, realize a entrada de NF de compra para cada material</li>
            <li>Clique em <strong>"Atualizar cache"</strong> para recarregar os preços no sistema</li>
          </ol>
        </div>
      </div>

      {/* Busca */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por descrição ou código..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {search && (
          <p className="text-sm text-gray-500">{items.length} resultado(s)</p>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando relatório...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                  onClick={() => toggleSort('codigo')}>
                  <span className="flex items-center gap-1">Código <SortIcon field="codigo" /></span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                  onClick={() => toggleSort('descricao')}>
                  <span className="flex items-center gap-1">Descrição <SortIcon field="descricao" /></span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Grupo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Un</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                  onClick={() => toggleSort('preco')}>
                  <span className="flex items-center gap-1 justify-end">Preço Atual <SortIcon field="preco" /></span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Última NF</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                  onClick={() => toggleSort('staleDays')}>
                  <span className="flex items-center gap-1 justify-end">Dias <SortIcon field="staleDays" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(m => (
                <tr key={m.codigo} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.codigo}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                    <span className="truncate block">{m.descricao}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{m.grupo || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.unidade}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    R$ {m.preco.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {m.data ? new Date(m.data).toLocaleDateString('pt-BR') : 'Nunca'}
                  </td>
                  <td className={`px-4 py-3 text-right text-xs ${staleDaysColor(m.staleDays)}`}>
                    {m.staleDays >= 999 ? 'Nunca' : `${m.staleDays}d`}
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400 text-sm">
                    {report?.total === 0
                      ? <span className="flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" /> Todos os materiais estão atualizados!
                        </span>
                      : 'Nenhum resultado para o filtro aplicado.'
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
