const API_BASE = '/api/v1';

class ApiClient {
  private accessToken: string | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
  }

  setToken(token: string | null) {
    this.accessToken = token;
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  }

  getToken() {
    return this.accessToken;
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
      throw new Error(error.error?.message || 'Request failed');
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

  delete<T>(path: string) {
    return this.fetch<T>(path, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
