'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import MultiSelectDropdown from '@/components/admin/MultiSelectDropdown';

interface AccountRecord {
  id: string;
  username: string;
  email: string | null;
  active: boolean;
  role: 'Admin' | 'Teamlead';
  teams: string[];
  mustChangePassword: boolean;
}

type AdminRole = 'Admin' | 'Teamlead' | 'Unknown';
type ToastState = { ok: boolean; msg: string } | null;
type FormMode = 'create' | 'edit';

interface AccountFormState {
  id?: string;
  username: string;
  email: string;
  role: 'Admin' | 'Teamlead';
  teams: string[];
  active: boolean;
}

function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }

async function getResponseMessage(res: Response, fallback: string) {
  try {
    const data = await res.json() as { message?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function AccountManagement() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [currentRole, setCurrentRole] = useState<AdminRole>('Unknown');
  const [modalMode, setModalMode] = useState<FormMode>('create');
  const [form, setForm] = useState<AccountFormState>({
    username: '',
    email: '',
    role: 'Admin',
    teams: [],
    active: true,
  });
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);

  const isAdmin = currentRole === 'Admin';

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const storedRole = sessionStorage.getItem('admin_role');
    setCurrentRole(storedRole === 'Admin' || storedRole === 'Teamlead' ? storedRole : 'Unknown');
  }, []);

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/accounts', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error(await getResponseMessage(res, 'Failed to fetch accounts'));
      }
      const data = await res.json() as AccountRecord[];
      setAccounts(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch accounts';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    fetch('/api/admin/user-list?limit=0&offset=0', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.ok ? r.json() : { projects: [] })
      .then((d: { projects?: string[] }) => {
        if (Array.isArray(d.projects)) setAvailableProjects(d.projects);
      })
      .catch(() => {});
  }, []);

  const defaultPasswordPreview = useMemo(() => `${(form.username || 'USERNAME').toUpperCase()}@123`, [form.username]);

  function openCreateModal() {
    setModalMode('create');
    setForm({ username: '', email: '', role: 'Admin', teams: [], active: true });
    setShowModal(true);
  }

  function openEditModal(account: AccountRecord) {
    setModalMode('edit');
    setForm({
      id: account.id,
      username: account.username,
      email: account.email ?? '',
      role: account.role,
      teams: account.teams,
      active: account.active,
    });
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    if (modalMode === 'create' && !form.username.trim()) {
      showToast(false, 'Username is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const isCreate = modalMode === 'create';
      const url = isCreate ? '/api/admin/accounts' : `/api/admin/accounts/${form.id}`;
      const method = isCreate ? 'POST' : 'PUT';
      const payload = isCreate
        ? {
            username: form.username.trim(),
            email: form.email.trim() || undefined,
            role: form.role,
            teams: form.teams,
          }
        : {
            email: form.email.trim() || undefined,
            role: form.role,
            teams: form.teams,
            active: form.active,
          };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await getResponseMessage(res, isCreate ? 'Failed to create account' : 'Failed to update account'));
      }

      setShowModal(false);
      await loadAccounts();
      showToast(true, isCreate ? 'Account created successfully' : 'Account updated successfully');
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(account: AccountRecord) {
    const confirmed = window.confirm(`Reset password for ${account.username} to ${account.username.toUpperCase()}@123?`);
    if (!confirmed) return;

    setIsProcessingId(account.id);
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ resetPassword: true }),
      });
      if (!res.ok) {
        throw new Error(await getResponseMessage(res, 'Failed to reset password'));
      }
      await loadAccounts();
      showToast(true, `Password reset for ${account.username}`);
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsProcessingId(null);
    }
  }

  async function handleDelete(account: AccountRecord) {
    const confirmed = window.confirm(`Delete account ${account.username}? This cannot be undone.`);
    if (!confirmed) return;

    setIsProcessingId(account.id);
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        throw new Error(await getResponseMessage(res, 'Failed to delete account'));
      }
      await loadAccounts();
      showToast(true, `Deleted account ${account.username}`);
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setIsProcessingId(null);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">👤 Account Management</h1>
            <p className="text-sm text-gray-500">
              Manage admin and teamlead access for the compliance dashboard.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                Read-only view
              </span>
            )}
            {isAdmin && (
              <button type="button" onClick={openCreateModal} className="btn-primary">
                ➕ New Account
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="spinner w-8 h-8 border-primary-500 border-t-transparent"></span>
          </div>
        ) : error ? (
          <div className="p-5">
            <div className="alert-error justify-between flex-wrap">
              <span>⚠️ {error}</span>
              <button type="button" onClick={loadAccounts} className="btn-secondary text-sm">Retry</button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Username</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Teams</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-3 text-left font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-gray-500">
                      No accounts found.
                    </td>
                  </tr>
                ) : (
                  accounts.map((account, index) => (
                    <tr key={account.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 align-top text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{account.username}</span>
                          {account.mustChangePassword && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              🔐 Change password
                            </span>
                          )}
                        </div>
                        {account.email && <div className="mt-1 text-xs text-gray-500">{account.email}</div>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${account.role === 'Admin' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {account.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {account.teams.length > 0 ? (
                          <div className="flex flex-wrap">
                            {account.teams.map(team => (
                              <span key={`${account.id}-${team}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 mr-1 mb-1">
                                {team}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${account.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {account.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openEditModal(account)} className="btn-icon" title="Edit account" aria-label={`Edit ${account.username}`}>
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(account)}
                              className="btn-icon"
                              title="Reset password"
                              aria-label={`Reset password for ${account.username}`}
                              disabled={isProcessingId === account.id}
                            >
                              🔑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(account)}
                              className="btn-icon text-red-600 hover:bg-red-50"
                              title="Delete account"
                              aria-label={`Delete ${account.username}`}
                              disabled={isProcessingId === account.id}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !isSubmitting && setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <div>
                <h2 className="font-semibold text-gray-900">{modalMode === 'create' ? '➕ New Account' : '✏️ Edit Account'}</h2>
                <p className="text-sm text-gray-500">
                  {modalMode === 'create' ? 'Create a new admin or teamlead account.' : 'Update account access and profile details.'}
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="text-2xl leading-none text-gray-400 hover:text-gray-700">×</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
              <div className="form-field">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
                  className="form-input"
                  placeholder="Enter username"
                  required={modalMode === 'create'}
                  readOnly={modalMode === 'edit'}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Email</label>
                <input
                  type="text"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="form-input"
                  placeholder="Optional email address"
                />
              </div>

              <div className="form-field">
                <label className="form-label">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value as 'Admin' | 'Teamlead' }))}
                  className="form-select"
                >
                  <option value="Admin">Admin</option>
                  <option value="Teamlead">Teamlead</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Teams</label>
                {availableProjects.length === 0 ? (
                  <div className="text-sm text-gray-400 py-2 px-3 border border-gray-200 rounded">
                    No projects found — loading…
                  </div>
                ) : (
                  <MultiSelectDropdown
                    options={availableProjects}
                    selected={form.teams}
                    onChange={v => setForm(prev => ({ ...prev, teams: v === null ? availableProjects : v }))}
                    placeholder="All teams (none assigned)"
                    className="w-full"
                  />
                )}
                <span className="form-hint">
                  Select which project teams this account can access.
                  {form.role === 'Admin' ? ' Admins have full access regardless of teams.' : ''}
                </span>
              </div>

              {modalMode === 'create' ? (
                <div className="alert-info">
                  <span>🔑</span>
                  <span>Default password: <strong>{defaultPasswordPreview}</strong></span>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Active account
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><span className="spinner w-4 h-4 border-white border-t-transparent"></span>{modalMode === 'create' ? 'Creating…' : 'Saving…'}</>
                  ) : (
                    modalMode === 'create' ? 'Create Account' : 'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
