import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { App } from './App';
import { Toaster } from '@/components/ui';
import { PwaReloadPrompt } from '@/components/PwaReloadPrompt';
import { persistOptions } from '@/lib/queryPersist';
import './index.css';

const queryClient = new QueryClient({
  // Keep cached entries around long enough to be persisted across a close/reopen
  // (default gcTime of 5m would drop the inbox list before we save it).
  defaultOptions: { queries: { gcTime: 1000 * 60 * 60 * 24 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <BrowserRouter>
        <App />
        <Toaster />
        <PwaReloadPrompt />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
