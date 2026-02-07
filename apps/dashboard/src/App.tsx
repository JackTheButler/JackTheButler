import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LoginPage } from '@/pages/Login';
import { SetupPage } from '@/pages/Setup';
import { Layout } from '@/components/layout/Layout';
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
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/inbox" element={<ConversationsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/engine/apps" element={<AppsPage />} />
          <Route path="/engine/apps/:appId" element={<AppEditPage />} />
          <Route path="/engine/automations" element={<AutomationsPage />} />
          <Route path="/engine/automations/generate" element={<AutomationGeneratePage />} />
          <Route path="/engine/automations/:ruleId" element={<AutomationEditPage />} />
          <Route path="/engine/autonomy" element={<AutonomyPage />} />
          <Route path="/engine" element={<SettingsPage />} />
          <Route path="/review-center" element={<ApprovalsPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/guests/new" element={<GuestFormPage />} />
          <Route path="/guests/:id" element={<GuestProfilePage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/:id" element={<ReservationDetailPage />} />
          <Route path="/tools/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/tools/site-scraper" element={<SiteScraperPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
