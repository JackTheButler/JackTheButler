import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from '@/features/auth/AuthGate';
import { AcceptInvite } from '@/features/auth/AcceptInvite';
import { useSession } from '@/features/auth/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { InboxPage } from '@/features/inbox/InboxPage';
import { AppsPage } from '@/features/apps/AppsPage';
import { WebchatConfigPanel } from '@/features/apps/WebchatConfigPanel';
import { AppConfigPanel } from '@/features/apps/AppConfigPanel';
import { KnowledgeBasePage } from '@/features/knowledge/KnowledgeBasePage';
import { AssistantPage } from '@/features/assistant/AssistantPage';
import { TeamPage } from '@/features/team/TeamPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/** Admin-only route guard. Agents (Inbox + Knowledge only) hitting an
 *  admin route are redirected to the inbox. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <Routes>
      {/* Public — reachable while logged out, so it sits outside the AuthGate. */}
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="*" element={<GatedApp />} />
    </Routes>
  );
}

function GatedApp() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<InboxPage />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="/knowledge/:section" element={<KnowledgeBasePage />} />

          {/* Admin-only areas */}
          <Route
            path="/apps"
            element={
              <AdminOnly>
                <AppsPage />
              </AdminOnly>
            }
          />
          <Route
            path="/apps/webchat"
            element={
              <AdminOnly>
                <WebchatConfigPanel />
              </AdminOnly>
            }
          />
          <Route
            path="/apps/:id"
            element={
              <AdminOnly>
                <AppConfigPanel />
              </AdminOnly>
            }
          />
          <Route
            path="/assistant"
            element={
              <AdminOnly>
                <AssistantPage />
              </AdminOnly>
            }
          />
          <Route
            path="/assistant/:section"
            element={
              <AdminOnly>
                <AssistantPage />
              </AdminOnly>
            }
          />
          <Route
            path="/team"
            element={
              <AdminOnly>
                <TeamPage />
              </AdminOnly>
            }
          />
          <Route
            path="/settings"
            element={
              <AdminOnly>
                <SettingsPage />
              </AdminOnly>
            }
          />
          <Route
            path="/settings/:section"
            element={
              <AdminOnly>
                <SettingsPage />
              </AdminOnly>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
