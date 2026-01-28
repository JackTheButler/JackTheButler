import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '@/pages/Login';
import { Layout } from '@/pages/Layout';
import { ConversationsPage } from '@/pages/Conversations';
import { TasksPage } from '@/pages/Tasks';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<ConversationsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
