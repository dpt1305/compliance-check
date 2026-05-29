'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForceChangePasswordPage() {
  const router = useRouter();
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((data: { token?: string; username?: string; role?: string; mustChangePassword?: boolean } | null) => {
        if (!data?.token) {
          router.replace('/admin/login');
          return;
        }

        sessionStorage.setItem('admin_token', data.token);
        if (data.username) sessionStorage.setItem('admin_username', data.username);
        sessionStorage.setItem('admin_role', data.role ?? 'Admin');

        if (!data.mustChangePassword) {
          router.replace('/admin');
        }
      })
      .catch(() => {
        router.replace('/admin/login');
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!newPw || !confirmPw) {
      setError('Both fields are required');
      return;
    }
    if (newPw.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match');
      return;
    }

    const token = sessionStorage.getItem('admin_token') ?? '';
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: '', newPassword: newPw }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setError(data.message ?? 'Failed to change password');
        return;
      }
      router.push('/admin');
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <span className="text-2xl">🔑</span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Set Your Password</h1>
            <p className="text-sm text-gray-500">You must set a new password before continuing</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate>
          <div className="form-field">
            <label className="form-label">New Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
                onClick={() => setShowNew(v => !v)}
                tabIndex={-1}
              >
                {showNew ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Confirm New Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
                onClick={() => setShowConfirm(v => !v)}
                tabIndex={-1}
              >
                {showConfirm ? '🙈' : '👁️'}
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
            disabled={!newPw || !confirmPw || isLoading}
          >
            {isLoading ? (
              <><span className="spinner w-4 h-4 border-white border-t-transparent"></span> Saving…</>
            ) : (
              <>✓ Set Password &amp; Continue</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
