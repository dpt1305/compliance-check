'use client';

import { useState, useEffect, useCallback } from 'react';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
type CellStatus = Status | 'MISSING';

interface CheckInEntry {
  account: string; submissionType: string; status: Status;
  submissionDate: string; imageUrl: string;
}

function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }

const STATUS_OPTIONS: Status[] = ['PENDING', 'APPROVED', 'REJECTED'];

const cellClass: Record<CellStatus, string> = {
  APPROVED: 'bg-green-100 text-green-800 border-green-200',
  PENDING:  'bg-yellow-100 text-yellow-800 border-yellow-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  MISSING:  'bg-gray-100 text-gray-500 border-gray-200',
};

export default function CheckInTable() {
  const [entries, setEntries] = useState<CheckInEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/checkin-table', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed');
      setEntries(await res.json() as CheckInEntry[]);
    } catch { showToast('Failed to load check-in table'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredEntries = entries.filter(e => {
    if (typeFilter && e.submissionType !== typeFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    if (dateFrom && e.submissionDate < dateFrom) return false;
    if (dateTo && e.submissionDate > dateTo + 'T23:59:59') return false;
    return true;
  });

  const accounts = [...new Set(entries.map(e => e.account))].sort();
  const types = [...new Set(entries.map(e => e.submissionType))].sort();
  const allTypes = [...new Set(entries.map(e => e.submissionType))].sort();

  const matrix: Record<string, Record<string, CheckInEntry>> = {};
  for (const e of filteredEntries) {
    (matrix[e.account] ??= {})[e.submissionType] = e;
  }

  function getCellStatus(account: string, type: string): CellStatus {
    return matrix[account]?.[type]?.status ?? 'MISSING';
  }

  const summary: Record<CellStatus, number> = { APPROVED: 0, PENDING: 0, REJECTED: 0, MISSING: 0 };
  for (const account of accounts) {
    for (const type of types) {
      summary[getCellStatus(account, type)]++;
    }
  }

  return (
    <div className="p-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium bg-red-600 text-white">{toast}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="form-select w-40" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select className="form-select w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" className="form-input w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
        <input type="date" className="form-input w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
        <button onClick={() => { setTypeFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); }} className="btn-secondary text-sm">
          🧹 Clear
        </button>
        <button onClick={loadData} disabled={isLoading} className="btn-secondary text-sm">
          {isLoading ? <span className="spinner w-4 h-4 border-gray-400"></span> : '🔄'}
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="badge-approved">✓ Approved: {summary.APPROVED}</span>
        <span className="badge-pending">⏳ Pending: {summary.PENDING}</span>
        <span className="badge-rejected">✗ Rejected: {summary.REJECTED}</span>
        <span className="badge-missing">— Missing: {summary.MISSING}</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><span className="spinner w-8 h-8 border-primary-500 border-t-transparent"></span></div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-2">📭</div>
          <p>No data to display. Try clearing filters or refreshing.</p>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-gray-50">Account</th>
                  {types.map(type => <th key={type} className="capitalize">{type}</th>)}
                </tr>
              </thead>
              <tbody>
                {accounts.map(account => (
                  <tr key={account}>
                    <td className="font-medium sticky left-0 bg-white">{account}</td>
                    {types.map(type => {
                      const cellStatus = getCellStatus(account, type);
                      const entry = matrix[account]?.[type];
                      return (
                        <td key={type}
                          title={entry?.submissionDate ? new Date(entry.submissionDate).toLocaleString() : undefined}
                          className={`text-center border ${cellClass[cellStatus]}`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs font-medium">{cellStatus}</span>
                            {entry?.imageUrl && (
                              <a href={entry.imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">🖼️</a>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex gap-3 mt-3 text-xs">
            <span className={`px-2 py-1 rounded border ${cellClass.APPROVED}`}>APPROVED</span>
            <span className={`px-2 py-1 rounded border ${cellClass.PENDING}`}>PENDING</span>
            <span className={`px-2 py-1 rounded border ${cellClass.REJECTED}`}>REJECTED</span>
            <span className={`px-2 py-1 rounded border ${cellClass.MISSING}`}>MISSING</span>
          </div>
        </>
      )}
    </div>
  );
}
