import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthGate } from '@/features/auth/AuthGate';
import { AcceptInvite } from '@/features/auth/AcceptInvite';
import { useSession } from '@/features/auth/useAuth';
import { AppLayout } from '@/components/AppLayout';
import { InboxPage } from '@/features/inbox/InboxPage';
import { AppsPage } from '@/features/apps/AppsPage';
import { WebchatConfigPanel } from '@/features/apps/WebchatConfigPanel';
import { AppConfigPanel } from '@/features/apps/AppConfigPanel';
import { KnowledgeBasePage } from '@/features/knowledge/KnowledgeBasePage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { AssistantPage } from '@/features/assistant/AssistantPage';
import { TeamPage } from '@/features/team/TeamPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/** Admin-only route guard. Agents (Inbox + Knowledge only) hitting an
 *  admin route are redirected to the inbox. */
function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

/** Routes notification taps client-side: the service worker focuses this tab
 *  and posts the deep-link URL, which we hand to the router (no reload). */
function PushNavigationListener() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | undefined;
      if (data?.type === 'NAVIGATE' && data.url) navigate(data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

export function App() {
  return (
    <>
      <PushNavigationListener />
      <Routes>
        {/* Public — reachable while logged out, so it sits outside the AuthGate. */}
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="*" element={<GatedApp />} />
      </Routes>
    </>
  );
}

function GatedApp() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<InboxPage />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />

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
          {/* Settings is open to all staff; the SettingsPage shows agents only
              their Profile tab and admins the workspace tabs too. */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
