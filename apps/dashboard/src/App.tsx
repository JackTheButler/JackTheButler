import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LoginPage } from '@/pages/Login';
import { Layout } from '@/components/layout/Layout';
import { HomePage } from '@/pages/home/Home';
import { ConversationsPage } from '@/pages/inbox/Conversations';
import { TasksPage } from '@/pages/tasks/Tasks';
import { ExtensionsPage } from '@/pages/settings/extensions/Extensions';
import { ExtensionEditPage } from '@/pages/settings/extensions/ExtensionEdit';
import { AutomationsPage } from '@/pages/settings/automations/Automations';
import { AutomationEditPage } from '@/pages/settings/automations/AutomationEdit';
import { AutonomyPage } from '@/pages/settings/autonomy/Autonomy';
import { SettingsPage } from '@/pages/settings/Settings';
import { ApprovalsPage } from '@/pages/approvals/Approvals';
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
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/inbox" element={<ConversationsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/settings/extensions" element={<ExtensionsPage />} />
          <Route path="/settings/extensions/:extensionId" element={<ExtensionEditPage />} />
          <Route path="/settings/automations" element={<AutomationsPage />} />
          <Route path="/settings/automations/:ruleId" element={<AutomationEditPage />} />
          <Route path="/settings/autonomy" element={<AutonomyPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/guests/new" element={<GuestFormPage />} />
          <Route path="/guests/:id" element={<GuestProfilePage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/:id" element={<ReservationDetailPage />} />
          <Route path="/tools/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/tools/site-scraper" element={<SiteScraperPage />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
