import { Route, Routes } from 'react-router-dom';
import { EmptyState } from '../components/States';
import { AuditPage } from '../features/admin/AuditPage';
import { CategoriesPage } from '../features/admin/CategoriesPage';
import { OverviewPage } from '../features/admin/OverviewPage';
import { SettingsPage } from '../features/admin/PlaceholderPages';
import { UsersPage } from '../features/admin/UsersPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth, RequireRole, RequireStaff } from '../features/auth/guards';
import { QueuePage } from '../features/tickets/QueuePage';
import { TicketDetailPage } from '../features/tickets/TicketDetailPage';
import { AppLayout } from '../layouts/AppLayout';

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireStaff />}>
          <Route element={<AppLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="tickets" element={<QueuePage />} />
            <Route path="tickets/:id" element={<TicketDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<EmptyState title="Page not found" />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
