import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface AppConfig {
  demoMode: boolean;
  registrationEnabled: boolean;
  version: string;
}

interface AppConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
}

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

const DEFAULT_CONFIG: AppConfig = {
  demoMode: false,
  registrationEnabled: false,
  version: 'dev',
};

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/config/public')
      .then((res) => res.json())
      .then((data: AppConfig) => setConfig(data))
      .catch(() => setConfig(DEFAULT_CONFIG))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, loading }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigContextValue {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
}
