import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { InboxPage } from '@/features/inbox/InboxPage';
import { AppsPage } from '@/features/apps/AppsPage';
import { PlaceholderPage } from '@/features/misc/PlaceholderPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<InboxPage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/knowledge" element={<PlaceholderPage title="Knowledge Base" />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
