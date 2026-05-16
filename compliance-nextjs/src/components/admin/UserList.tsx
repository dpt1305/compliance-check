'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import MultiSelectDropdown from './MultiSelectDropdown';
import { useAdminEvents } from '@/hooks/useAdminEvents';

const PAGE_SIZE = 50; // items per page (passed to API as limit)

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** Return the current month (1-12) and year in GMT+7 (Asia/Bangkok, no DST). */
function gmt7Now(): { month: number; year: number } {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

interface UserListEntry {
  source: 'tracking' | 'submission' | 'both';
  trackingRowNum?: number;
  trackingNo?: number | null;
  project?: string;
  name: string;
  email?: string;
  serial?: string;
  trackingAccount?: string;
  deviceType?: string;
  malwareAlerts?: string;
  complianceChecks?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  followUpAction?: string;
  responseFromTicket?: string;
  trackingStatus?: string;
  submissionId?: number;
  account?: string;
  submissionType?: string;
  submissionStatus?: string;
  submissionDate?: string;
  imageUrl?: string;
  confidenceScore?: number;
  deviceSerial?: string;
  deviceName?: string;
}

// Fields that map to /api/admin/user-list PUT (identity columns)
const TRACKING_FIELDS = new Set(['project','name','email','serial','account','deviceType','trackingStatus']);
// Fields that map to /api/admin/tracking PUT (seed/Trellix columns)
const SEED_FIELDS = new Set(['malwareAlerts','complianceChecks','seedConfiguration','operatingSystem','followUpAction']);

// Minimum column widths (px) — auto-sizing will expand beyond this
const MIN_COL_WIDTHS = {
  no: 40, project: 60, name: 60, account: 60, email: 60, serial: 60,
  type: 50, status: 80, malwareAlerts: 80, complianceChecks: 80,
  seedConfig: 80, os: 50, submitted: 100, image: 56, actions: 72,
} as const;
type ColKey = keyof typeof MIN_COL_WIDTHS;

// Default fallback widths — replaced at runtime by computeColWidths()
const DEFAULT_WIDTHS: Record<ColKey, number> = { ...MIN_COL_WIDTHS };

const COL_HEADERS: Record<ColKey, string> = {
  no: 'No.', project: 'Project', name: 'Name', account: 'Account', email: 'Email',
  serial: 'Serial', type: 'Type', status: 'Status', malwareAlerts: 'Malware Alerts',
  complianceChecks: 'Compliance Checks', seedConfig: 'SEED Config', os: 'OS',
  submitted: 'Submitted', image: 'Image', actions: 'Actions',
};

const CHAR_W = 7.2; // approximate px per char at text-xs (12px)
const COL_PAD = 20; // horizontal cell padding

function computeColWidths(rows: UserListEntry[]): Record<ColKey, number> {
  // Start with header label lengths
  const maxLen: Record<string, number> = Object.fromEntries(
    Object.entries(COL_HEADERS).map(([k, v]) => [k, v.length])
  );

  for (const row of rows) {
    const check = (key: string, val: string | null | undefined) => {
      if (val) maxLen[key] = Math.max(maxLen[key] ?? 0, val.length);
    };
    check('project', row.project);
    check('name', row.name);
    check('account', row.trackingAccount ?? row.account);
    check('email', row.email);
    check('serial', row.serial);
    check('type', row.deviceType ?? row.submissionType);
    check('status', row.submissionStatus ?? 'NOT SUBMITTED');
    check('malwareAlerts', row.malwareAlerts);
    check('complianceChecks', row.complianceChecks);
    check('seedConfig', row.seedConfiguration);
    check('os', row.operatingSystem);
    check('submitted', row.submissionDate ? formatDate(row.submissionDate) : null);
  }

  return Object.fromEntries(
    (Object.keys(MIN_COL_WIDTHS) as ColKey[]).map(k => [
      k,
      Math.max(
        MIN_COL_WIDTHS[k],
        Math.round((maxLen[k] ?? 0) * CHAR_W + COL_PAD)
      ),
    ])
  ) as Record<ColKey, number>;
}

interface AddMemberFields {
  project: string;
  name: string;
  email: string;
  serial: string;
  account: string;
  deviceType: string;
}

function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }
function authHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${getToken()}`, ...extra };
}

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED'] as const;

function statusBadge(s: string | undefined) {
  if (!s || s === 'NOT_SUBMITTED') return 'badge-missing';
  if (s === 'APPROVED') return 'badge-approved';
  if (s === 'PENDING') return 'badge-pending';
  return 'badge-rejected';
}
function statusLabel(s: string | undefined) {
  return (!s || s === 'NOT_SUBMITTED') ? 'Not Submitted' : s;
}
function dash(v: string | null | undefined) {
  return v && v !== '0 actions' ? <span>{v}</span> : <span className="text-gray-300">—</span>;
}

/** Convert any stored imageUrl to a relative /api/images/… path so it works on any host/port. */
function relativeImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/api\/images\/[^?#\s]+/);
  return m ? m[0] : url;
}
function formatDate(d: string | undefined) {
  return d ? new Date(d).toLocaleString() : '';
}

export default function UserList() {
  const [items, setItems] = useState<UserListEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ approved: 0, submitted: 0, notSubmitted: 0 });
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Tag-based search filter
  const [filterTags,   setFilterTags]   = useState<string[]>([]);
  const [tagInput,     setTagInput]     = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [filterProjects, setFilterProjects] = useState<string[] | null>(null);
  const { month: nowMonth, year: nowYear } = gmt7Now();
  const [filterMonth,  setFilterMonth]  = useState(String(nowMonth));
  const [filterYear,   setFilterYear]   = useState(String(nowYear));

  // Image viewer modal (opened by clicking a thumbnail)
  const [editRow, setEditRow] = useState<UserListEntry | null>(null);

  // Inline cell editing
  const [editCell, setEditCell] = useState<{ row: UserListEntry; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSavingCell, setIsSavingCell] = useState(false);

  // Column resizing
  const [colWidths, setColWidths] = useState({ ...DEFAULT_WIDTHS });
  const resizeRef = useRef<{ col: ColKey; startX: number; startW: number } | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [addMemberFields, setAddMemberFields] = useState<AddMemberFields>({
    project: '',
    name: '',
    email: '',
    serial: '',
    account: '',
    deviceType: '',
  });

  // Column resize — global mouse tracking
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current) return;
      const { col, startX, startW } = resizeRef.current;
      setColWidths(prev => ({ ...prev, [col]: Math.max(40, startW + e.clientX - startX) }));
    }
    function onMouseUp() { resizeRef.current = null; }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Upload / download / clear
  const [isUploading,   setIsUploading]   = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isClearing,    setIsClearing]    = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // filterRef lets loadPage stay stable while always reading current filter state
  const filterStateRef = useRef({ filterProjects, filterMonth, filterYear, filterTags });

  const loadPage = useCallback(async (offset: number, reset: boolean) => {
    const { filterProjects, filterMonth, filterYear, filterTags } = filterStateRef.current;
    const params = new URLSearchParams();
    params.set('offset', String(offset));
    params.set('limit', String(PAGE_SIZE));
    if (filterProjects !== null) filterProjects.forEach(p => params.append('project', p));
    if (filterMonth) params.set('month', filterMonth);
    if (filterYear)  params.set('year',  filterYear);
    filterTags.forEach(t => params.append('tag', t));

    if (reset) setIsLoading(true); else setIsFetchingMore(true);
    try {
      const res = await fetch(`/api/admin/user-list?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      const d = await res.json() as { items: UserListEntry[]; total: number; projects: string[]; summary: { approved: number; submitted: number; notSubmitted: number } };
      if (reset) {
        setItems(d.items);
        setColWidths(computeColWidths(d.items));
      } else {
        setItems(prev => {
          const merged = [...prev, ...d.items];
          setColWidths(computeColWidths(merged));
          return merged;
        });
      }
      setTotal(d.total);
      setSummary(d.summary);
      if (d.projects.length > 0) setAvailableProjects(d.projects);
    } catch {
      setToast({ msg: 'Failed to load user list', ok: false });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  }, []); // stable — reads filters via ref

  const loadData = useCallback(() => loadPage(0, true), [loadPage]);

  // Update ref + reload on filter change (also fires on mount for initial load)
  useEffect(() => {
    filterStateRef.current = { filterProjects, filterMonth, filterYear, filterTags };
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProjects, filterMonth, filterYear, filterTags]);

  // Real-time updates via SSE — instantly reloads when tracking or submissions change.
  useAdminEvents({ onTracking: loadData, onSubmissions: loadData });

  // Infinite scroll sentinel
  const hasMore = items.length < total;
  useEffect(() => {
    if (!hasMore || isFetchingMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const currentOffset = items.length;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadPage(currentOffset, false); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, items.length, loadPage]);

  // ── Image viewer (thumbnail click) ─────────────────────────────────────────
  function openImageViewer(row: UserListEntry) {
    setEditRow(row);
  }

  // ── Inline cell editing ──────────────────────────────────────────────────────
  function startCellEdit(row: UserListEntry, field: string, currentValue: string) {
    setEditCell({ row, field });
    setEditValue(currentValue);
  }
  function cancelCellEdit() { setEditCell(null); setEditValue(''); }

  async function commitCellEdit() {
    if (!editCell) return;
    const { row, field } = editCell;
    const value = editValue.trim();

    if (field === 'name' && !value) { showToast('Name is required', false); return; }

    setIsSavingCell(true);
    try {
      let ok = true;

      if (field === 'submissionStatus') {
        if (row.submissionId) {
          const r = await fetch(`/api/admin/submissions/${row.submissionId}`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ status: value }),
          });
          ok = r.ok;
        }
      } else if (TRACKING_FIELDS.has(field)) {
        if (row.trackingRowNum) {
          const r = await fetch('/api/admin/user-list', {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ rowNum: row.trackingRowNum, [field]: value }),
          });
          ok = r.ok;
        }
      } else if (SEED_FIELDS.has(field)) {
        if (row.trackingRowNum) {
          const r = await fetch('/api/admin/tracking', {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ rowNum: row.trackingRowNum, [field]: value }),
          });
          ok = r.ok;
        }
      }

      if (!ok) throw new Error('Update failed');

      // Reflect in local state immediately
      setItems(prev => prev.map(r => {
        if (r.submissionId !== row.submissionId && r.trackingRowNum !== row.trackingRowNum) return r;
        const patch: Partial<UserListEntry> = {};
        if (field === 'submissionStatus') patch.submissionStatus = value;
        else if (field === 'project') patch.project = value;
        else if (field === 'name') patch.name = value;
        else if (field === 'email') patch.email = value;
        else if (field === 'serial') patch.serial = value;
        else if (field === 'account') patch.trackingAccount = value;
        else if (field === 'deviceType') patch.deviceType = value;
        else if (field === 'trackingStatus') patch.trackingStatus = value;
        else if (field === 'malwareAlerts') patch.malwareAlerts = value;
        else if (field === 'complianceChecks') patch.complianceChecks = value;
        else if (field === 'seedConfiguration') patch.seedConfiguration = value;
        else if (field === 'operatingSystem') patch.operatingSystem = value;
        else if (field === 'followUpAction') patch.followUpAction = value;
        return { ...r, ...patch };
      }));
      setEditCell(null);
      showToast('Saved', true);
    } catch { showToast('Save failed', false); }
    finally { setIsSavingCell(false); }
  }

  /** Returns a double-click-to-edit table cell — called as a function, NOT used as <Component> to avoid remount */
  function renderCell(row: UserListEntry, field: string, value: string, className = '') {
    const active = editCell?.row === row && editCell?.field === field;
    const canEdit = TRACKING_FIELDS.has(field) || SEED_FIELDS.has(field) ? !!row.trackingRowNum : false;

    if (active) {
      return (
        <td key={field} className={`${className} p-0 align-top`} style={{ minWidth: 90 }}>
          <div className="flex flex-col gap-1 p-1">
            <input
              className="form-input text-xs py-0.5 px-1 w-full"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitCellEdit(); } if (e.key === 'Escape') cancelCellEdit(); }}
            />
            <div className="flex gap-1 justify-start">
              <button
                onMouseDown={e => { e.preventDefault(); commitCellEdit(); }}
                disabled={isSavingCell}
                className="w-5 h-5 rounded-full bg-green-500 hover:bg-green-600 text-white text-xs flex items-center justify-center disabled:opacity-50"
                title="Save (Enter)"
              >✓</button>
              <button
                onMouseDown={e => { e.preventDefault(); cancelCellEdit(); }}
                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs flex items-center justify-center"
                title="Cancel (Esc)"
              >✕</button>
            </div>
          </div>
        </td>
      );
    }

    return (
      <td
        key={field}
        className={`${className} ${canEdit ? 'cursor-pointer hover:bg-indigo-50 group' : ''}`}
        onDoubleClick={canEdit ? (e) => { e.stopPropagation(); startCellEdit(row, field, value); } : undefined}
        title={canEdit ? 'Double-click to edit' : undefined}
      >
        <span className="block truncate">{value || <span className="text-gray-300">—</span>}</span>
        {canEdit && <span className="hidden group-hover:inline-block ml-1 text-indigo-300 text-xs">✎</span>}
      </td>
    );
  }

  async function deleteSubmission(entry: UserListEntry) {
    if (!entry.submissionId) return;
    if (!confirm(`Delete submission for "${entry.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/submissions/${entry.submissionId}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      setItems(prev => prev.map(r =>
        r.submissionId === entry.submissionId
          ? { ...r, submissionId: undefined, submissionStatus: 'NOT_SUBMITTED', submissionDate: undefined, imageUrl: undefined, source: 'tracking' as const }
          : r
      ));
      showToast('Submission deleted', true);
    } catch { showToast('Failed to delete', false); }
  }

  async function deleteMember(entry: UserListEntry) {
    if (!entry.trackingRowNum) return;
    if (!confirm(`Delete member "${entry.name}" from tracking list?`)) return;
    try {
      const res = await fetch(`/api/admin/user-list?rowNum=${entry.trackingRowNum}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const body = await res.json() as { message?: string };
      if (!res.ok) {
        showToast(body.message ?? 'Failed to delete member', false);
        return;
      }
      showToast('Member deleted from tracking list', true);
      await loadData();
    } catch {
      showToast('Failed to delete member', false);
    }
  }

  function openAddMember() {
    setAddMemberFields({
      project: '',
      name: '',
      email: '',
      serial: '',
      account: '',
      deviceType: '',
    });
    setShowAddMemberModal(true);
  }

  async function saveNewMember() {
    if (!addMemberFields.name.trim()) {
      showToast('Name is required', false);
      return;
    }

    setIsSavingMember(true);
    try {
      const res = await fetch('/api/admin/user-list', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(addMemberFields),
      });
      const body = await res.json() as { message?: string };
      if (!res.ok) {
        showToast(body.message ?? 'Failed to add member', false);
        return;
      }

      setShowAddMemberModal(false);
      showToast('Member added successfully', true);
      await loadData();
    } catch {
      showToast('Failed to add member', false);
    } finally {
      setIsSavingMember(false);
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (uploadRef.current) uploadRef.current.value = '';
    if (!file) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/tracking', { method: 'POST', headers: authHeaders(), body: form });
      const body = await res.json() as { message: string };
      if (!res.ok) { showToast(body.message ?? 'Upload failed', false); return; }
      showToast('Tracking file updated — refreshing…', true);
      await loadData();
    } catch { showToast('Upload failed', false); }
    finally { setIsUploading(false); }
  }

  // ── Download ────────────────────────────────────────────────────────────────
  async function handleDownload() {
    setIsDownloading(true);
    try {
      const month  = parseInt(filterMonth, 10);
      const year   = parseInt(filterYear, 10);
      const hasP   = !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;
      const hasText       = filterTags.length > 0;
      const hasProjects   = filterProjects !== null;
      // Any active filter → filtered export via POST
      const hasAnyFilter = hasText || hasProjects || hasP;

      if (!hasAnyFilter) {
        // No filters at all — return raw tracking.xlsx
        const res = await fetch('/api/admin/tracking', { headers: authHeaders() });
        if (!res.ok) {
          const d = await res.json() as { message?: string };
          showToast(d.message ?? 'Tracking file not found', false);
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = 'tracking.xlsx';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(objectUrl);
        return;
      }

      // Fetch all filtered items (no pagination limit) for ZIP export
      const allParams = new URLSearchParams();
      allParams.set('offset', '0');
      allParams.set('limit', '99999');
      if (filterProjects !== null) filterProjects.forEach(p => allParams.append('project', p));
      if (hasP) { allParams.set('month', String(month)); allParams.set('year', String(year)); }
      filterTags.forEach(t => allParams.append('tag', t));
      const allRes = await fetch(`/api/admin/user-list?${allParams}`, { headers: authHeaders() });
      if (!allRes.ok) { showToast('Failed to fetch filter data', false); return; }
      const allData = await allRes.json() as { items: UserListEntry[] };
      const members = allData.items.map((row, idx) => ({
        no: idx + 1,
        name: row.name,
        trackingRowNum: row.trackingRowNum,
        account: row.trackingAccount ?? row.account,
        submissionId: row.submissionId,
      }));

      if (members.length === 0) {
        showToast('No members match the current filter', false);
        return;
      }

      const res = await fetch('/api/admin/tracking', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          month: hasP ? month : undefined,
          year:  hasP ? year  : undefined,
          members,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { message?: string };
        showToast(d.message ?? 'Download failed', false);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = hasP
        ? `tracking_${MONTH_NAMES[month - 1]}_${year}.zip`
        : 'tracking_filtered.zip';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(objectUrl);
    } catch { showToast('Download failed', false); }
    finally { setIsDownloading(false); }
  }

  // ── Clear period ─────────────────────────────────────────────────────────────
  async function handleClearPeriod() {
    const month = parseInt(filterMonth, 10);
    const year  = parseInt(filterYear,  10);
    if (!month || !year) return;

    const monthName = MONTH_NAMES[month - 1];
    const confirmed = confirm(
      `Delete ALL submissions for ${monthName} ${year}?\n\n` +
      `This will permanently remove all submission records and their associated image files for this period.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const res = await fetch(
        `/api/admin/submissions?month=${month}&year=${year}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      const body = await res.json() as { message?: string; deleted?: number; imagesDeleted?: number };
      if (!res.ok) { showToast(body.message ?? 'Clear failed', false); return; }
      showToast(body.message ?? `Cleared ${body.deleted} submissions`, true);
      await loadData();
    } catch { showToast('Clear failed', false); }
    finally { setIsClearing(false); }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalCount        = total;
  const approvedCount     = summary.approved;
  const submittedCount    = summary.submitted;
  const notSubmittedCount = summary.notSubmitted;

  // ── Year options ─────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="p-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Add member modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Add New Member</h2>
              <button onClick={() => setShowAddMemberModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'project', label: 'Project' },
                { key: 'name', label: 'Name *' },
                { key: 'email', label: 'Email' },
                { key: 'serial', label: 'Serial' },
                { key: 'account', label: 'Account' },
                { key: 'deviceType', label: 'Type' },
              ].map(({ key, label }) => (
                <div key={key} className="form-field">
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    value={addMemberFields[key as keyof AddMemberFields]}
                    onChange={e => setAddMemberFields(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setShowAddMemberModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveNewMember} disabled={isSavingMember} className="btn-primary flex items-center gap-2">
                {isSavingMember && <span className="spinner w-4 h-4 border-white border-t-transparent"></span>}
                Save Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image viewer modal — iframe gives native browser zoom/scroll experience */}
      {editRow && (() => {
        const imgUrl = relativeImageUrl(editRow.imageUrl);
        return (
          <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditRow(null)}>
            <div
              className="bg-white rounded-lg shadow-2xl flex flex-col w-full max-w-5xl"
              style={{ height: '90vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <h2 className="font-semibold text-gray-900 truncate">
                  {editRow.name}{editRow.email ? ` — ${editRow.email}` : ''}
                </h2>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {imgUrl && (
                    <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="btn-icon text-primary-600 text-sm" title="Open in new tab">↗ New tab</a>
                  )}
                  <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
                </div>
              </div>

              {/* Native browser image frame */}
              <div className="flex-1 min-h-0 bg-gray-100 rounded-b-lg overflow-hidden">
                {imgUrl ? (
                  <iframe
                    src={imgUrl}
                    title="Image viewer"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 gap-2 h-full">
                    <span className="text-5xl">🖼️</span>
                    <span className="text-sm">No image submitted</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">Showing: {totalCount}</span>
        <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-medium">Approved: {approvedCount}</span>
        <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">Submitted: {submittedCount}</span>
        <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">Not Submitted: {notSubmittedCount}</span>
      </div>

      {/* Toolbar row 1: tag search + status + period */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {/* Tag search input */}
        <div
          className="flex flex-wrap items-center gap-1 min-h-[38px] px-2 py-1 border border-gray-300 rounded bg-white cursor-text focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400"
          style={{ minWidth: '220px', maxWidth: '480px' }}
          onClick={() => tagInputRef.current?.focus()}
        >
          {filterTags.map(tag => (
            <span key={tag} className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs font-medium whitespace-nowrap">
              {tag}
              <button
                type="button"
                className="hover:text-red-600 leading-none ml-0.5 text-indigo-500"
                onClick={e => { e.stopPropagation(); setFilterTags(prev => prev.filter(t => t !== tag)); }}
                title={`Remove tag "${tag}"`}
              >×</button>
            </span>
          ))}
          <input
            ref={tagInputRef}
            className="flex-1 min-w-[100px] outline-none text-sm bg-transparent py-0.5"
            placeholder={filterTags.length === 0 ? 'Type and press Enter to search…' : 'Add tag…'}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const t = tagInput.trim();
                if (t && !filterTags.includes(t)) setFilterTags(prev => [...prev, t]);
                setTagInput('');
              } else if (e.key === 'Backspace' && tagInput === '' && filterTags.length > 0) {
                setFilterTags(prev => prev.slice(0, -1));
              }
            }}
          />
          {(filterTags.length > 0 || tagInput) && (
            <button
              type="button"
              className="ml-1 text-xs text-gray-400 hover:text-red-500 leading-none px-1"
              title="Clear all tags"
              onClick={e => { e.stopPropagation(); setFilterTags([]); setTagInput(''); }}
            >✕</button>
          )}
        </div>
        <MultiSelectDropdown
          options={availableProjects}
          selected={filterProjects}
          onChange={setFilterProjects}
          placeholder="All projects"
          className="w-48"
        />

        {/* Period filter */}
        <select className="form-select w-36" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">All months</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
        <select className="form-select w-28" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="">All years</option>
          {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        {(filterMonth || filterYear) && (
          <button
            onClick={() => { setFilterMonth(''); setFilterYear(''); }}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Clear period
          </button>
        )}
      </div>

      {/* Toolbar row 2: actions */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={openAddMember}
          className="btn-primary flex items-center gap-1.5 text-sm"
          title="Add new member to tracking.xlsx"
        >
          ➕ Add Member
        </button>
        <input ref={uploadRef} type="file" accept=".xlsx" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => uploadRef.current?.click()}
          disabled={isUploading}
          className="btn-secondary flex items-center gap-1.5 text-sm"
          title="Upload new tracking.xlsx to replace server file"
        >
          {isUploading
            ? <><span className="spinner w-4 h-4 border-gray-400 border-t-transparent"></span> Uploading…</>
            : <>📤 Upload Tracking</>}
        </button>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="btn-secondary flex items-center gap-1.5 text-sm"
          title={
            filterTags.length > 0 || filterProjects !== null || filterMonth || filterYear
              ? `Download filtered ZIP: ${total} member(s) currently shown`
              : 'Download full tracking.xlsx (no filters active)'
          }
        >
          {isDownloading
            ? <><span className="spinner w-4 h-4 border-gray-400 border-t-transparent"></span> Downloading…</>
            : filterTags.length > 0 || filterProjects !== null || filterMonth || filterYear
              ? <>📥 Download Filtered ZIP ({total})</>
              : <>📥 Download Tracking</>}
        </button>
        {/* Clear period — only shown when month+year filter is active */}
        {filterMonth && filterYear && (
          <button
            onClick={handleClearPeriod}
            disabled={isClearing}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition disabled:opacity-50"
            title={`Delete all submissions and images for ${MONTH_NAMES[parseInt(filterMonth) - 1]} ${filterYear}`}
          >
            {isClearing
              ? <><span className="spinner w-4 h-4 border-red-400 border-t-transparent"></span> Clearing…</>
              : <>🗑️ Clear {MONTH_NAMES[parseInt(filterMonth) - 1]} {filterYear}</>}
          </button>
        )}
        <div className="flex-1" />
        <button onClick={loadData} disabled={isLoading} className="btn-secondary" title="Refresh">
          {isLoading ? <span className="spinner w-4 h-4 border-gray-400 border-t-transparent"></span> : '🔄'}
        </button>
      </div>

      {/* Count row */}
      <div className="flex items-center justify-between mb-2 text-sm text-gray-500">
        <span>
          Showing <strong>{items.length}</strong> of <strong>{total}</strong>
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="data-table text-xs" style={{ tableLayout: 'fixed', minWidth: Object.values(colWidths).reduce((a, b) => a + b, 0) }}>
          <colgroup>
            {(Object.keys(MIN_COL_WIDTHS) as ColKey[]).map(k => (
              <col key={k} style={{ width: colWidths[k] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {(Object.keys(COL_HEADERS) as ColKey[]).map(col => (
                <th key={col} className="relative select-none whitespace-nowrap overflow-hidden" style={{ width: colWidths[col] }}>
                  <span className="block truncate pr-2">{COL_HEADERS[col]}</span>
                  {/* Resize handle */}
                  <span
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-indigo-300/40"
                    onMouseDown={e => {
                      e.preventDefault();
                      resizeRef.current = { col, startX: e.clientX, startW: colWidths[col] };
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center text-gray-500 py-8">
                  {isLoading ? 'Loading…' : filterTags.length > 0 || filterProjects !== null || filterMonth || filterYear
                    ? 'No results match the current filters.'
                    : 'No data found.'}
                </td>
              </tr>
            ) : items.map((row, idx) => (
              <tr
                key={row.submissionId ?? `tr-${row.trackingNo ?? idx}`}
                className={!row.submissionStatus || row.submissionStatus === 'NOT_SUBMITTED' ? 'bg-red-50' : ''}
              >
                {/* No. — not editable */}
                <td className="text-gray-400 font-medium">{idx + 1}</td>

                {/* Project */}
                {renderCell(row, 'project', row.project ?? '', 'text-gray-500')}

                {/* Name */}
                {renderCell(row, 'name', row.name ?? '', 'font-medium')}

                {/* Account */}
                {renderCell(row, 'account', row.trackingAccount ?? row.account ?? '', 'text-gray-500')}

                {/* Email */}
                {renderCell(row, 'email', row.email ?? '', 'text-gray-500')}

                {/* Serial */}
                {renderCell(row, 'serial', row.serial ?? '', 'font-mono text-gray-600')}

                {/* Type */}
                {renderCell(row, 'deviceType', row.deviceType ?? row.submissionType ?? '', 'capitalize')}

                {/* Status — direct dropdown for submitted members; badge for unsubmitted */}
                {row.submissionId ? (
                  <td className="p-1">
                    <select
                      className="form-select text-xs py-0.5 px-1 w-full"
                      value={row.submissionStatus ?? 'PENDING'}
                      onChange={async e => {
                        const newStatus = e.target.value;
                        setItems(prev => prev.map(r =>
                          r.submissionId === row.submissionId ? { ...r, submissionStatus: newStatus } : r
                        ));
                        try {
                          const res = await fetch(`/api/admin/submissions/${row.submissionId}`, {
                            method: 'PUT',
                            headers: authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ status: newStatus }),
                          });
                          if (!res.ok) throw new Error();
                        } catch {
                          // revert on error
                          setItems(prev => prev.map(r =>
                            r.submissionId === row.submissionId ? { ...r, submissionStatus: row.submissionStatus } : r
                          ));
                          showToast('Failed to update status', false);
                        }
                      }}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                ) : (
                  <td>
                    <span className={statusBadge(row.submissionStatus)}>{statusLabel(row.submissionStatus)}</span>
                  </td>
                )}

                {/* Malware Alerts */}
                {renderCell(row, 'malwareAlerts', row.malwareAlerts ?? '')}

                {/* Compliance Checks */}
                {renderCell(row, 'complianceChecks', row.complianceChecks ?? '')}

                {/* SEED Config */}
                {renderCell(row, 'seedConfiguration', row.seedConfiguration ?? '')}

                {/* OS */}
                {renderCell(row, 'operatingSystem', row.operatingSystem ?? '')}

                {/* Submitted — read-only */}
                <td className="text-gray-400 whitespace-nowrap truncate">
                  {row.submissionDate ? formatDate(row.submissionDate) : <span className="text-red-400">—</span>}
                </td>

                {/* Image thumbnail */}
                <td>
                  {(() => {
                    const thumb = relativeImageUrl(row.imageUrl);
                    return thumb ? (
                      <button onClick={() => openImageViewer(row)} title="View image" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt="submission"
                          className="w-10 h-10 object-cover rounded border border-gray-200 hover:ring-2 hover:ring-primary-400 transition"
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                            el.insertAdjacentHTML('afterend', '<span class="text-gray-300 text-xs">err</span>');
                          }}
                        />
                      </button>
                    ) : <span className="text-gray-200">—</span>;
                  })()}
                </td>

                {/* Actions — only delete buttons remain */}
                <td>
                  <div className="flex gap-1">
                    {row.trackingRowNum && (
                      <button onClick={() => deleteMember(row)} className="btn-icon text-amber-700" title="Delete member">🧾</button>
                    )}
                    {row.submissionId && (
                      <button onClick={() => deleteSubmission(row)} className="btn-icon text-red-600" title="Delete submission">🗑️</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scroll sentinel / load-more indicator */}
      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center items-center py-4 text-sm text-gray-400">
          {isFetchingMore
            ? <><span className="spinner w-4 h-4 border-gray-300 border-t-primary-500 mr-2"></span>Loading more…</>
            : <span className="py-2 text-gray-300">↓</span>}
        </div>
      ) : total > 0 ? (
        <p className="text-center text-xs text-gray-400 py-3">
          All {total} {total === 1 ? 'record' : 'records'} shown
        </p>
      ) : null}
    </div>
  );
}
