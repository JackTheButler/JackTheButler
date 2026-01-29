import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '@/pages/Login';
import { Layout } from '@/pages/Layout';
import { ConversationsPage } from '@/pages/Conversations';
import { TasksPage } from '@/pages/Tasks';
import { IntegrationsPage } from '@/pages/Integrations';
import { IntegrationEditPage } from '@/pages/IntegrationEdit';
import { AutomationsPage } from '@/pages/Automations';
import { AutomationEditPage } from '@/pages/AutomationEdit';
import { AutonomyPage } from '@/pages/settings/Autonomy';
import { ApprovalsPage } from '@/pages/Approvals';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<ConversationsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/settings/integrations" element={<IntegrationsPage />} />
          <Route path="/settings/integrations/:integrationId" element={<IntegrationEditPage />} />
          <Route path="/settings/automations" element={<AutomationsPage />} />
          <Route path="/settings/automations/:ruleId" element={<AutomationEditPage />} />
          <Route path="/settings/autonomy" element={<AutonomyPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
