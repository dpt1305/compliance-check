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

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_username');
    if (stored) {
      setUsername(stored);
    } else {
      // sessionStorage cleared (tab reopen) — restore username from cookie-backed /api/auth/me
      fetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then((data: { username?: string; token?: string } | null) => {
          if (data?.username) {
            setUsername(data.username);
            // Restore token to sessionStorage so existing fetch calls keep working
            if (data.token) sessionStorage.setItem('admin_token', data.token);
            sessionStorage.setItem('admin_username', data.username);
          }
        })
        .catch(() => {});
    }
  }, []);

  function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function exportExcel() {
    setIsExporting(true);
    try {
      const res = await fetch('/api/admin/export', {
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

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_username');
    router.push('/admin/login');
  }

  const navLinks = [
    { href: '/admin/user-list', label: 'User List', icon: '👥' },
    { href: '/admin/checkin-table', label: 'Check-In Table', icon: '📊' },
    { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <header className="bg-primary-600 text-white shadow-md">
        <div className="flex items-center px-4 py-3 gap-3">
          <span className="text-lg">🛡️</span>
          <span className="font-semibold text-lg">Compliance Admin</span>
          <div className="flex-1" />
          <span className="text-sm opacity-80 mr-2">{username}</span>
          <button onClick={exportExcel} disabled={isExporting} className="btn-icon text-white hover:bg-white/20" title="Export to Excel">
            {isExporting ? <span className="spinner w-4 h-4 border-white border-t-transparent"></span> : '📥'}
          </button>
          <Link href="/dashboard" className="btn-icon text-white hover:bg-white/20" title="User Dashboard">🏠</Link>
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

  // Login page is public — render without shell, no auth check
  if (pathname === '/admin/login') return <>{children}</>;

  // All other admin pages are protected by middleware (cookie check).
  // AdminShell handles username restoration from cookie via /api/auth/me.
  return <AdminShell>{children}</AdminShell>;
}
