import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { InboxPage } from '@/features/inbox/InboxPage';
import { AppsPage } from '@/features/apps/AppsPage';
import { KnowledgeBasePage } from '@/features/knowledge/KnowledgeBasePage';
import { AssistantPage } from '@/features/assistant/AssistantPage';
import { TeamPage } from '@/features/team/TeamPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<InboxPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/assistant/:section" element={<AssistantPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
