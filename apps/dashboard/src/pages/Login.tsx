import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md w-full max-w-sm md:max-w-2xl md:flex overflow-hidden">
        {/* Left side - Branding (hidden on mobile, shown on md+) */}
        <div className="hidden md:flex md:w-1/2 bg-gray-50 flex-col items-center justify-center p-8">
          <img src="/jack-the-butler.png" alt="Jack The Butler" className="w-48 h-48 object-contain" />
          <h1 className="text-2xl font-semibold text-gray-900 mt-4">Jack The Butler</h1>
          <p className="text-muted-foreground mt-1">Time to wow some guests</p>
        </div>

        {/* Right side - Login form */}
        <div className="p-6 md:w-1/2">
          {/* Mobile header (shown on mobile, hidden on md+) */}
          <div className="text-center mb-6 md:hidden">
            <div className="flex justify-center mb-4">
              <img src="/jack-the-butler.png" alt="Jack The Butler" className="w-32 h-32 object-contain" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Jack The Butler</h1>
            <p className="text-sm text-muted-foreground mt-1">Time to wow some guests</p>
          </div>

          {/* Desktop header */}
          <div className="hidden md:block mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2 rounded-md hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
