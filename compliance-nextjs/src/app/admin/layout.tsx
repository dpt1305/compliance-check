'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState('Admin');
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [changePwFields, setChangePwFields] = useState({ current: '', newPw: '', confirm: '' });
  const [changePwError, setChangePwError] = useState('');
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_username');

    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((data: { username?: string; token?: string; role?: string; mustChangePassword?: boolean } | null) => {
        if (data?.mustChangePassword) {
          router.replace('/admin/change-password');
          return;
        }

        if (stored) {
          setUsername(stored);
        } else if (data?.username) {
          setUsername(data.username);
        }

        if (data?.token) sessionStorage.setItem('admin_token', data.token);
        if (data?.username) sessionStorage.setItem('admin_username', data.username);
        if (data?.role) sessionStorage.setItem('admin_role', data.role);
      })
      .catch(() => {
        if (stored) setUsername(stored);
      });
  }, [router]);

  function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function exportExcel() {
    setIsExporting(true);
    try {
      const sortCol = sessionStorage.getItem('ul_sort_col') ?? 'name';
      const sortDir = sessionStorage.getItem('ul_sort_dir') ?? 'asc';
      const exportStateRaw = sessionStorage.getItem('ul_export_state');
      const params = new URLSearchParams();
      params.set('sortCol', sortCol);
      params.set('sortDir', sortDir);

      if (exportStateRaw) {
        try {
          const exportState = JSON.parse(exportStateRaw) as {
            filterProjects?: string[] | null;
            filterMonth?: string;
            filterYear?: string;
            filterTags?: string[];
          };
          exportState.filterProjects?.forEach(project => params.append('project', project));
          if (exportState.filterMonth) params.set('month', exportState.filterMonth);
          if (exportState.filterYear) params.set('year', exportState.filterYear);
          exportState.filterTags?.forEach(tag => params.append('tag', tag));
        } catch {
          // ignore malformed persisted state
        }
      }

      const res = await fetch(`/api/admin/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { showToast('Export failed', false); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `compliance-report-${Date.now()}.xlsx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); window.URL.revokeObjectURL(url);
      showToast('Export downloaded', true);
    } catch {
      showToast('Export failed', false);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault();
    setChangePwError('');

    if (!changePwFields.current || !changePwFields.newPw || !changePwFields.confirm) {
      setChangePwError('All fields are required');
      return;
    }
    if (changePwFields.newPw.length < 8) {
      setChangePwError('New password must be at least 8 characters');
      return;
    }
    if (changePwFields.newPw === changePwFields.current) {
      setChangePwError('New password must be different from current password');
      return;
    }
    if (changePwFields.newPw !== changePwFields.confirm) {
      setChangePwError('Passwords do not match');
      return;
    }

    setIsChangingPw(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ currentPassword: changePwFields.current, newPassword: changePwFields.newPw }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setChangePwError(data.message ?? 'Failed to change password');
        return;
      }
      setShowChangePw(false);
      setChangePwFields({ current: '', newPw: '', confirm: '' });
      setShowCurrentPw(false);
      setShowNewPw(false);
      setShowConfirmPw(false);
      showToast('Password changed successfully', true);
    } catch {
      setChangePwError('Request failed. Please try again.');
    } finally {
      setIsChangingPw(false);
    }
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_username');
    sessionStorage.removeItem('admin_role');
    router.push('/admin/login');
  }

  const navLinks = [
    { href: '/admin/user-list', label: 'User List', icon: '👥' },
    { href: '/admin/account-management', label: 'Account Management', icon: '👤' },
    { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {showChangePw && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowChangePw(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">🔑 Change Password</h2>
              <button onClick={() => setShowChangePw(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleChangePw} className="p-5 space-y-4" noValidate>
              <div className="form-field">
                <label className="form-label">Current Password</label>
                <div className="relative">
                  <input
                    className="form-input pr-10"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={changePwFields.current}
                    onChange={e => setChangePwFields(f => ({ ...f, current: e.target.value }))}
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm" onClick={() => setShowCurrentPw(v => !v)} tabIndex={-1}>
                    {showCurrentPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">New Password</label>
                <div className="relative">
                  <input
                    className="form-input pr-10"
                    type={showNewPw ? 'text' : 'password'}
                    value={changePwFields.newPw}
                    onChange={e => setChangePwFields(f => ({ ...f, newPw: e.target.value }))}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm" onClick={() => setShowNewPw(v => !v)} tabIndex={-1}>
                    {showNewPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">Confirm New Password</label>
                <div className="relative">
                  <input
                    className="form-input pr-10"
                    type={showConfirmPw ? 'text' : 'password'}
                    value={changePwFields.confirm}
                    onChange={e => setChangePwFields(f => ({ ...f, confirm: e.target.value }))}
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm" onClick={() => setShowConfirmPw(v => !v)} tabIndex={-1}>
                    {showConfirmPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              {changePwError && (
                <div className="alert-error"><span>⚠️</span> {changePwError}</div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowChangePw(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={isChangingPw}>
                  {isChangingPw && <span className="spinner w-4 h-4 border-white border-t-transparent"></span>}
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <header className="bg-primary-600 text-white shadow-md">
        <div className="flex items-center px-4 py-3 gap-3">
          <span className="text-lg">🛡️</span>
          <span className="font-semibold text-lg">Compliance Admin</span>
          <div className="flex-1" />
          <span className="text-sm opacity-80 mr-2">{username}</span>
          <button
            onClick={() => {
              setShowChangePw(true);
              setChangePwError('');
              setChangePwFields({ current: '', newPw: '', confirm: '' });
              setShowCurrentPw(false);
              setShowNewPw(false);
              setShowConfirmPw(false);
            }}
            className="btn-icon text-white hover:bg-white/20"
            title="Change Password"
          >
            🔑
          </button>

          {/* Admin Guide button — prominent, pulsing amber */}
          <a
            href="/admin-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Admin Guide"
            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
                       bg-amber-400 text-amber-900 hover:bg-amber-300 transition-colors shadow-md
                       ring-2 ring-amber-300/60 hover:ring-amber-200"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-40 pointer-events-none" />
            <span className="relative flex items-center gap-1.5">📖 Guide</span>
          </a>

          <button onClick={exportExcel} disabled={isExporting} className="btn-icon text-white hover:bg-white/20" title="Export to Excel">
            {isExporting ? <span className="spinner w-4 h-4 border-white border-t-transparent"></span> : '📥'}
          </button>
          <Link href="/form" className="btn-icon text-white hover:bg-white/20" title="User Dashboard">🏠</Link>
          <button onClick={logout} className="btn-icon text-white hover:bg-white/20" title="Logout">🚪</button>
        </div>

        {/* Tab nav */}
        <nav className="flex px-4 gap-1 pb-0">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
                pathname === link.href
                  ? 'border-white text-white'
                  : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
              }`}
            >
              <span>{link.icon}</span> {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login and forced password change pages render without the admin shell
  if (pathname === '/admin/login' || pathname === '/admin/change-password') return <>{children}</>;

  // All other admin pages are protected by middleware (cookie check).
  // AdminShell handles username restoration from cookie via /api/auth/me.
  return <AdminShell>{children}</AdminShell>;
}
