import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, CheckCircle, Settings,
  LogOut, Scissors, User, Users, DollarSign,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';

// Valores de role = valores reais do banco (enum Role do Prisma)
// Labels de exibição definidos em roleLabel abaixo
const navItems = [
  { to: '/dashboard', label: 'Dashboard',        icon: LayoutDashboard, roles: null },
  { to: '/quotes',    label: 'Orçamentos',        icon: FileText,        roles: ['COMMERCIAL', 'APPROVER', 'ADMIN'] },
  { to: '/approvals', label: 'Aprovações',        icon: CheckCircle,     roles: ['APPROVER', 'ADMIN'] },
  { to: '/prices',    label: 'Atualizar Preços',  icon: DollarSign,      roles: ['COMPRADOR', 'ADMIN'] },
  { to: '/costs',     label: 'Custos Fabricação', icon: Settings,        roles: ['ADMIN'] },
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

export default function Layout() {
  const { user, logout, hasRole } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
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
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-7 h-7 bg-gray-600 rounded-full flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <span className={`inline-block text-xs text-white px-1.5 py-0.5 rounded mt-0.5 ${roleBadgeColor[user?.role] || 'bg-gray-500'}`}>
                {roleLabel[user?.role] || user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
