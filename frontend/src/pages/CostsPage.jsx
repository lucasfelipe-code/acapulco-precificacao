import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { costsAPI } from '../services/api';

const PROCESSES = ['CUT', 'SEW', 'EMBROIDERY', 'PRINT', 'FINISHING', 'WASH'];
const UNITS = ['PER_PIECE', 'PER_HOUR', 'PER_CM2', 'PER_1000_POINTS'];

const processLabel = { CUT: 'Corte', SEW: 'Costura', EMBROIDERY: 'Bordado', PRINT: 'Estampa', FINISHING: 'Acabamento', WASH: 'Lavagem' };
const unitLabel = { PER_PIECE: 'por peça', PER_HOUR: 'por hora', PER_CM2: 'por cm²', PER_1000_POINTS: 'por 1000 pts' };

const processColor = { CUT: 'bg-blue-100 text-blue-700', SEW: 'bg-purple-100 text-purple-700', EMBROIDERY: 'bg-orange-100 text-orange-700', PRINT: 'bg-green-100 text-green-700', FINISHING: 'bg-gray-100 text-gray-700', WASH: 'bg-cyan-100 text-cyan-700' };

const emptyForm = { process: 'CUT', description: '', unitCost: '', unit: 'PER_PIECE' };

export default function CostsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['costs'],
    queryFn: () => costsAPI.list(),
  });

  const createMutation = useMutation({
    mutationFn: costsAPI.create,
    onSuccess: () => { toast.success('Custo adicionado!'); qc.invalidateQueries(['costs']); setShowForm(false); setForm(emptyForm); },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => costsAPI.update(id, data),
    onSuccess: () => { toast.success('Custo atualizado!'); qc.invalidateQueries(['costs']); setEditId(null); },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro'),
  });

  const deleteMutation = useMutation({
    mutationFn: costsAPI.delete,
    onSuccess: () => { toast.success('Custo desativado!'); qc.invalidateQueries(['costs']); },
  });

  const costs = data?.data?.costs || [];
  const grouped = costs.reduce((acc, c) => { (acc[c.process] = acc[c.process] || []).push(c); return acc; }, {});

  const handleSave = () => {
    const payload = { ...form, unitCost: parseFloat(form.unitCost) };
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Custos de Fabricação</h1>
          <p className="text-sm text-gray-500">Tabela de referência para orçamentos</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Custo
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5">
          <h3 className="font-medium text-gray-900 mb-4">{editId ? 'Editar' : 'Novo'} Custo</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Processo</label>
              <select className="input" value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })}>
                {PROCESSES.map((p) => <option key={p} value={p}>{processLabel[p]}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Descrição</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Costura simples por peça" />
            </div>
            <div>
              <label className="label">Custo (R$)</label>
              <input type="number" step="0.01" min="0" className="input" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <label className="label">Unidade</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{unitLabel[u]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={!form.description || !form.unitCost} className="btn-primary">
              <Check className="w-4 h-4" /> Salvar
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="btn-secondary">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Grouped costs */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-4">
          {PROCESSES.filter((p) => grouped[p]?.length).map((process) => (
            <div key={process} className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${processColor[process]}`}>
                  {processLabel[process]}
                </span>
                <span className="text-xs text-gray-400">{grouped[process].length} itens</span>
              </div>
              <table className="w-full">
                <tbody>
                  {grouped[process].map((cost) => (
                    <tr key={cost.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-700">{cost.description}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-900 text-right">
                        R$ {cost.unitCost.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 text-right">{unitLabel[cost.unit]}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => { setForm({ process: cost.process, description: cost.description, unitCost: cost.unitCost, unit: cost.unit }); setEditId(cost.id); setShowForm(true); }}
                            className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(cost.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
