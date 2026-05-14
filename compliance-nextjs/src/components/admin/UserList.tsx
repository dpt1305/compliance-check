'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const PAGE_SIZE = 20;

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

interface EditFields {
  status: string;
  project: string;
  name: string;
  email: string;
  serial: string;
  account: string;
  deviceType: string;
  trackingStatus: string;
  malwareAlerts: string;
  complianceChecks: string;
  seedConfiguration: string;
  operatingSystem: string;
  followUpAction: string;
}

interface AddMemberFields {
  project: string;
  name: string;
  email: string;
  serial: string;
  account: string;
  deviceType: string;
  trackingStatus: string;
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

/** Apply month/year mask: strip submission data from entries outside the selected period. */
function applyPeriodMask(entry: UserListEntry, month: number, year: number): UserListEntry | null {
  if (!entry.submissionDate) {
    // No submission — tracking rows stay, submission-only rows are hidden
    return entry.source === 'submission' ? null : entry;
  }
  const d = new Date(entry.submissionDate);
  const inPeriod = d.getMonth() + 1 === month && d.getFullYear() === year;
  if (inPeriod) return entry;
  // Out of period — submission-only rows hidden, tracking rows shown as NOT_SUBMITTED
  if (entry.source === 'submission') return null;
  return {
    ...entry,
    submissionId: undefined,
    submissionStatus: 'NOT_SUBMITTED',
    submissionDate: undefined,
    imageUrl: undefined,
    deviceSerial: undefined,
    deviceName: undefined,
    // Clear SEED values — they belong to the other period's submission
    malwareAlerts: '',
    complianceChecks: '',
    seedConfiguration: '',
    operatingSystem: '',
  };
}

export default function UserList() {
  const [data, setData] = useState<UserListEntry[]>([]);
  const [filtered, setFiltered] = useState<UserListEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filters — default to current month/year in GMT+7
  const { month: nowMonth, year: nowYear } = gmt7Now();
  const [filterText,   setFilterText]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth,  setFilterMonth]  = useState(String(nowMonth));
  const [filterYear,   setFilterYear]   = useState(String(nowYear));

  // Edit modal
  const [editRow, setEditRow]       = useState<UserListEntry | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({
    status: '', project: '', name: '', email: '', serial: '', account: '', deviceType: '', trackingStatus: '',
    malwareAlerts: '', complianceChecks: '', seedConfiguration: '', operatingSystem: '', followUpAction: '',
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [imgZoom, setImgZoom]       = useState(1);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [addMemberFields, setAddMemberFields] = useState<AddMemberFields>({
    project: '',
    name: '',
    email: '',
    serial: '',
    account: '',
    deviceType: '',
    trackingStatus: 'PENDING',
  });

  // Non-passive wheel listener for zoom (must be attached via useEffect — React onWheel is passive)
  useEffect(() => {
    const el = imgContainerRef.current;
    if (!el || !editRow) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setImgZoom(z => {
        // ctrlKey = pinch gesture on trackpad; deltaY is small (−3 to 3)
        // plain wheel = mouse scroll wheel; deltaY is large (100+)
        const delta = e.ctrlKey
          ? -e.deltaY * 0.02          // pinch: smooth continuous
          : e.deltaY < 0 ? 0.15 : -0.15; // mouse wheel: discrete steps
        return Math.min(Math.max(z + delta, 0.25), 4);
      });
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [editRow]);

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/user-list', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      const d = await res.json() as UserListEntry[];
      setData(d);
      setVisibleCount(PAGE_SIZE);
      setShowAll(false);
    } catch {
      showToast('Failed to load user list', false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter + period mask
  useEffect(() => {
    const q     = filterText.trim().toLowerCase();
    const month = parseInt(filterMonth, 10);
    const year  = parseInt(filterYear,  10);
    const hasPeriod = !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;

    // 1. Apply month/year mask
    let masked: UserListEntry[] = hasPeriod
      ? (data.map(e => applyPeriodMask(e, month, year)).filter(Boolean) as UserListEntry[])
      : data;

    // 2. Text search
    if (q) {
      masked = masked.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.account        ?? '').toLowerCase().includes(q) ||
        (r.trackingAccount ?? '').toLowerCase().includes(q) ||
        (r.email          ?? '').toLowerCase().includes(q) ||
        (r.serial         ?? '').toLowerCase().includes(q) ||
        (r.project        ?? '').toLowerCase().includes(q) ||
        (r.submissionType ?? '').toLowerCase().includes(q)
      );
    }

    // 3. Status filter (works on possibly-masked status)
    if (filterStatus) {
      masked = masked.filter(r => (r.submissionStatus ?? 'NOT_SUBMITTED') === filterStatus);
    }

    setFiltered(masked);
    setVisibleCount(PAGE_SIZE);
    setShowAll(false);
  }, [data, filterText, filterStatus, filterMonth, filterYear]);

  // Infinite scroll
  useEffect(() => {
    if (showAll) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length)); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, showAll]);

  const displayed = showAll ? filtered : filtered.slice(0, visibleCount);
  const hasMore   = !showAll && visibleCount < filtered.length;

  // ── Edit modal ──────────────────────────────────────────────────────────────
  function openEdit(row: UserListEntry) {
    setEditRow(row);
    setImgZoom(1);
    setEditFields({
      status:           row.submissionStatus && row.submissionStatus !== 'NOT_SUBMITTED' ? row.submissionStatus : 'PENDING',
      project:          row.project ?? '',
      name:             row.name ?? '',
      email:            row.email ?? '',
      serial:           row.serial ?? '',
      account:          row.trackingAccount ?? row.account ?? '',
      deviceType:       row.deviceType ?? row.submissionType ?? '',
      trackingStatus:   row.trackingStatus   ?? '',
      malwareAlerts:    row.malwareAlerts    ?? '',
      complianceChecks: row.complianceChecks ?? '',
      seedConfiguration:row.seedConfiguration ?? '',
      operatingSystem:  row.operatingSystem  ?? '',
      followUpAction:   row.followUpAction   ?? '',
    });
  }

  async function saveEdit() {
    if (!editRow) return;
    if (editRow.trackingRowNum && !editFields.name.trim()) {
      showToast('Name is required', false);
      return;
    }
    setIsSavingEdit(true);
    try {
      const jobs: Promise<Response>[] = [];

      // 1. Update submission status
      if (editRow.submissionId && editFields.status && editFields.status !== 'NOT_SUBMITTED') {
        jobs.push(fetch(`/api/admin/submissions/${editRow.submissionId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status: editFields.status }),
        }));
      }

      // 2. Update tracking.xlsx row
      if (editRow.trackingRowNum) {
        jobs.push(fetch('/api/admin/user-list', {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            rowNum:         editRow.trackingRowNum,
            project:        editFields.project,
            name:           editFields.name,
            email:          editFields.email,
            serial:         editFields.serial,
            account:        editFields.account,
            deviceType:     editFields.deviceType,
            trackingStatus: editFields.trackingStatus,
          }),
        }));

        jobs.push(fetch('/api/admin/tracking', {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            rowNum:           editRow.trackingRowNum,
            malwareAlerts:    editFields.malwareAlerts,
            complianceChecks: editFields.complianceChecks,
            seedConfiguration:editFields.seedConfiguration,
            operatingSystem:  editFields.operatingSystem,
            followUpAction:   editFields.followUpAction,
          }),
        }));
      }

      const results = await Promise.all(jobs);
      if (results.some(r => !r.ok)) throw new Error('One or more updates failed');

      // Reflect in local state
      setData(prev => prev.map(r => {
        if (r !== editRow &&
            !(r.submissionId && r.submissionId === editRow.submissionId) &&
            !(r.trackingRowNum && r.trackingRowNum === editRow.trackingRowNum)) return r;
        return {
          ...r,
          submissionStatus: editRow.submissionId ? editFields.status : r.submissionStatus,
          project:          editFields.project,
          name:             editFields.name,
          email:            editFields.email,
          serial:           editFields.serial,
          trackingAccount:  editFields.account,
          deviceType:       editFields.deviceType,
          malwareAlerts:    editFields.malwareAlerts,
          complianceChecks: editFields.complianceChecks,
          seedConfiguration:editFields.seedConfiguration,
          operatingSystem:  editFields.operatingSystem,
          followUpAction:   editFields.followUpAction,
          trackingStatus:   editFields.trackingStatus,
        };
      }));

      setEditRow(null);
      showToast('Updated successfully', true);
    } catch {
      showToast('Update failed', false);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function deleteSubmission(entry: UserListEntry) {
    if (!entry.submissionId) return;
    if (!confirm(`Delete submission for "${entry.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/submissions/${entry.submissionId}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      setData(prev => prev.map(r =>
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
      trackingStatus: 'PENDING',
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
      const year   = parseInt(filterYear,  10);
      const hasP   = !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && year > 0;
      const url    = hasP
        ? `/api/admin/tracking?month=${month}&year=${year}`
        : '/api/admin/tracking';

      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json() as { message?: string };
        showToast(d.message ?? 'Tracking file not found', false);
        return;
      }
      const blob      = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a         = document.createElement('a');
      a.href     = objectUrl;
      a.download = hasP
        ? `tracking_${MONTH_NAMES[month - 1]}_${year}.zip`
        : 'tracking.xlsx';
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
    const count = filtered.filter(r => r.submissionStatus && r.submissionStatus !== 'NOT_SUBMITTED').length;

    const confirmed = confirm(
      `Delete ALL submissions for ${monthName} ${year}?\n\n` +
      `This will permanently remove ${count} submission record(s) and their associated image files.\n\n` +
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
  const totalCount        = filtered.length;
  const approvedCount     = filtered.filter(r => r.submissionStatus === 'APPROVED').length;
  const submittedCount    = filtered.filter(r => r.submissionStatus && r.submissionStatus !== 'NOT_SUBMITTED').length;
  const notSubmittedCount = filtered.filter(r => !r.submissionStatus || r.submissionStatus === 'NOT_SUBMITTED').length;

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
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowAddMemberModal(false)}>
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
                { key: 'trackingStatus', label: 'Tracking Status' },
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

      {/* Edit modal */}
      {editRow && (() => {
        const imgUrl = relativeImageUrl(editRow.imageUrl);
        return (
          <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditRow(null)}>
            <div
              className="bg-white rounded-lg shadow-2xl flex flex-col w-full max-w-5xl max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
                <h2 className="font-semibold text-gray-900 truncate">{editRow.name}{editRow.email ? ` — ${editRow.email}` : ''}</h2>
                <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none ml-4">×</button>
              </div>

              {/* Body: left = form, right = image viewer */}
              <div className="flex flex-1 min-h-0">

                {/* Left: form fields */}
                <div className="w-80 shrink-0 border-r border-gray-100 flex flex-col">
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {editRow.submissionId && (
                      <div className="form-field">
                        <label className="form-label">Submission Status</label>
                        <select className="form-select" value={editFields.status} onChange={e => setEditFields(f => ({ ...f, status: e.target.value }))}>
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    {[
                      { key: 'project',        label: 'Project' },
                      { key: 'name',           label: 'Name *' },
                      { key: 'email',          label: 'Email' },
                      { key: 'serial',         label: 'Serial' },
                      { key: 'account',        label: 'Account' },
                      { key: 'deviceType',     label: 'Type' },
                      { key: 'trackingStatus', label: 'Tracking Status' },
                    ].map(({ key, label }) => (
                      <div key={key} className="form-field">
                        <label className="form-label">{label}</label>
                        <input
                          className="form-input"
                          value={editFields[key as keyof EditFields]}
                          onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
                          disabled={!editRow.trackingRowNum}
                        />
                      </div>
                    ))}
                    {[
                      { key: 'malwareAlerts',     label: 'Malware Alerts'    },
                      { key: 'complianceChecks',  label: 'Compliance Checks' },
                      { key: 'seedConfiguration', label: 'SEED Configuration'},
                      { key: 'operatingSystem',   label: 'Operating System'  },
                      { key: 'followUpAction',    label: 'Follow Up Action'  },
                    ].map(({ key, label }) => (
                      <div key={key} className="form-field">
                        <label className="form-label">{label}</label>
                        <input
                          className="form-input"
                          value={editFields[key as keyof EditFields]}
                          onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
                          disabled={!editRow.trackingRowNum && key !== 'status'}
                        />
                      </div>
                    ))}
                    {!editRow.trackingRowNum && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
                        No tracking row — tracking fields cannot be edited.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
                    <button onClick={() => setEditRow(null)} className="btn-secondary">Cancel</button>
                    <button onClick={saveEdit} disabled={isSavingEdit} className="btn-primary flex items-center gap-2">
                      {isSavingEdit && <span className="spinner w-4 h-4 border-white border-t-transparent"></span>}
                      Save
                    </button>
                  </div>
                </div>

                {/* Right: image viewer */}
                <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
                  {/* Image toolbar */}
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-white shrink-0 flex-wrap">
                    <button
                      onClick={() => setImgZoom(z => Math.min(z + 0.25, 4))}
                      className="btn-icon text-gray-600" title="Zoom in"
                    >🔍+</button>
                    <button
                      onClick={() => setImgZoom(z => Math.max(z - 0.25, 0.25))}
                      className="btn-icon text-gray-600" title="Zoom out"
                    >🔍−</button>
                    <button
                      onClick={() => setImgZoom(1)}
                      className="btn-icon text-gray-600 text-xs font-mono" title="Reset zoom"
                    >{Math.round(imgZoom * 100)}%</button>
                    <div className="flex-1" />
                    {imgUrl && (
                      <>
                        <a
                          href={imgUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-icon text-primary-600" title="Open in new tab"
                        >↗</a>
                        <a
                          href={`${imgUrl}?dl=1`}
                          download
                          className="btn-icon text-gray-600" title="Download image"
                        >⬇</a>
                      </>
                    )}
                  </div>

                  {/* Image area — wheel events handled by non-passive listener */}
                  <div ref={imgContainerRef} className="flex-1 overflow-auto flex items-start justify-center p-4" style={{ cursor: 'zoom-in' }}>
                    {imgUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={imgUrl}
                        alt="submission"
                        style={{ transform: `scale(${imgZoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
                        className="max-w-full rounded shadow"
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 gap-2 mt-16">
                        <span className="text-4xl">🖼️</span>
                        <span className="text-sm">No image submitted</span>
                      </div>
                    )}
                  </div>
                </div>
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

      {/* Toolbar row 1: search + status + period */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input
          className="form-input max-w-[220px]"
          placeholder="Search name, email, serial…"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        <select className="form-select w-40" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="APPROVED">Approved</option>
          <option value="PENDING">Pending</option>
          <option value="REJECTED">Rejected</option>
          <option value="NOT_SUBMITTED">Not Submitted</option>
        </select>

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
            filterMonth && filterYear
              ? `Download ZIP: tracking + images for ${MONTH_NAMES[parseInt(filterMonth) - 1]} ${filterYear}`
              : 'Download tracking.xlsx'
          }
        >
          {isDownloading
            ? <><span className="spinner w-4 h-4 border-gray-400 border-t-transparent"></span> Downloading…</>
            : <>📥 {filterMonth && filterYear ? `Download ZIP (${MONTH_NAMES[parseInt(filterMonth) - 1]} ${filterYear})` : 'Download Tracking'}</>}
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

      {/* Count + show-all toggle */}
      <div className="flex items-center justify-between mb-2 text-sm text-gray-500">
        <span>
          Showing <strong>{displayed.length}</strong> of <strong>{filtered.length}</strong>
          {filtered.length !== data.length && ` (filtered from ${data.length})`}
        </span>
        {filtered.length > PAGE_SIZE && (
          <button
            onClick={() => { setShowAll(v => !v); if (showAll) setVisibleCount(PAGE_SIZE); }}
            className="text-primary-600 hover:underline text-sm font-medium"
          >
            {showAll ? `Show first ${PAGE_SIZE}` : `Show all ${filtered.length}`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th>No.</th>
              <th>Project</th>
              <th>Name</th>
              <th>Account</th>
              <th>Email</th>
              <th>Serial</th>
              <th>Type</th>
              <th>Status</th>
              <th className="whitespace-nowrap">Malware Alerts</th>
              <th className="whitespace-nowrap">Compliance Checks</th>
              <th className="whitespace-nowrap">SEED Config</th>
              <th className="whitespace-nowrap">OS</th>
              <th className="whitespace-nowrap">Submitted</th>
              <th>Image</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center text-gray-500 py-8">
                  {isLoading ? 'Loading…' : filterText || filterStatus || filterMonth || filterYear
                    ? 'No results match the current filters.'
                    : 'No data found.'}
                </td>
              </tr>
            ) : displayed.map((row, idx) => (
              <tr
                key={row.submissionId ?? `tr-${row.trackingNo ?? idx}`}
                className={!row.submissionStatus || row.submissionStatus === 'NOT_SUBMITTED' ? 'bg-red-50' : ''}
              >
                <td className="text-gray-400">{row.trackingNo ?? '—'}</td>
                <td className="text-gray-500 whitespace-nowrap">{row.project ?? '—'}</td>
                <td className="font-medium whitespace-nowrap">{row.name}</td>
                <td className="text-gray-500 whitespace-nowrap">{row.trackingAccount || row.account || '—'}</td>
                <td className="text-gray-500 max-w-[140px] truncate" title={row.email}>{row.email ?? '—'}</td>
                <td className="font-mono text-gray-600 whitespace-nowrap">{row.serial ?? '—'}</td>
                <td className="capitalize whitespace-nowrap">{row.deviceType || row.submissionType || '—'}</td>
                <td>
                  <span className={statusBadge(row.submissionStatus)}>
                    {statusLabel(row.submissionStatus)}
                  </span>
                </td>
                <td>{dash(row.malwareAlerts)}</td>
                <td>{dash(row.complianceChecks)}</td>
                <td>{dash(row.seedConfiguration)}</td>
                <td>{dash(row.operatingSystem)}</td>
                <td className="text-gray-400 whitespace-nowrap">
                  {row.submissionDate
                    ? formatDate(row.submissionDate)
                    : <span className="text-red-400">—</span>}
                </td>
                <td>
                  {(() => {
                    const thumb = relativeImageUrl(row.imageUrl);
                    return thumb ? (
                      <button onClick={() => openEdit(row)} title="View image" className="block">
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
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(row)} className="btn-icon text-primary-600" title="Edit">✏️</button>
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

      {/* Scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center items-center py-4 text-sm text-gray-400">
          <span className="spinner w-4 h-4 border-gray-300 border-t-primary-500 mr-2"></span>
          Loading more…
        </div>
      )}

      {!hasMore && filtered.length > 0 && (
        <p className="text-center text-xs text-gray-400 py-3">
          All {filtered.length} {filtered.length === 1 ? 'record' : 'records'} shown
        </p>
      )}
    </div>
  );
}
