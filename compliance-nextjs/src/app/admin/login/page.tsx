'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password || isLoading) return;
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json() as { token?: string; username?: string; message?: string; role?: string; mustChangePassword?: boolean };

      if (!res.ok) {
        setError(data.message ?? 'Invalid username or password');
        setPassword('');
        return;
      }

      sessionStorage.setItem('admin_token', data.token!);
      sessionStorage.setItem('admin_username', data.username!);
      sessionStorage.setItem('admin_role', (data as { role?: string }).role ?? 'Admin');
      if ((data as { mustChangePassword?: boolean }).mustChangePassword) {
        router.push('/admin/change-password');
      } else {
        router.push('/admin');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <span className="text-2xl">🔐</span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Admin / Teamlead Login</h1>
            <p className="text-sm text-gray-500">Compliance Management System</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate>
          <div className="form-field">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={!username || !password || isLoading}
          >
            {isLoading ? (
              <><span className="spinner w-4 h-4 border-white border-t-transparent"></span> Signing in…</>
            ) : (
              <><span>🔑</span> Sign In</>
            )}
          </button>
        </form>

        <div className="px-5 pb-4">
          <Link href="/form" className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1">
            ← Back to User Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
