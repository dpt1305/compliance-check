'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  validationResult?: string;
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
/** Strip trailing "actions", "action", spaces etc. — return the bare integer string, or null. */
function numOnly(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/\d+/);
  return m ? m[0] : null;
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

function sortValue(row: UserListEntry, col: string): string {
  switch (col) {
    case 'project': return row.project ?? '';
    case 'name': return row.name ?? '';
    case 'account': return (row.trackingAccount ?? row.account ?? '').toLowerCase();
    case 'email': return row.email ?? '';
    case 'serial': return row.serial ?? '';
    case 'type': return row.deviceType ?? row.submissionType ?? '';
    case 'status': return row.submissionStatus ?? '';
    case 'malwareAlerts': return row.malwareAlerts ?? '';
    case 'complianceChecks': return row.complianceChecks ?? '';
    case 'seedConfig': return row.seedConfiguration ?? '';
    case 'os': return row.operatingSystem ?? '';
    case 'submitted': return row.submissionDate ?? '';
    default: return '';
  }
}

function compareUserListRows(rowA: UserListEntry, rowB: UserListEntry, sortCol: string, sortDir: 'asc' | 'desc') {
  const va = sortValue(rowA, sortCol);
  const vb = sortValue(rowB, sortCol);
  const cmp = sortCol === 'submitted'
    ? (new Date(va || 0).getTime() - new Date(vb || 0).getTime())
    : va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
  return sortDir === 'asc' ? cmp : -cmp;
}

export default function UserList() {
  const [items, setItems] = useState<UserListEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ approved: 0, submitted: 0, notSubmitted: 0 });
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTeamlead, setIsTeamlead] = useState(false);

  // Tag-based search filter
  const [filterTags,   setFilterTags]   = useState<string[]>([]);
  const [tagInput,     setTagInput]     = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [filterProjects, setFilterProjects] = useState<string[] | null>(null);
  const { month: nowMonth, year: nowYear } = gmt7Now();
  const [filterMonth,  setFilterMonth]  = useState(String(nowMonth));
  const [filterYear,   setFilterYear]   = useState(String(nowYear));
  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Image viewer modal (opened by clicking a thumbnail)
  const [editRow, setEditRow] = useState<UserListEntry | null>(null);

  // Review modal — index into the submissions-only sub-list
  const [reviewIdx, setReviewIdx] = useState<number | null>(null);
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  // SEED tile inline editing inside the review modal
  const [reviewSeedEdit, setReviewSeedEdit] = useState<{ field: string; value: string } | null>(null);
  const [isSeedSaving, setIsSeedSaving] = useState(false);
  const seedSavingRef = useRef(false); // prevents double-save on Enter + blur

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

  useEffect(() => {
    setIsTeamlead(sessionStorage.getItem('admin_role') === 'Teamlead');
  }, []);

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

  useEffect(() => {
    sessionStorage.setItem('ul_sort_col', sortCol);
    sessionStorage.setItem('ul_sort_dir', sortDir);
  }, [sortCol, sortDir]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => compareUserListRows(a, b, sortCol, sortDir)), [items, sortCol, sortDir]);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

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

  // ── Review modal ─────────────────────────────────────────────────────────────
  /** Items that have an actual submission (submissionId defined) */
  const reviewItems = sortedItems.filter(r => r.submissionId !== undefined);

  function openReview(row: UserListEntry) {
    const idx = reviewItems.findIndex(r => r.submissionId === row.submissionId);
    if (idx >= 0) setReviewIdx(idx);
  }

  function closeReview() { setReviewIdx(null); }

  function reviewNavigate(delta: 1 | -1) {
    setReviewIdx(prev => {
      if (prev === null) return null;
      const next = prev + delta;
      if (next < 0 || next >= reviewItems.length) return prev;
      return next;
    });
  }

  async function reviewChangeStatus(status: 'APPROVED' | 'REJECTED' | 'PENDING') {
    if (reviewIdx === null) return;
    const row = reviewItems[reviewIdx];
    if (!row.submissionId) return;
    setIsReviewSaving(true);
    try {
      const res = await fetch(`/api/admin/submissions/${row.submissionId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setItems(prev => prev.map(r =>
        r.submissionId === row.submissionId ? { ...r, submissionStatus: status } : r
      ));
      showToast(`Status set to ${status}`, true);
    } catch { showToast('Failed to update status', false); }
    finally { setIsReviewSaving(false); }
  }

  async function saveSeedField(field: string, value: string) {
    if (seedSavingRef.current) return;
    if (reviewIdx === null) return;
    const row = reviewItems[reviewIdx];
    if (!row.trackingRowNum) { setReviewSeedEdit(null); return; }
    seedSavingRef.current = true;
    setIsSeedSaving(true);
    try {
      const res = await fetch('/api/admin/tracking', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ rowNum: row.trackingRowNum, [field]: value }),
      });
      if (!res.ok) throw new Error();
      const patch: Partial<UserListEntry> = { [field]: value };
      setItems(prev => prev.map(r =>
        r.trackingRowNum === row.trackingRowNum ? { ...r, ...patch } : r
      ));
      setReviewSeedEdit(null);
      showToast('Saved', true);
    } catch { showToast('Save failed', false); }
    finally { setIsSeedSaving(false); seedSavingRef.current = false; }
  }

  // Keyboard navigation for review modal
  useEffect(() => {
    if (reviewIdx === null) return;
    function onKey(e: KeyboardEvent) {
      // If a SEED tile is being edited, Escape cancels the edit only
      if (reviewSeedEdit) {
        if (e.key === 'Escape') { e.preventDefault(); setReviewSeedEdit(null); }
        return; // block arrow/close navigation while editing
      }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); reviewNavigate(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); reviewNavigate(1); }
      if (e.key === 'Escape')     { e.preventDefault(); closeReview(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewIdx, reviewItems.length, reviewSeedEdit]);

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
    const canEdit = !isTeamlead && (TRACKING_FIELDS.has(field) || SEED_FIELDS.has(field) ? !!row.trackingRowNum : false);

    if (active) {
      return (
        <td key={field} className={`${className} p-0 align-top border-r border-gray-200`} style={{ minWidth: 90 }}>
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
        className={`${className} border-r border-gray-200 ${canEdit ? 'cursor-pointer hover:bg-indigo-50 group' : ''}`}
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
      const sortedAll = [...allData.items].sort((a, b) => compareUserListRows(a, b, sortCol, sortDir));
      const members = sortedAll.map((row, idx) => ({
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
              <div className="form-field">
                <label className="form-label">Type</label>
                <input
                  className="form-input"
                  list="add-member-type-list"
                  value={addMemberFields.deviceType}
                  onChange={e => setAddMemberFields(f => ({ ...f, deviceType: e.target.value }))}
                  placeholder="Choose or type a new type"
                />
                <datalist id="add-member-type-list">
                  {Array.from(
                    new Set(
                      items
                        .map(row => row.deviceType ?? row.submissionType ?? '')
                        .filter(Boolean)
                    )
                  ).map(type => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>
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

      {/* Review modal */}
      {reviewIdx !== null && (() => {
        const row = reviewItems[reviewIdx];
        if (!row) return null;
        const imgUrl = relativeImageUrl(row.imageUrl);
        const currentStatus = row.submissionStatus ?? 'PENDING';

        // Parse the stored validation JSON for display
        let aiResult: Record<string, unknown> | null = null;
        try { if (row.validationResult) aiResult = JSON.parse(row.validationResult as string); } catch { /* ignore */ }
        const failedChecks: string[] = (aiResult?.failedChecks as string[] | undefined) ?? [];
        const guidelines: string[] = (aiResult?.guidelines as string[] | undefined) ?? [];
        const checklist = (aiResult?.checklist ?? {}) as Record<string, boolean>;
        const checklistEntries = Object.entries(checklist);
        const aiReason = (aiResult?.reason as string | undefined) ?? '';
        const aiSuggestion = (aiResult?.suggestion as string | undefined) ?? '';
        const hasPrev = reviewIdx > 0;
        const hasNext = reviewIdx < reviewItems.length - 1;

        return (
          <div
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-2"
            onClick={closeReview}
          >
            {/* Prev arrow */}
            <button
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-lg transition
                ${hasPrev ? 'bg-white/90 hover:bg-white text-gray-700 cursor-pointer' : 'bg-white/30 text-white/30 cursor-not-allowed'}`}
              onClick={e => { e.stopPropagation(); if (hasPrev) reviewNavigate(-1); }}
              title="Previous (←)"
              disabled={!hasPrev}
            >‹</button>

            {/* Next arrow */}
            <button
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-lg transition
                ${hasNext ? 'bg-white/90 hover:bg-white text-gray-700 cursor-pointer' : 'bg-white/30 text-white/30 cursor-not-allowed'}`}
              onClick={e => { e.stopPropagation(); if (hasNext) reviewNavigate(1); }}
              title="Next (→)"
              disabled={!hasNext}
            >›</button>

            {/* Modal card */}
            <div
              className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-6xl mx-12"
              style={{ height: '92vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-gray-900 truncate text-sm">
                    {row.name}{row.email ? ` — ${row.email}` : ''}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                    currentStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    currentStatus === 'REJECTED' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{currentStatus}</span>
                  <span className="text-xs text-gray-400 shrink-0">{reviewIdx + 1} / {reviewItems.length}</span>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {imgUrl && (
                    <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="btn-icon text-primary-600 text-xs" title="Open image in new tab">↗</a>
                  )}
                  <button onClick={closeReview} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
                </div>
              </div>

              {/* Body — two columns */}
              <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Left pane — submission details */}
                <div className="w-80 shrink-0 flex flex-col border-r border-gray-100 overflow-y-auto p-4 gap-4 text-xs">

                  {/* Person info */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Member</h3>
                    <dl className="space-y-1">
                      {[
                        ['Project',  row.project],
                        ['Name',     row.name],
                        ['Account',  row.trackingAccount ?? row.account],
                        ['Email',    row.email],
                        ['Serial',   row.serial ?? row.deviceSerial],
                        ['Device',   row.deviceName],
                      ].map(([label, val]) => val ? (
                        <div key={label} className="flex gap-1">
                          <dt className="text-gray-400 shrink-0 w-14">{label}</dt>
                          <dd className="text-gray-700 font-medium truncate">{val}</dd>
                        </div>
                      ) : null)}
                    </dl>
                  </section>

                  {/* Submission meta */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Submission</h3>
                    <dl className="space-y-1">
                      {[
                        ['Type',       row.submissionType ?? row.deviceType],
                        ['Date',       row.submissionDate ? formatDate(row.submissionDate) : null],
                        ['Confidence', row.confidenceScore != null ? `${row.confidenceScore}%` : null],
                      ].map(([label, val]) => val ? (
                        <div key={label} className="flex gap-1">
                          <dt className="text-gray-400 shrink-0 w-20">{label}</dt>
                          <dd className="text-gray-700 font-medium">{val}</dd>
                        </div>
                      ) : null)}
                    </dl>
                  </section>

                  {/* SEED dashboard tiles — click to edit */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">SEED Dashboard</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { field: 'malwareAlerts',   label: 'Malware Alerts',    value: row.malwareAlerts },
                        { field: 'complianceChecks', label: 'Compliance Checks', value: row.complianceChecks },
                        { field: 'seedConfiguration',label: 'SEED Configuration',value: row.seedConfiguration },
                        { field: 'operatingSystem',  label: 'Operating System',  value: row.operatingSystem },
                      ] as { field: string; label: string; value: string | undefined }[]).map(({ field, label, value }) => {
                        const isEditing = reviewSeedEdit?.field === field;
                        const display  = numOnly(value);
                        const num = display !== null ? parseInt(display, 10) : NaN;
                        const isZero   = !isNaN(num) && num === 0;
                        const hasIssue = !isNaN(num) && num > 0;
                        const canEdit  = !isTeamlead && !!row.trackingRowNum;
                        return (
                          <div
                            key={field}
                            className={`relative rounded-lg border flex flex-col overflow-hidden
                              ${hasIssue ? 'border-amber-200 bg-amber-50' : isZero ? 'border-teal-200 bg-teal-50/60' : 'border-gray-200 bg-gray-50'}
                              ${canEdit && !isEditing ? 'cursor-pointer group' : ''}`}
                            onClick={() => canEdit && !isEditing && setReviewSeedEdit({ field, value: display ?? '' })}
                          >
                            <div className="px-3 pt-2.5 pb-1">
                              <p className="text-gray-500 text-[10px] font-medium leading-tight mb-1">{label}</p>
                              {isEditing ? (
                                <div className="flex flex-col gap-1 py-1" onClick={e => e.stopPropagation()}>
                                  <input
                                    className="form-input text-sm py-1 px-2 w-full"
                                    value={reviewSeedEdit.value}
                                    autoFocus
                                    onChange={e => setReviewSeedEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') { e.preventDefault(); saveSeedField(field, reviewSeedEdit.value); }
                                      if (e.key === 'Escape') { e.preventDefault(); setReviewSeedEdit(null); }
                                    }}
                                    onBlur={() => { if (!seedSavingRef.current) saveSeedField(field, reviewSeedEdit?.value ?? ''); }}
                                  />
                                  {isSeedSaving && <span className="spinner w-3 h-3 border-gray-400 border-t-transparent self-center" />}
                                </div>
                              ) : (
                                <p className={`text-2xl font-bold leading-none py-1
                                  ${hasIssue ? 'text-amber-600' : isZero ? 'text-teal-600' : 'text-gray-400'}`}>
                                  {display ?? '—'}
                                </p>
                              )}
                            </div>
                            {/* Colored bottom bar */}
                            <div className={`h-1 mt-auto
                              ${hasIssue ? 'bg-amber-400' : isZero ? 'bg-teal-400' : 'bg-gray-300'}`} />
                            {/* Edit pencil hint */}
                            {canEdit && !isEditing && (
                              <span className="absolute top-1.5 right-1.5 text-gray-300 group-hover:text-gray-500 text-[10px]">✎</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!row.trackingRowNum && (
                      <p className="mt-1 text-gray-400 italic">No tracking row — values read-only</p>
                    )}
                  </section>

                  {/* AI reason */}
                  {aiReason && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">AI Reason</h3>
                      <p className="text-gray-600 leading-relaxed">{aiReason}</p>
                    </section>
                  )}

                  {/* Checklist */}
                  {checklistEntries.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Checklist</h3>
                      <ul className="space-y-1">
                        {checklistEntries.map(([key, passed]) => (
                          <li key={key} className="flex items-center gap-1.5">
                            <span className={passed ? 'text-green-500' : 'text-red-500'}>{passed ? '✓' : '✗'}</span>
                            <span className={passed ? 'text-gray-600' : 'text-red-600'}>{key}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Failed checks */}
                  {failedChecks.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Failed Checks</h3>
                      <ul className="space-y-1">
                        {failedChecks.map((c, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-red-600">
                            <span className="shrink-0 mt-0.5">•</span><span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Guidelines */}
                  {guidelines.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Guidelines</h3>
                      <ul className="space-y-1">
                        {guidelines.map((g, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-gray-600">
                            <span className="shrink-0 mt-0.5">→</span><span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Suggestion */}
                  {aiSuggestion && (
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Suggestion</h3>
                      <p className="text-gray-600 italic leading-relaxed">{aiSuggestion}</p>
                    </section>
                  )}
                </div>

                {/* Right pane — image */}
                <div className="flex-1 min-w-0 bg-gray-900 flex items-center justify-center overflow-hidden">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt="Submission"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-gray-400 gap-3 h-full">
                      <span className="text-5xl">🖼️</span>
                      <span className="text-sm">No image submitted</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer — action buttons */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-xl">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>← → navigate</span>
                  <span>·</span>
                  <span>Esc close</span>
                </div>
                {!isTeamlead && (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={isReviewSaving || currentStatus === 'PENDING'}
                      onClick={() => reviewChangeStatus('PENDING')}
                      className="px-3 py-1.5 rounded text-xs font-semibold border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {isReviewSaving ? <span className="spinner w-3 h-3 border-yellow-400 border-t-transparent inline-block" /> : '⏸ Pending'}
                    </button>
                    <button
                      disabled={isReviewSaving || currentStatus === 'REJECTED'}
                      onClick={() => reviewChangeStatus('REJECTED')}
                      className="px-3 py-1.5 rounded text-xs font-semibold border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {isReviewSaving ? <span className="spinner w-3 h-3 border-red-400 border-t-transparent inline-block" /> : '✕ Reject'}
                    </button>
                    <button
                      disabled={isReviewSaving || currentStatus === 'APPROVED'}
                      onClick={() => reviewChangeStatus('APPROVED')}
                      className="px-4 py-1.5 rounded text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {isReviewSaving ? <span className="spinner w-3 h-3 border-white border-t-transparent inline-block" /> : '✓ Approve'}
                    </button>
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
        {!isTeamlead && (
          <>
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
          </>
        )}
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
        {filterMonth && filterYear && !isTeamlead && (
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
        {isTeamlead && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            👁️ View only
          </span>
        )}
        <div className="flex-1" />
        {!isTeamlead && (
          <button
            onClick={() => { if (reviewItems.length > 0) setReviewIdx(0); }}
            disabled={reviewItems.length === 0}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title={reviewItems.length > 0 ? `Review ${reviewItems.length} submission(s)` : 'No submissions to review'}
          >
            🔍 Review {reviewItems.length > 0 ? `(${reviewItems.length})` : ''}
          </button>
        )}
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
              {(Object.keys(COL_HEADERS) as ColKey[]).map(col => {
                const isSortable = !['no', 'image', 'actions'].includes(col);
                const isActive = sortCol === col;
                return (
                  <th key={col} className="relative select-none whitespace-nowrap overflow-hidden border-r border-gray-200 last:border-r-0" style={{ width: colWidths[col] }}>
                    <div className="flex items-center gap-1 pr-4 overflow-hidden">
                      {isSortable ? (
                        <button
                          type="button"
                          className={`flex items-center gap-1 truncate text-left hover:text-indigo-600 transition-colors ${isActive ? 'text-indigo-700 font-bold' : ''}`}
                          onClick={() => handleSort(col)}
                          title={`Sort by ${COL_HEADERS[col]}`}
                        >
                          <span className="truncate">{COL_HEADERS[col]}</span>
                          <span className="shrink-0 text-xs">
                            {isActive ? (sortDir === 'asc' ? '▲' : '▼') : <span className="text-gray-300">↕</span>}
                          </span>
                        </button>
                      ) : (
                        <span className="block truncate">{COL_HEADERS[col]}</span>
                      )}
                    </div>
                    {/* Resize handle */}
                    <span
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-indigo-300/40"
                      onMouseDown={e => {
                        e.preventDefault();
                        resizeRef.current = { col, startX: e.clientX, startW: colWidths[col] };
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center text-gray-500 py-8">
                  {isLoading ? 'Loading…' : filterTags.length > 0 || filterProjects !== null || filterMonth || filterYear
                    ? 'No results match the current filters.'
                    : 'No data found.'}
                </td>
              </tr>
            ) : sortedItems.map((row, idx) => (
              <tr
                key={row.submissionId ?? `tr-${row.trackingNo ?? idx}`}
                className={!row.submissionStatus || row.submissionStatus === 'NOT_SUBMITTED' ? 'bg-red-50' : ''}
              >
                {/* No. — not editable */}
                <td className="text-gray-400 font-medium border-r border-gray-200">{idx + 1}</td>

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
                {row.submissionId && !isTeamlead ? (
                  <td className="p-1 border-r border-gray-200">
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
                  <td className="border-r border-gray-200">
                    <span className={statusBadge(row.submissionStatus)}>{statusLabel(row.submissionStatus)}</span>
                  </td>
                )}

                {/* Malware Alerts */}
                {renderCell(row, 'malwareAlerts', numOnly(row.malwareAlerts) ?? '')}

                {/* Compliance Checks */}
                {renderCell(row, 'complianceChecks', numOnly(row.complianceChecks) ?? '')}

                {/* SEED Config */}
                {renderCell(row, 'seedConfiguration', numOnly(row.seedConfiguration) ?? '')}

                {/* OS */}
                {renderCell(row, 'operatingSystem', numOnly(row.operatingSystem) ?? '')}

                {/* Submitted — read-only */}
                <td className="text-gray-400 whitespace-nowrap truncate border-r border-gray-200">
                  {row.submissionDate ? formatDate(row.submissionDate) : <span className="text-red-400">—</span>}
                </td>

                {/* Image thumbnail */}
                <td className="border-r border-gray-200">
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

                {/* Actions */}
                <td>
                  {!isTeamlead && (
                    <div className="flex gap-1">
                      {row.trackingRowNum && (
                        <button onClick={() => deleteMember(row)} className="btn-icon text-amber-700" title="Delete member">🧾</button>
                      )}
                      {row.submissionId && (
                        <button onClick={() => deleteSubmission(row)} className="btn-icon text-red-600" title="Delete submission">🗑️</button>
                      )}
                    </div>
                  )}
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
