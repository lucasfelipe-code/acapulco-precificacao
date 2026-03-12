/**
 * UsersPage.jsx — Gestão de usuários (somente Administrador)
 * CRUD completo: criar, editar role/status, redefinir senha, desativar.
 */
import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Key, UserX, UserCheck, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersAPI } from '../services/api';

const ROLES = [
  { value: 'COMMERCIAL',      label: 'Vendedor',      color: 'bg-green-100 text-green-700' },
  { value: 'APPROVER',    label: 'Supervisor',    color: 'bg-blue-100 text-blue-700' },
  { value: 'COMPRADOR',     label: 'Comprador',     color: 'bg-yellow-100 text-yellow-700' },
  { value: 'ADMIN', label: 'Administrador', color: 'bg-red-100 text-red-700' },
];

function RoleBadge({ role }) {
  const r = ROLES.find(r => r.value === role);
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r?.color || 'bg-gray-100 text-gray-600'}`}>
      {r?.label || role}
    </span>
  );
}

// ─── Modal de criar/editar usuário ────────────────────────────────────────────
function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    name:     user?.name     || '',
    email:    user?.email    || '',
    role:     user?.role     || 'COMMERCIAL',
    password: '',
    active:   user?.active   ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nome e e-mail são obrigatórios');
      return;
    }
    if (!isEdit && form.password.length < 6) {
      toast.error('Senha deve ter ao menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const { data } = await usersAPI.update(user.id, {
          name:   form.name,
          email:  form.email,
          role:   form.role,
          active: form.active,
        });
        onSaved(data.user);
        toast.success('Usuário atualizado');
      } else {
        const { data } = await usersAPI.create({
          name:     form.name,
          email:    form.email,
          role:     form.role,
          password: form.password,
        });
        onSaved(data.user);
        toast.success('Usuário criado');
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700">Nome completo</label>
            <input className="input mt-1" value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="Ex: João da Silva" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">E-mail</label>
            <input className="input mt-1" type="email" value={form.email}
              onChange={e => set('email', e.target.value)} placeholder="joao@acapulco.com.br" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Perfil de acesso</label>
            <select className="input mt-1" value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {form.role === 'COMMERCIAL'      && 'Cria orçamentos. Vê apenas os próprios.'}
              {form.role === 'APPROVER'    && 'Vê todos os orçamentos. Aprova/rejeita.'}
              {form.role === 'COMPRADOR'     && 'Gerencia preços de matéria-prima.'}
              {form.role === 'ADMIN' && 'Acesso total ao sistema.'}
            </p>
          </div>

          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-gray-700">Senha inicial</label>
              <input className="input mt-1" type="password" value={form.password}
                onChange={e => set('password', e.target.value)} placeholder="Mín. 6 caracteres" />
            </div>
          )}

          {isEdit && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-700">Conta ativa</label>
              <button
                onClick={() => set('active', !form.active)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${form.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className={`text-xs ${form.active ? 'text-green-600' : 'text-gray-400'}`}>
                {form.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de redefinir senha ─────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving]     = useState(false);

  const handleReset = async () => {
    if (password.length < 6) { toast.error('Senha deve ter ao menos 6 caracteres'); return; }
    setSaving(true);
    try {
      await usersAPI.resetPassword(user.id, password);
      toast.success(`Senha de ${user.name} redefinida`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao redefinir senha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-base font-semibold text-gray-900">Redefinir Senha</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-600">Nova senha para <strong>{user.name}</strong>:</p>
          <input className="input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="Mín. 6 caracteres" autoFocus />
        </div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleReset} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Salvando...' : 'Redefinir senha'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UsersPage ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editUser, setEditUser]     = useState(null);
  const [resetUser, setResetUser]   = useState(null);
  const [filter, setFilter]         = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await usersAPI.list();
      setUsers(data.users);
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaved = (user) => {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === user.id);
      return idx >= 0 ? prev.map(u => u.id === user.id ? user : u) : [...prev, user];
    });
  };

  const handleDeactivate = async (user) => {
    if (!confirm(`Desativar ${user.name}?`)) return;
    try {
      const { data } = await usersAPI.deactivate(user.id);
      handleSaved(data.user);
      toast.success('Usuário desativado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao desativar');
    }
  };

  const handleReactivate = async (user) => {
    try {
      const { data } = await usersAPI.update(user.id, { active: true });
      handleSaved(data.user);
      toast.success('Usuário reativado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reativar');
    }
  };

  const filtered = users.filter(u =>
    !filter || u.name.toLowerCase().includes(filter.toLowerCase()) ||
    u.email.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-orange-500" />
            Gestão de Usuários
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} usuário(s) cadastrado(s)</p>
        </div>
        <button onClick={() => { setEditUser(null); setShowModal(true); }}
          className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      <input className="input max-w-sm" placeholder="Filtrar por nome ou e-mail..."
        value={filter} onChange={e => setFilter(e.target.value)} />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuário</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Desde</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.active ? <><Check className="w-3 h-3" /> Ativo</> : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => { setEditUser(u); setShowModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                        title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setResetUser(u)}
                        className="p-1.5 text-gray-400 hover:text-yellow-600 rounded-lg hover:bg-yellow-50"
                        title="Redefinir senha">
                        <Key className="w-4 h-4" />
                      </button>
                      {u.active ? (
                        <button onClick={() => handleDeactivate(u)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                          title="Desativar">
                          <UserX className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(u)}
                          className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
                          title="Reativar">
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400 text-sm">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <UserModal
          user={editUser}
          onClose={() => { setShowModal(false); setEditUser(null); }}
          onSaved={handleSaved}
        />
      )}

      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}
