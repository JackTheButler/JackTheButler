import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { ApprovalsPage } from '@/pages/approvals/Approvals';
import { SiteScraperPage } from '@/pages/tools/SiteScraper';
import { KnowledgeBasePage } from '@/pages/tools/KnowledgeBase';

export function App() {
  return (
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
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/tools/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/tools/site-scraper" element={<SiteScraperPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
