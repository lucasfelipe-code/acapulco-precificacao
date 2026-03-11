import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, AlertTriangle, CheckCircle, RefreshCw, Zap,
  ChevronDown, X, UserPlus, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { productsAPI, clientsAPI } from '../../../services/api';

const SEGMENTS = ['Saúde', 'Indústria', 'Corporativo', 'Educação', 'Gastronomia', 'Segurança', 'Outro'];
const ORDER_TYPES = [{ value: 'RETAIL', label: 'Varejo' }, { value: 'WHOLESALE', label: 'Atacado' }];

// ─── Combobox genérico ───────────────────────────────────────────────────────
function Combobox({ items, value, onInput, onSelect, onClear, placeholder, loading, renderItem, noResultsMsg, footer }) {
  const [open, setOpen]           = useState(false);
  const [highlighted, setHl]      = useState(0);
  const containerRef              = useRef(null);
  const inputRef                  = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKey = (e) => {
    if (!open && e.key === 'ArrowDown') { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHl(h => Math.min(h + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setHl(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')      { if (items[highlighted]) { onSelect(items[highlighted]); setOpen(false); } }
    if (e.key === 'Escape')     { setOpen(false); }
    if (e.key === 'Tab')        { setOpen(false); }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          className="input pr-8"
          value={value}
          onChange={(e) => { onInput(e.target.value); setOpen(true); setHl(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={loading ? 'Carregando...' : placeholder}
          autoComplete="off"
        />
        <span className="absolute right-2 flex items-center gap-1 text-gray-400">
          {value
            ? <button type="button" onClick={() => { onClear(); setOpen(false); }} className="hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            : <ChevronDown className="w-3.5 h-3.5 pointer-events-none" />
          }
        </span>
      </div>

      {open && (items.length > 0 || footer) && (
        <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {items.map((item, i) => (
            <li
              key={i}
              onMouseDown={() => { onSelect(item); setOpen(false); }}
              onMouseEnter={() => setHl(i)}
              className={`px-3 py-2 cursor-pointer ${i === highlighted ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
            >
              {renderItem(item, i === highlighted)}
            </li>
          ))}
          {footer && (
            <li onMouseDown={() => { footer.action(); setOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer text-orange-600 font-medium border-t border-gray-100 hover:bg-orange-50">
              {footer.icon}
              {footer.label}
            </li>
          )}
        </ul>
      )}

      {open && items.length === 0 && !footer && value && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg px-3 py-2.5 text-sm text-gray-500">
          {noResultsMsg || 'Nenhum resultado encontrado'}
        </div>
      )}
    </div>
  );
}

// ─── ClientSection ───────────────────────────────────────────────────────────
function ClientSection({ data, update }) {
  const [query, setQuery]           = useState(data.clientName || '');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [newClient, setNewClient]   = useState({ name: '', cnpj: '', phone: '', segment: '' });
  const debounceRef                 = useRef(null);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      clientsAPI.search(query)
        .then(({ data: list }) => setResults(list))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const selectClient = (client) => {
    setQuery(client.name);
    update({
      clientId:      client.id,
      clientName:    client.name,
      clientSegment: client.segment || data.clientSegment,
      clientCnpj:    client.cnpj   || null,
    });
  };

  const clearClient = () => {
    setQuery('');
    update({ clientId: null, clientName: '', clientSegment: '', clientCnpj: null });
  };

  const saveNewClient = async () => {
    if (!newClient.name.trim()) { toast.error('Informe o nome do cliente'); return; }
    setSaving(true);
    try {
      const { data: created } = await clientsAPI.create({
        name:    newClient.name.trim(),
        cnpj:    newClient.cnpj    || null,
        phone:   newClient.phone   || null,
        segment: newClient.segment || null,
      });
      selectClient(created);
      setManualMode(false);
      toast.success('Cliente cadastrado com sucesso');
    } catch {
      toast.error('Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  };

  if (manualMode) {
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" /> Novo Cliente
          </p>
          <button type="button" onClick={() => setManualMode(false)} className="text-xs text-blue-600 hover:underline">
            Cancelar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Nome *</label>
            <input className="input" value={newClient.name}
              onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
              placeholder="Razão social ou nome" />
          </div>
          <div>
            <label className="label">CNPJ</label>
            <input className="input" value={newClient.cnpj}
              onChange={e => setNewClient(p => ({ ...p, cnpj: e.target.value }))}
              placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={newClient.phone}
              onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))}
              placeholder="(00) 00000-0000" />
          </div>
          <div className="col-span-2">
            <label className="label">Segmento</label>
            <select className="input" value={newClient.segment}
              onChange={e => setNewClient(p => ({ ...p, segment: e.target.value }))}>
              <option value="">Selecione...</option>
              {SEGMENTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={saveNewClient} disabled={saving}
            className="btn-primary text-sm py-1.5">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Salvar Cliente
          </button>
          <button type="button"
            onClick={() => { update({ clientName: newClient.name, clientId: null }); setQuery(newClient.name); setManualMode(false); }}
            className="btn-secondary text-sm py-1.5">
            Usar sem salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Cliente *</label>
          <Combobox
            items={results}
            value={query}
            onInput={(v) => { setQuery(v); update({ clientName: v, clientId: null }); }}
            onSelect={selectClient}
            onClear={clearClient}
            placeholder="Busque pelo nome ou CNPJ..."
            loading={searching}
            noResultsMsg={`"${query}" não encontrado — cadastre um novo cliente`}
            renderItem={(c) => (
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {[c.cnpj, c.segment, c.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )}
            footer={{ icon: <UserPlus className="w-4 h-4" />, label: 'Cadastrar novo cliente...', action: () => { setNewClient({ name: query, cnpj: '', phone: '', segment: '' }); setManualMode(true); } }}
          />
          {data.clientId && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Cliente vinculado ao cadastro
            </p>
          )}
        </div>

        <div>
          <label className="label">Segmento</label>
          <select className="input" value={data.clientSegment || ''}
            onChange={(e) => update({ clientSegment: e.target.value })}>
            <option value="">Selecione...</option>
            {SEGMENTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {data.clientCnpj && (
          <div>
            <label className="label">CNPJ</label>
            <input className="input bg-gray-50" value={data.clientCnpj} readOnly />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ProductSection ──────────────────────────────────────────────────────────
function ProductSection({ data, update }) {
  const [allProducts, setAllProducts] = useState([]);
  const [query, setQuery]             = useState(data.reference || '');
  const [loadingList, setLoadingList] = useState(false);
  const [searching, setSearching]     = useState(false);
  const [erpError, setErpError]       = useState(null);
  const [selectedSizes, setSelectedSizes] = useState([]);

  useEffect(() => {
    setLoadingList(true);
    productsAPI.list()
      .then(({ data: list }) => setAllProducts(Array.isArray(list) ? list : []))
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => { setQuery(data.reference || ''); }, [data.reference]);

  const filtered = query.length === 0
    ? allProducts.slice(0, 8)
    : allProducts.filter(p =>
        p.codigo.toLowerCase().includes(query.toLowerCase()) ||
        p.descricao.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8);

  const doSearch = useCallback(async (code, forceRefresh = false) => {
    if (!code) { toast.error('Selecione ou digite a referência'); return; }
    setSearching(true);
    setErpError(null);
    try {
      const { data: res } = await productsAPI.getByReference(code, forceRefresh);
      setSelectedSizes([]);
      update({
        reference:        code,
        productName:      res.product?.name,
        itemType:         res.product?.itemType || '',
        erpProductData:   res.product,
        materials:        res.materials        || [],
        fabricationItems: res.fabricationItems || [],
        erpMarkup:         res.markup,
        markupCoeficiente: res.markup?.coeficiente  ?? null,
        markupSource:      res.markup ? 'ERP' : 'MANUAL',
        erpSalePrice:      res.erpSalePrice,
        hasStale:          res.hasStale,
        sizes:            [],
      });
      toast.success(res.hasStale
        ? `Produto carregado — ${res.staleItems?.length} material(is) com preço a revisar`
        : 'Produto carregado do ERP'
      );
    } catch (err) {
      const errData = err.response?.data;
      setErpError({
        type:    errData?.code === 'ERP_DATA_STALE' ? 'stale' : 'notfound',
        message: errData?.error || 'Produto não encontrado no ERP',
        details: errData?.details,
      });
      update({ erpProductData: null });
    } finally {
      setSearching(false);
    }
  }, [update]);

  const selectProduct = (product) => {
    setQuery(product.codigo);
    update({ reference: product.codigo, erpProductData: null });
    setErpError(null);
    doSearch(product.codigo);
  };

  const erpSizes = data.erpProductData?.sizes || [];

  const toggleSize = (size) => {
    const next = selectedSizes.includes(size)
      ? selectedSizes.filter(s => s !== size)
      : [...selectedSizes, size];
    setSelectedSizes(next);
    update({ sizes: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Referência do Produto (ERP) *</label>
        <div>
          <div>
            <Combobox
              items={filtered}
              value={query}
              onInput={(v) => { setQuery(v); update({ reference: v, erpProductData: null }); setErpError(null); }}
              onSelect={selectProduct}
              onClear={() => { setQuery(''); update({ reference: '', erpProductData: null }); setErpError(null); }}
              placeholder={loadingList ? 'Carregando catálogo...' : 'Código ou nome do produto'}
              loading={searching}
              noResultsMsg={`"${query}" não encontrado no catálogo`}
              renderItem={(p) => (
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-orange-700 text-xs shrink-0">{p.codigo}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{p.descricao}</p>
                    {p.descricao2 && <p className="text-xs text-gray-500 truncate">{p.descricao2}</p>}
                  </div>
                  {p.grupo && <span className="ml-auto shrink-0 text-xs text-gray-400">{p.grupo}</span>}
                </div>
              )}
              footer={query ? {
                icon: searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />,
                label: searching ? `Buscando "${query}" no ERP...` : `Buscar "${query}" direto no ERP`,
                action: () => doSearch(query),
              } : null}
            />
          </div>
        </div>

        {/* ERP feedback */}
        {erpError?.type === 'stale' && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Dados desatualizados no ERP</p>
                <p className="text-xs text-yellow-700 mt-0.5">{erpError.message}</p>
                <button onClick={() => doSearch(query, true)} disabled={searching}
                  className="mt-1.5 text-xs text-yellow-700 font-medium underline">
                  Forçar atualização
                </button>
              </div>
            </div>
          </div>
        )}

        {erpError?.type === 'notfound' && (
          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {erpError.message}
          </p>
        )}

        {data.erpProductData && !erpError && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800 truncate">{data.erpProductData?.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {data.erpSalePrice && (
                    <p className="text-xs text-green-600">Preço ERP: R$ {Number(data.erpSalePrice).toFixed(2)}</p>
                  )}
                  {data.erpProductData?.itemType && (
                    <p className="text-xs text-gray-500">{data.erpProductData.itemType}</p>
                  )}
                </div>
              </div>
              {data.hasStale && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full shrink-0">
                  Preço a revisar
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tamanhos vindos do ERP */}
      {erpSizes.length > 0 && (
        <div>
          <label className="label">
            Tamanhos
            <span className="text-xs font-normal text-gray-400 ml-2">(da grade ERP — selecione os do pedido)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {erpSizes.map(size => (
              <button key={size} type="button" onClick={() => toggleSize(size)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  selectedSizes.includes(size)
                    ? 'bg-orange-600 border-orange-600 text-white'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'
                }`}>
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Se produto carregado mas sem grade ERP */}
      {data.erpProductData && erpSizes.length === 0 && (
        <div>
          <label className="label">Tamanhos <span className="text-xs font-normal text-gray-400 ml-1">(livre — grade não disponível no ERP)</span></label>
          <input className="input" placeholder="Ex: P, M, G, GG"
            value={data.sizesText || ''}
            onChange={e => update({ sizesText: e.target.value, sizes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Step1OrderData ──────────────────────────────────────────────────────────
export default function Step1OrderData({ data, update, onNext }) {
  const canProceed = data.clientName?.trim() && data.reference && data.quantity >= 1 && data.erpProductData;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Etapa 1 — Dados do Pedido</h2>
        <p className="text-sm text-gray-500 mt-0.5">Cliente, produto e quantidades</p>
      </div>

      {/* ─── Cliente ─── */}
      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</h3>
        <ClientSection data={data} update={update} />
      </section>

      <hr className="border-gray-100" />

      {/* ─── Produto ─── */}
      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</h3>
        <ProductSection data={data} update={update} />
      </section>

      <hr className="border-gray-100" />

      {/* ─── Pedido ─── */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pedido</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Quantidade *</label>
            <input type="number" min="1" className="input"
              value={data.quantity}
              onChange={(e) => update({ quantity: parseInt(e.target.value) || 1 })} />
          </div>
          <div>
            <label className="label">Tipo de Pedido</label>
            <select className="input" value={data.orderType}
              onChange={(e) => update({ orderType: e.target.value })}>
              {ORDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <input type="checkbox" id="urgent" checked={data.urgent}
              onChange={(e) => update({ urgent: e.target.checked })}
              className="w-4 h-4 rounded text-orange-600" />
            <label htmlFor="urgent" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer">
              <Zap className="w-3.5 h-3.5 text-orange-500" />
              Pedido Urgente (+15% sobre custo total)
            </label>
          </div>
        </div>
      </section>

      {/* ─── Navegação ─── */}
      <div className="flex justify-end pt-2">
        <button onClick={onNext} disabled={!canProceed} className="btn-primary">
          Próxima Etapa →
        </button>
      </div>
      {!canProceed && (
        <p className="text-xs text-gray-400 text-right -mt-2">
          Preencha cliente, busque o produto no ERP e informe a quantidade para continuar
        </p>
      )}
    </div>
  );
}
