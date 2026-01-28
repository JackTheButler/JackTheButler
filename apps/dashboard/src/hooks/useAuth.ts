import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    const data = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', {
      email,
      password,
    });
    api.setToken(data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);

    const { user } = await api.get<{ user: User }>('/auth/me');
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    api.setToken(null);
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = api.getToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const { user } = await api.get<{ user: User }>('/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.setToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
