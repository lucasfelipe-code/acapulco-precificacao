/**
 * PriceUpdatePage.jsx — Gestão de preços de matéria-prima (Comprador)
 *
 * Fluxo:
 * 1. Carrega relatório de materiais com preço desatualizado (> 15 dias)
 * 2. Comprador digita novo preço temporário inline e salva em lote
 * 3. Após lançar NF no Sisplan, clica "Atualizar cache" para sincronizar com ERP
 */
import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Download, RefreshCw, AlertTriangle,
  CheckCircle, Search, ChevronUp, ChevronDown, Save, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pricesAPI } from '../services/api';

export default function PriceUpdatePage() {
  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRef]    = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [sortField, setSort]    = useState('staleDays');
  const [sortDir, setSortDir]   = useState('desc');
  // edits: { [codigo]: { novoPreco: string, nota: string } }
  const [edits, setEdits]       = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await pricesAPI.staleReport();
      setReport(data);
      // Pré-popula edits com overrides já salvos
      const pre = {};
      (data.items || []).forEach(m => {
        if (m.novoPreco != null) {
          pre[m.codigo] = { novoPreco: String(m.novoPreco), nota: m.nota || '' };
        }
      });
      setEdits(pre);
    } catch {
      toast.error('Erro ao carregar relatório de preços');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      toast.success('CSV baixado');
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

  const handleSaveAll = async () => {
    const updates = Object.entries(edits)
      .filter(([, v]) => v.novoPreco && parseFloat(v.novoPreco) > 0)
      .map(([codigo, v]) => {
        const item = report.items.find(m => m.codigo === codigo);
        return {
          codigo,
          descricao: item?.descricao || '',
          erpPreco:  item?.preco     || 0,
          novoPreco: parseFloat(v.novoPreco),
          nota:      v.nota || null,
        };
      });

    if (!updates.length) {
      toast.error('Nenhum preço temporário para salvar');
      return;
    }

    setSaving(true);
    try {
      await pricesAPI.priceUpdate(updates);
      toast.success(`${updates.length} preço(s) temporário(s) salvos`);
      await load();
    } catch {
      toast.error('Erro ao salvar preços');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOverride = async (codigo) => {
    try {
      await pricesAPI.removeOverride(codigo);
      setEdits(prev => { const n = { ...prev }; delete n[codigo]; return n; });
      setReport(prev => ({
        ...prev,
        items: prev.items.map(m => m.codigo === codigo ? { ...m, novoPreco: null, nota: null } : m),
      }));
      toast.success('Override removido');
    } catch {
      toast.error('Erro ao remover override');
    }
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-orange-500" />
      : <ChevronDown className="w-3 h-3 text-orange-500" />;
  };

  const items = (report?.items || [])
    .filter(m => !search ||
      m.descricao.toLowerCase().includes(search.toLowerCase()) ||
      m.codigo.includes(search))
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

  const pendingCount = Object.values(edits).filter(v => v.novoPreco && parseFloat(v.novoPreco) > 0).length;

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
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingCount > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : `Salvar ${pendingCount} preço(s)`}
            </button>
          )}
          <button onClick={handleDownloadCSV} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Baixar CSV
          </button>
          <button onClick={handleRefreshCache} disabled={refreshing}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Sincronizar ERP'}
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
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Preços temporários</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              {(report.items || []).filter(m => m.novoPreco != null).length}
            </p>
            <p className="text-xs text-blue-500 mt-0.5">aguardando NF no ERP</p>
          </div>
        </div>
      )}

      {/* Instrução */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold">Como atualizar preços:</p>
          <ol className="mt-1 space-y-0.5 list-decimal list-inside text-xs">
            <li>Digite o novo preço negociado na coluna <strong>"Novo Preço"</strong> — ele será usado nos orçamentos imediatamente</li>
            <li>Clique <strong>"Salvar"</strong> para persistir os preços temporários</li>
            <li>No Sisplan, lance a entrada de NF de compra para oficializar o preço</li>
            <li>Clique <strong>"Sincronizar ERP"</strong> para carregar o preço oficial — o temporário é removido automaticamente</li>
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
        {search && <p className="text-sm text-gray-500">{items.length} resultado(s)</p>}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando relatório...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
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
                  <span className="flex items-center gap-1 justify-end">Preço ERP <SortIcon field="preco" /></span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Última NF</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                  onClick={() => toggleSort('staleDays')}>
                  <span className="flex items-center gap-1 justify-end">Dias <SortIcon field="staleDays" /></span>
                </th>
                <th className="text-right px-4 py-3 font-medium text-blue-700 min-w-[160px]">
                  Novo Preço (temp.)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(m => {
                const edit = edits[m.codigo] || { novoPreco: '', nota: '' };
                const hasOverride = m.novoPreco != null;
                const isDirty = edit.novoPreco !== '' && parseFloat(edit.novoPreco) !== m.novoPreco;

                return (
                  <tr key={m.codigo} className={`hover:bg-gray-50 ${hasOverride ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.codigo}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <span className="truncate block">{m.descricao}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{m.grupo || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{m.unidade}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      R$ {m.preco.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {m.data ? new Date(m.data).toLocaleDateString('pt-BR') : 'Nunca'}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs ${staleDaysColor(m.staleDays)}`}>
                      {m.staleDays >= 999 ? 'Nunca' : `${m.staleDays}d`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder={m.preco.toFixed(4)}
                            value={edit.novoPreco}
                            onChange={e => setEdits(prev => ({
                              ...prev,
                              [m.codigo]: { ...edit, novoPreco: e.target.value },
                            }))}
                            className={`w-28 pl-7 pr-2 py-1 text-xs border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                              hasOverride && !isDirty
                                ? 'border-blue-300 bg-blue-50 text-blue-700 font-semibold'
                                : isDirty
                                ? 'border-orange-300 bg-orange-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          />
                        </div>
                        {hasOverride && (
                          <button
                            title="Remover preço temporário"
                            onClick={() => handleRemoveOverride(m.codigo)}
                            className="text-gray-400 hover:text-red-500 ml-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {hasOverride && !isDirty && m.overrideAt && (
                        <p className="text-xs text-blue-500 text-right mt-0.5">
                          salvo {new Date(m.overrideAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                    {report?.total === 0
                      ? <span className="flex items-center justify-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" /> Todos os materiais estão atualizados!
                        </span>
                      : 'Nenhum resultado para o filtro aplicado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Botão salvar flutuante quando há edições */}
      {pendingCount > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="btn-primary flex items-center gap-2 shadow-lg disabled:opacity-50 px-5 py-3"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : `Salvar ${pendingCount} preço(s) temporário(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
