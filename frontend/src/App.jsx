import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QuotesPage from './pages/QuotesPage';
import NewQuotePage from './pages/NewQuotePage';
import QuoteDetailPage from './pages/QuoteDetailPage';
import ApprovalsPage from './pages/ApprovalsPage';
import CostsPage from './pages/CostsPage';
import Layout from './components/layout/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const ProtectedRoute = ({ children, roles }) => {
  const { user, token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="quotes/new" element={<NewQuotePage />} />
            <Route path="quotes/:id" element={<QuoteDetailPage />} />
            <Route path="approvals" element={
              <ProtectedRoute roles={['APPROVER', 'ADMIN']}>
                <ApprovalsPage />
              </ProtectedRoute>
            } />
            <Route path="costs" element={
              <ProtectedRoute roles={['ADMIN']}>
                <CostsPage />
              </ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: '#1f2937', color: '#f9fafb', fontSize: '14px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  );
}
