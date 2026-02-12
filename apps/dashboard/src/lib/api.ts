const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private useLocalStorage = true;

  constructor() {
    // Check if we have a remembered session (localStorage) or session-only (sessionStorage)
    this.useLocalStorage = localStorage.getItem('rememberMe') === 'true';
    this.accessToken = this.getStorage().getItem('accessToken');
  }

  private getStorage(): Storage {
    return this.useLocalStorage ? localStorage : sessionStorage;
  }

  setRememberMe(remember: boolean) {
    this.useLocalStorage = remember;
    if (remember) {
      localStorage.setItem('rememberMe', 'true');
    } else {
      localStorage.removeItem('rememberMe');
    }
  }

  setToken(token: string | null) {
    this.accessToken = token;
    if (token) {
      this.getStorage().setItem('accessToken', token);
    } else {
      // Clear from both storages
      localStorage.removeItem('accessToken');
      sessionStorage.removeItem('accessToken');
    }
  }

  setRefreshToken(token: string | null) {
    if (token) {
      this.getStorage().setItem('refreshToken', token);
    } else {
      // Clear from both storages
      localStorage.removeItem('refreshToken');
      sessionStorage.removeItem('refreshToken');
    }
  }

  getToken() {
    return this.accessToken;
  }

  private getRefreshToken() {
    // Check both storages for refresh token
    return localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
  }

  /**
   * Attempt to refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      this.setToken(data.accessToken);
      if (data.refreshToken) {
        this.setRefreshToken(data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Refresh token with deduplication (only one refresh at a time)
   */
  private async tryRefresh(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshAccessToken().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  /**
   * Clear all tokens and redirect to login
   */
  private handleAuthFailure() {
    this.setToken(null);
    this.setRefreshToken(null);
    window.location.href = '/login';
  }

  async fetch<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    // Handle 401 - try to refresh token and retry once
    if (res.status === 401 && !isRetry && !path.startsWith('/auth/')) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.fetch<T>(path, options, true);
      }
      this.handleAuthFailure();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
      const e = error.error || {};
      throw new ApiError(e.message || 'Request failed', e.code || 'UNKNOWN', e.details);
    }

    return res.json();
  }

  get<T>(path: string) {
    return this.fetch<T>(path);
  }

  post<T>(path: string, body: unknown) {
    return this.fetch<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put<T>(path: string, body: unknown) {
    return this.fetch<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown) {
    return this.fetch<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string) {
    return this.fetch<T>(path, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
