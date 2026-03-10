import { create } from 'zustand';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('acapulco_user') || 'null'),
  token: localStorage.getItem('acapulco_token') || null,

  login: (user, token) => {
    localStorage.setItem('acapulco_token', token);
    localStorage.setItem('acapulco_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('acapulco_token');
    localStorage.removeItem('acapulco_user');
    set({ user: null, token: null });
  },

  isAuthenticated: () => !!get().token,

  hasRole: (...roles) => roles.includes(get().user?.role),
}));

export default useAuthStore;
