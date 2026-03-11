import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, FileText, CheckCircle, Settings,
  LogOut, Scissors, User, Users, DollarSign, Columns,
  Bell, X,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import { crmAPI } from '../../services/api';
import { formatDate } from '../../utils/format';

const navItems = [
  { to: '/dashboard', label: 'Dashboard',        icon: LayoutDashboard, roles: null },
  { to: '/quotes',    label: 'Orçamentos',        icon: FileText,        roles: ['COMMERCIAL', 'APPROVER', 'ADMIN'] },
  { to: '/crm',       label: 'Pipeline CRM',      icon: Columns,         roles: ['COMMERCIAL', 'APPROVER', 'ADMIN'] },
  { to: '/approvals', label: 'Aprovações',        icon: CheckCircle,     roles: ['APPROVER', 'ADMIN'] },
  { to: '/prices',    label: 'Atualizar Preços',  icon: DollarSign,      roles: ['COMPRADOR', 'ADMIN'] },
  { to: '/costs',     label: 'Custos Fabricação', icon: Settings,        roles: ['COMPRADOR', 'ADMIN'] },
  { to: '/users',     label: 'Usuários',          icon: Users,           roles: ['ADMIN'] },
];

const roleLabel = {
  ADMIN:      'Administrador',
  COMMERCIAL: 'Vendedor',
  APPROVER:   'Supervisor',
  COMPRADOR:  'Comprador',
};

const roleBadgeColor = {
  ADMIN:      'bg-red-500',
  APPROVER:   'bg-blue-500',
  COMMERCIAL: 'bg-green-500',
  COMPRADOR:  'bg-yellow-500',
};

function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const { data } = useQuery({
    queryKey: ['crm', 'notifications'],
    queryFn: () => crmAPI.notifications(),
    select: (res) => res.data,
    refetchInterval: 30000,
  });

  const readAllMutation = useMutation({
    mutationFn: () => crmAPI.readAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm', 'notifications'] }),
  });

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const notifications = data?.notifications || [];
  const unread = data?.unreadCount || 0;

  const typeColor = {
    QUOTE_APPROVED: 'text-green-600',
    QUOTE_REJECTED: 'text-red-600',
    QUOTE_REVISION: 'text-yellow-600',
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 top-0 z-50 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-sm">Notificações</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={() => readAllMutation.mutate()} className="text-xs text-orange-600 hover:underline">
                  Marcar todas como lidas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nenhuma notificação</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.read ? 'bg-orange-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />}
                    <div className={!n.read ? '' : 'ml-4'}>
                      <p className={`text-xs font-semibold ${typeColor[n.type] || 'text-gray-700'}`}>{n.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-400">{formatDate(n.createdAt)}</p>
                        {n.quoteId && (
                          <Link
                            to={`/quotes/${n.quoteId}`}
                            onClick={() => setOpen(false)}
                            className="text-xs text-orange-600 hover:underline"
                          >
                            Ver orçamento
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, hasRole } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Acapulco</p>
              <p className="text-xs text-gray-400 leading-tight">Uniformes</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems
            .filter((item) => !item.roles || hasRole(...item.roles))
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-700">
          <Link
            to="/profile"
            className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg hover:bg-gray-800 transition-colors group"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-gray-600 flex items-center justify-center">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                : <User className="w-4 h-4 text-gray-300" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate group-hover:text-orange-300 transition-colors">{user?.name}</p>
              <span className={`inline-block text-xs text-white px-1.5 py-0.5 rounded mt-0.5 ${roleBadgeColor[user?.role] || 'bg-gray-500'}`}>
                {roleLabel[user?.role] || user?.role}
              </span>
            </div>
            <NotificationBell />
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
