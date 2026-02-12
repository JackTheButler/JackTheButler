import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LoginPage } from '@/pages/Login';
import { SetupPage } from '@/pages/Setup';
import { AccessDeniedPage } from '@/pages/AccessDenied';
import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PERMISSIONS } from '@/hooks/usePermissions';
import { HomePage } from '@/pages/home/Home';
import { ConversationsPage } from '@/pages/inbox/Conversations';
import { TasksPage } from '@/pages/tasks/Tasks';
import { AppsPage } from '@/pages/engine/apps/Apps';
import { AppEditPage } from '@/pages/engine/apps/AppEdit';
import { AutomationsPage } from '@/pages/engine/automations/Automations';
import { AutomationEditPage } from '@/pages/engine/automations/AutomationEdit';
import { AutomationGeneratePage } from '@/pages/engine/automations/AutomationGenerate';
import { AutonomyPage } from '@/pages/engine/autonomy/Autonomy';
import { SettingsPage } from '@/pages/engine/Settings';
import { ApprovalsPage } from '@/pages/review-center/Approvals';
import { SiteScraperPage } from '@/pages/tools/SiteScraper';
import { KnowledgeBasePage } from '@/pages/tools/KnowledgeBase';
import { GuestsPage, GuestProfilePage, GuestFormPage } from '@/pages/guests';
import { ReservationsPage, ReservationDetailPage } from '@/pages/reservations';

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/inbox" element={<ProtectedRoute permission={PERMISSIONS.CONVERSATIONS_VIEW}><ConversationsPage /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute permission={PERMISSIONS.TASKS_VIEW}><TasksPage /></ProtectedRoute>} />
          <Route path="/engine/apps" element={<ProtectedRoute permission={PERMISSIONS.SETTINGS_VIEW}><AppsPage /></ProtectedRoute>} />
          <Route path="/engine/apps/:appId" element={<ProtectedRoute permission={PERMISSIONS.SETTINGS_VIEW}><AppEditPage /></ProtectedRoute>} />
          <Route path="/engine/automations" element={<ProtectedRoute permission={PERMISSIONS.AUTOMATIONS_VIEW}><AutomationsPage /></ProtectedRoute>} />
          <Route path="/engine/automations/generate" element={<ProtectedRoute permission={PERMISSIONS.AUTOMATIONS_MANAGE}><AutomationGeneratePage /></ProtectedRoute>} />
          <Route path="/engine/automations/:ruleId" element={<ProtectedRoute permission={PERMISSIONS.AUTOMATIONS_VIEW}><AutomationEditPage /></ProtectedRoute>} />
          <Route path="/engine/autonomy" element={<ProtectedRoute permission={PERMISSIONS.SETTINGS_VIEW}><AutonomyPage /></ProtectedRoute>} />
          <Route path="/settings/:tab?" element={<ProtectedRoute permission={PERMISSIONS.SETTINGS_VIEW}><SettingsPage /></ProtectedRoute>} />
          <Route path="/engine" element={<Navigate to="/settings" replace />} />
          <Route path="/review-center" element={<ProtectedRoute permission={PERMISSIONS.APPROVALS_VIEW}><ApprovalsPage /></ProtectedRoute>} />
          <Route path="/guests" element={<ProtectedRoute permission={PERMISSIONS.GUESTS_VIEW}><GuestsPage /></ProtectedRoute>} />
          <Route path="/guests/new" element={<ProtectedRoute permission={PERMISSIONS.GUESTS_MANAGE}><GuestFormPage /></ProtectedRoute>} />
          <Route path="/guests/:id" element={<ProtectedRoute permission={PERMISSIONS.GUESTS_VIEW}><GuestProfilePage /></ProtectedRoute>} />
          <Route path="/reservations" element={<ProtectedRoute permission={PERMISSIONS.RESERVATIONS_VIEW}><ReservationsPage /></ProtectedRoute>} />
          <Route path="/reservations/:id" element={<ProtectedRoute permission={PERMISSIONS.RESERVATIONS_VIEW}><ReservationDetailPage /></ProtectedRoute>} />
          <Route path="/tools/knowledge-base" element={<ProtectedRoute permission={PERMISSIONS.KNOWLEDGE_VIEW}><KnowledgeBasePage /></ProtectedRoute>} />
          <Route path="/tools/site-scraper" element={<ProtectedRoute permission={PERMISSIONS.KNOWLEDGE_MANAGE}><SiteScraperPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
