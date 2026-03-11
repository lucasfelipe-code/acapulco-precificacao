import { useState, useRef } from 'react';
import { Camera, Save, Key, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';

function resizeToBase64(file, maxPx = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();

  const [form, setForm] = useState({
    name:  user?.name  || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || null);
  const [avatarBase64, setAvatarBase64]   = useState(null);
  const [savingAvatar, setSavingAvatar]   = useState(false);
  const fileRef = useRef(null);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await authAPI.updateProfile(form);
      setUser(data.user);
      toast.success('Perfil atualizado!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) { toast.error('As senhas não coincidem'); return; }
    if (pwForm.newPassword.length < 6) { toast.error('Nova senha deve ter ao menos 6 caracteres'); return; }
    setSavingPw(true);
    try {
      await authAPI.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success('Senha alterada com sucesso!');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setSavingPw(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 5MB)'); return; }
    try {
      const b64 = await resizeToBase64(file, 256);
      setAvatarPreview(b64);
      setAvatarBase64(b64);
    } catch {
      toast.error('Erro ao processar imagem');
    }
  };

  const handleAvatarSave = async () => {
    if (!avatarBase64) return;
    setSavingAvatar(true);
    try {
      const { data } = await authAPI.updateAvatar(avatarBase64);
      setUser({ ...user, avatarUrl: data.user.avatarUrl });
      setAvatarBase64(null);
      toast.success('Foto atualizada!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar foto');
    } finally {
      setSavingAvatar(false);
    }
  };

  const roleLabel = { ADMIN: 'Administrador', COMMERCIAL: 'Vendedor', APPROVER: 'Supervisor', COMPRADOR: 'Comprador' };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Meu Perfil</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gerencie seus dados pessoais e senha</p>
      </div>

      {/* Avatar */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-4 h-4" /> Foto de Perfil
        </h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-orange-200" />
              : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
              )
            }
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 bg-orange-600 rounded-full flex items-center justify-center shadow hover:bg-orange-700 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{roleLabel[user?.role] || user?.role}</p>
            <p className="text-xs text-gray-400 mt-1">{user?.email}</p>
            {avatarBase64 && (
              <button
                onClick={handleAvatarSave}
                disabled={savingAvatar}
                className="mt-2 btn-primary text-xs px-3 py-1.5"
              >
                {savingAvatar ? 'Salvando...' : 'Salvar foto'}
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>

      {/* Dados pessoais */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Save className="w-4 h-4" /> Dados Pessoais
        </h2>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">E-mail</label>
              <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingProfile} className="btn-primary">
              {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>

      {/* Alterar senha */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Key className="w-4 h-4" /> Alterar Senha
        </h2>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="label">Senha atual</label>
            <input type="password" className="input" value={pwForm.currentPassword}
              onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nova senha</label>
              <input type="password" className="input" value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div>
              <label className="label">Confirmar nova senha</label>
              <input type="password" className="input" value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingPw} className="btn-primary">
              {savingPw ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
