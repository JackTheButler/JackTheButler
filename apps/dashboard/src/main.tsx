import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { Toaster } from '@/components/ui';
import { PwaReloadPrompt } from '@/components/PwaReloadPrompt';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
        <PwaReloadPrompt />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
