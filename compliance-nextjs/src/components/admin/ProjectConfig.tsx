'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ProjectConfig, ConfigVersionSummary, FormField, SubmissionType, OutputColumn } from '@/lib/db/mongo/config-repo';

const EMPTY_FIELD: FormField = { key: '', label: '', type: 'text', required: false };
const EMPTY_TYPE: SubmissionType = {
  key: '', label: '', description: '', aiPrompt: '', aiExtractFields: [],
  minConfidence: 100, checklistItems: [],
};
const EMPTY_COLUMN: OutputColumn = {
  key: '', label: '', source: 'form_field', format: 'text',
  sortable: true, excelVisible: true,
};

function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }
function authHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...extra };
}

export default function ProjectConfig() {
  const [activeTab, setActiveTab] = useState<'general' | 'fields' | 'types' | 'columns' | 'preview' | 'versions'>('general');
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [versions, setVersions] = useState<ConfigVersionSummary[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [publishNote, setPublishNote] = useState('');
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [revertVersion, setRevertVersion] = useState<number | null>(null);
  const [revertNote, setRevertNote] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [currentVersionStatus, setCurrentVersionStatus] = useState<'draft' | 'published' | 'archived' | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pubRes, verRes, draftRes] = await Promise.all([
        fetch('/api/admin/config', { headers: authHeaders() }),
        fetch('/api/admin/config/versions', { headers: authHeaders() }),
        fetch('/api/admin/config?draft=true', { headers: authHeaders() }),
      ]);

      let pubConfig: ProjectConfig | null = null;
      let draftExists = false;

      if (draftRes.ok) {
        const draft = await draftRes.json() as ProjectConfig;
        pubConfig = draft;
        draftExists = true;
      } else if (pubRes.ok) {
        pubConfig = await pubRes.json() as ProjectConfig;
      }

      if (verRes.ok) {
        const vs = await verRes.json() as ConfigVersionSummary[];
        setVersions(vs);

        // If a version was selected, load it
        if (selectedVersion !== null) {
          const verRes2 = await fetch(`/api/admin/config?version=${selectedVersion}`, { headers: authHeaders() });
          if (verRes2.ok) {
            setConfig(await verRes2.json() as ProjectConfig);
            const matched = vs.find(v => v.version === selectedVersion);
            setCurrentVersionStatus(matched?.status ?? null);
            setHasDraft(matched?.status === 'draft');
            setIsLoading(false);
            return;
          }
        }
      }

      if (pubConfig) {
        setConfig(pubConfig);
        setHasDraft(draftExists);
        setCurrentVersionStatus(draftExists ? 'draft' : 'published');
      }
    } catch {
      showToast('Failed to load config', false);
    } finally {
      setIsLoading(false);
    }
  }, [selectedVersion]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function handleCreateDraft() {
    if (!confirm('This will archive the current published config and create a draft. Continue?')) return;
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ createDraft: true }),
      });
      if (!res.ok) throw new Error();
      showToast('Draft created', true);
      await loadConfig();
    } catch {
      showToast('Failed to create draft', false);
    }
  }

  async function handleSaveDraft() {
    if (!config) return;
    setIsSaving(true);
    try {
      // Validate first
      const valRes = await fetch('/api/admin/config/validate', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          formFields: config.formFields,
          submissionTypes: config.submissionTypes,
          outputColumns: config.outputColumns,
        }),
      });
      const valData = await valRes.json() as { valid: boolean; errors: string[] };
      if (!valData.valid) {
        showToast(`Validation failed: ${valData.errors[0]}`, false);
        return;
      }

      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      showToast('Draft saved', true);
    } catch {
      showToast('Failed to save draft', false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ note: publishNote }),
      });
      if (!res.ok) throw new Error();
      setShowPublishDialog(false);
      setPublishNote('');
      showToast('Config published', true);
      setSelectedVersion(null);
      setCurrentVersionStatus(null);
      await loadConfig();
    } catch {
      showToast('Failed to publish', false);
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleRevert(version: number) {
    try {
      const res = await fetch('/api/admin/config/versions', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ version, note: revertNote }),
      });
      if (!res.ok) throw new Error();
      setShowRevertDialog(false);
      setRevertVersion(null);
      setRevertNote('');
      showToast(`Reverted to v${version}`, true);
      setSelectedVersion(null);
      setCurrentVersionStatus(null);
      await loadConfig();
    } catch {
      showToast('Failed to revert', false);
    }
  }

  async function handleDeleteVersion(version: number) {
    if (!confirm(`Delete version ${version}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/config/versions?version=${version}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      showToast(`Deleted v${version}`, true);
      setSelectedVersion(null);
      setCurrentVersionStatus(null);
      await loadConfig();
    } catch {
      showToast('Failed to delete version', false);
    }
  }

  async function handleCloneVersion(version: number) {
    if (!confirm(`Clone v${version} into a new draft?`)) return;
    setIsCloning(true);
    try {
      const res = await fetch('/api/admin/config/versions', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'clone', version }),
      });
      if (!res.ok) throw new Error();
      showToast(`Cloned v${version} to draft`, true);
      setSelectedVersion(null);
      setCurrentVersionStatus(null);
      await loadConfig();
    } catch {
      showToast('Failed to clone version', false);
    } finally {
      setIsCloning(false);
    }
  }

  function handleVersionSelect(version: number) {
    setSelectedVersion(version || null);
    if (version) {
      setIsLoading(true);
      fetch(`/api/admin/config?version=${version}`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          setConfig(data as ProjectConfig);
          const matched = versions.find(v => v.version === version);
          setCurrentVersionStatus(matched?.status ?? 'archived');
          setHasDraft(matched?.status === 'draft');
          setIsLoading(false);
        })
        .catch(() => {
          showToast('Failed to load version', false);
          setIsLoading(false);
        });
    } else {
      loadConfig();
    }
  }

  function updateConfig(updater: (c: ProjectConfig) => ProjectConfig) {
    if (!config) return;
    setConfig(updater(config));
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <span className="spinner w-6 h-6 border-gray-400 border-t-transparent"></span>
        <span className="ml-3 text-gray-500">Loading config...</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-4">No config found. Please ensure MongoDB is configured.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Draft indicator */}
      {hasDraft && currentVersionStatus === 'draft' && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center justify-between">
          <span><strong>Draft Mode</strong> — You are editing a draft. Changes are not live until published.</span>
          <button onClick={() => setShowPublishDialog(true)} className="btn-primary text-sm px-3 py-1">Publish</button>
        </div>
      )}

      {/* Version indicator */}
      {selectedVersion !== null && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between ${
          currentVersionStatus === 'published'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-gray-50 border border-gray-200 text-gray-700'
        }`}>
          <span>
            Viewing <strong>v{selectedVersion}</strong> ({currentVersionStatus})
            {currentVersionStatus !== 'draft' && ' — read-only'}
          </span>
          <button onClick={() => { setSelectedVersion(null); setCurrentVersionStatus(null); loadConfig(); }} className="btn-secondary text-xs px-2 py-1">
            Back to Current
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {!hasDraft && currentVersionStatus !== 'draft' && (
            <button onClick={handleCreateDraft} className="btn-secondary text-sm">Edit Config</button>
          )}
          {hasDraft && currentVersionStatus === 'draft' && (
            <button onClick={handleSaveDraft} disabled={isSaving} className="btn-primary text-sm flex items-center gap-2">
              {isSaving && <span className="spinner w-3 h-3 border-white border-t-transparent"></span>}
              Save Draft
            </button>
          )}
          {currentVersionStatus === 'published' && (
            <span className="text-sm text-gray-500">Published version — read-only</span>
          )}
          {currentVersionStatus === 'archived' && (
            <span className="text-sm text-gray-500">Archived version — read-only</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && currentVersionStatus === 'draft' && (
            <button onClick={() => setShowPublishDialog(true)} disabled={isPublishing} className="btn-primary text-sm flex items-center gap-2">
              {isPublishing && <span className="spinner w-4 h-4 border-white border-t-transparent"></span>}
              Publish
            </button>
          )}
          <select
            className="form-select text-sm w-40"
            value={selectedVersion ?? ''}
            onChange={e => handleVersionSelect(Number(e.target.value))}
          >
            <option value="">Current</option>
            {versions.map(v => (
              <option key={v.version} value={v.version}>v{v.version} ({v.status})</option>
            ))}
          </select>
          {selectedVersion !== null && (
            <button
              onClick={() => handleCloneVersion(selectedVersion)}
              disabled={isCloning}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {isCloning && <span className="spinner w-3 h-3 border-gray-400 border-t-transparent"></span>}
              Clone to Draft
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { key: 'general', label: 'General', icon: '⚙️' },
          { key: 'fields', label: 'Form Fields', icon: '📝' },
          { key: 'types', label: 'Submission Types', icon: '📋' },
          { key: 'columns', label: 'Output Columns', icon: '📊' },
          { key: 'preview', label: 'Preview', icon: '👁️' },
          { key: 'versions', label: 'Versions', icon: '📦' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'general' && (
        <GeneralTab config={config} updateConfig={updateConfig} hasDraft={hasDraft} />
      )}
      {activeTab === 'fields' && (
        <FieldsTab config={config} updateConfig={updateConfig} hasDraft={hasDraft} />
      )}
      {activeTab === 'types' && (
        <TypesTab config={config} updateConfig={updateConfig} hasDraft={hasDraft} />
      )}
      {activeTab === 'columns' && (
        <ColumnsTab config={config} updateConfig={updateConfig} hasDraft={hasDraft} />
      )}
      {activeTab === 'preview' && (
        <PreviewTab config={config} />
      )}
      {activeTab === 'versions' && (
        <VersionsTab
          versions={versions}
          onRevert={(v) => { setRevertVersion(v); setShowRevertDialog(true); }}
          onDelete={handleDeleteVersion}
          onClone={handleCloneVersion}
        />
      )}

      {/* Publish dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPublishDialog(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Publish Config</h2>
              <button onClick={() => setShowPublishDialog(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">This will publish the current draft and make it live. The previous published version will be archived.</p>
              <div className="form-field">
                <label className="form-label">Version Note</label>
                <textarea
                  className="form-input"
                  value={publishNote}
                  onChange={e => setPublishNote(e.target.value)}
                  placeholder="e.g. Added leave request type"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setShowPublishDialog(false)} className="btn-secondary">Cancel</button>
              <button onClick={handlePublish} disabled={isPublishing} className="btn-primary flex items-center gap-2">
                {isPublishing && <span className="spinner w-4 h-4 border-white border-t-transparent"></span>}
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert dialog */}
      {showRevertDialog && revertVersion !== null && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowRevertDialog(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Revert to v{revertVersion}</h2>
              <button onClick={() => setShowRevertDialog(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">This will create a new published version from v{revertVersion}. The current published version will be archived.</p>
              <div className="form-field">
                <label className="form-label">Version Note</label>
                <textarea
                  className="form-input"
                  value={revertNote}
                  onChange={e => setRevertNote(e.target.value)}
                  placeholder={`e.g. Reverted to v${revertVersion}`}
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setShowRevertDialog(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleRevert(revertVersion)} className="btn-primary">Revert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab Components ─────────────────────────────────────────────────────────────

function GeneralTab({ config, updateConfig, hasDraft }: { config: ProjectConfig; updateConfig: any; hasDraft: boolean }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="form-field">
        <label className="form-label">Project Name</label>
        <input
          className="form-input"
          value={config.name}
          onChange={e => updateConfig((c: ProjectConfig) => ({ ...c, name: e.target.value }))}
          disabled={!hasDraft}
        />
      </div>
      <div className="form-field">
        <label className="form-label">Description</label>
        <textarea
          className="form-input"
          value={config.description}
          onChange={e => updateConfig((c: ProjectConfig) => ({ ...c, description: e.target.value }))}
          disabled={!hasDraft}
          rows={3}
        />
      </div>
    </div>
  );
}

function FieldsTab({ config, updateConfig, hasDraft }: { config: ProjectConfig; updateConfig: any; hasDraft: boolean }) {
  function addField() {
    updateConfig((c: ProjectConfig) => ({ ...c, formFields: [...c.formFields, { ...EMPTY_FIELD, key: `field_${Date.now()}` }] }));
  }
  function removeField(idx: number) {
    updateConfig((c: ProjectConfig) => ({ ...c, formFields: c.formFields.filter((_: any, i: number) => i !== idx) }));
  }
  function updateField(idx: number, field: FormField) {
    updateConfig((c: ProjectConfig) => {
      const fields = [...c.formFields];
      fields[idx] = field;
      return { ...c, formFields: fields };
    });
  }

  return (
    <div className="space-y-4">
      {!hasDraft && <p className="text-sm text-gray-500">Create a draft to edit form fields.</p>}
      {config.formFields.map((field, idx) => (
        <div key={idx} className="card p-4 space-y-3 relative">
          {!hasDraft || <button onClick={() => removeField(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg">×</button>}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="form-field md:col-span-1">
              <label className="form-label text-xs">Key</label>
              <input className="form-input text-sm" value={field.key} onChange={e => updateField(idx, { ...field, key: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field md:col-span-2">
              <label className="form-label text-xs">Label</label>
              <input className="form-input text-sm" value={field.label} onChange={e => updateField(idx, { ...field, label: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Type</label>
              <select className="form-select text-sm" value={field.type} onChange={e => updateField(idx, { ...field, type: e.target.value as FormField['type'] })} disabled={!hasDraft}>
                {['text', 'number', 'email', 'textarea', 'dropdown', 'date', 'datetime', 'file', 'file-multiple'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-field flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={field.required} onChange={e => updateField(idx, { ...field, required: e.target.checked })} disabled={!hasDraft} />
                Required
              </label>
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Placeholder</label>
              <input className="form-input text-sm" value={field.placeholder || ''} onChange={e => updateField(idx, { ...field, placeholder: e.target.value })} disabled={!hasDraft} />
            </div>
          </div>
          {field.type === 'dropdown' && (
            <div className="form-field">
              <label className="form-label text-xs">Options (one per line: label=value)</label>
              <textarea
                className="form-input text-sm font-mono"
                value={(field.options || []).map(o => `${o.label}=${o.value}`).join('\n')}
                onChange={e => {
                  const opts = e.target.value.split('\n').filter(l => l.includes('=')).map(l => {
                    const eq = l.indexOf('=');
                    return { label: l.slice(0, eq).trim(), value: l.slice(eq + 1).trim() };
                  });
                  updateField(idx, { ...field, options: opts });
                }}
                disabled={!hasDraft}
                rows={Math.max(2, (field.options || []).length)}
              />
            </div>
          )}
          {field.type === 'file' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field">
                <label className="form-label text-xs">Accept</label>
                <input className="form-input text-sm" value={field.accept || ''} onChange={e => updateField(idx, { ...field, accept: e.target.value })} disabled={!hasDraft} placeholder=".jpg,.png,.pdf" />
              </div>
              <div className="form-field">
                <label className="form-label text-xs">Max Size (MB)</label>
                <input className="form-input text-sm" type="number" value={field.maxFileSizeMb || 10} onChange={e => updateField(idx, { ...field, maxFileSizeMb: Number(e.target.value) })} disabled={!hasDraft} />
              </div>
            </div>
          )}
          <div className="form-field">
            <label className="form-label text-xs">Help Text</label>
            <input className="form-input text-sm" value={field.helpText || ''} onChange={e => updateField(idx, { ...field, helpText: e.target.value })} disabled={!hasDraft} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="form-field">
              <label className="form-label text-xs">Show when (field)</label>
              <select className="form-select text-sm" value={field.visibleWhen?.field || ''} onChange={e => updateField(idx, { ...field, visibleWhen: e.target.value ? { field: e.target.value, operator: field.visibleWhen?.operator || 'equals', value: field.visibleWhen?.value || '' } : undefined })} disabled={!hasDraft}>
                <option value="">Always show</option>
                {config.formFields.filter((_: any, i: number) => i !== idx).map(f => (
                  <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Operator</label>
              <select className="form-select text-sm" value={field.visibleWhen?.operator || 'equals'} onChange={e => updateField(idx, { ...field, visibleWhen: field.visibleWhen ? { ...field.visibleWhen, operator: e.target.value as any } : undefined })} disabled={!hasDraft || !field.visibleWhen?.field}>
                {['equals', 'not_equals', 'contains', 'is_empty', 'is_not_empty'].map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Value</label>
              <input className="form-input text-sm" value={field.visibleWhen?.value || ''} onChange={e => updateField(idx, { ...field, visibleWhen: field.visibleWhen ? { ...field.visibleWhen, value: e.target.value } : undefined })} disabled={!hasDraft || !field.visibleWhen?.field} />
            </div>
          </div>
        </div>
      ))}
      {hasDraft && (
        <button onClick={addField} className="btn-secondary text-sm">+ Add Field</button>
      )}
    </div>
  );
}

function TypesTab({ config, updateConfig, hasDraft }: { config: ProjectConfig; updateConfig: any; hasDraft: boolean }) {
  function addType() {
    updateConfig((c: ProjectConfig) => ({ ...c, submissionTypes: [...c.submissionTypes, { ...EMPTY_TYPE, key: `type_${Date.now()}` }] }));
  }
  function removeType(idx: number) {
    updateConfig((c: ProjectConfig) => ({ ...c, submissionTypes: c.submissionTypes.filter((_: any, i: number) => i !== idx) }));
  }
  function updateType(idx: number, type: SubmissionType) {
    updateConfig((c: ProjectConfig) => {
      const types = [...c.submissionTypes];
      types[idx] = type;
      return { ...c, submissionTypes: types };
    });
  }

  return (
    <div className="space-y-6">
      {!hasDraft && <p className="text-sm text-gray-500">Create a draft to edit submission types.</p>}
      {config.submissionTypes.map((type, idx) => (
        <div key={idx} className="card p-4 space-y-3 relative">
          {!hasDraft || <button onClick={() => removeType(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg">×</button>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="form-field">
              <label className="form-label text-xs">Key</label>
              <input className="form-input text-sm" value={type.key} onChange={e => updateType(idx, { ...type, key: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Label</label>
              <input className="form-input text-sm" value={type.label} onChange={e => updateType(idx, { ...type, label: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Description</label>
              <input className="form-input text-sm" value={type.description} onChange={e => updateType(idx, { ...type, description: e.target.value })} disabled={!hasDraft} />
            </div>
          </div>
          <div className="form-field">
            <label className="form-label text-xs">AI Prompt</label>
            <textarea
              className="form-input text-sm font-mono"
              value={type.aiPrompt}
              onChange={e => updateType(idx, { ...type, aiPrompt: e.target.value })}
              disabled={!hasDraft}
              rows={8}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-field">
              <label className="form-label text-xs">Min Confidence</label>
              <input className="form-input text-sm" type="number" value={type.minConfidence} onChange={e => updateType(idx, { ...type, minConfidence: Number(e.target.value) })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Sample Image URL</label>
              <input className="form-input text-sm" value={type.sampleImageUrl || ''} onChange={e => updateType(idx, { ...type, sampleImageUrl: e.target.value })} disabled={!hasDraft} />
            </div>
          </div>

          {/* Extract fields */}
          <div className="space-y-2">
            <label className="form-label text-xs">Extract Fields</label>
            {type.aiExtractFields.map((ef, ei) => (
              <div key={ei} className="grid grid-cols-4 gap-2">
                <input className="form-input text-xs" value={ef.key} onChange={e => { const afs = [...type.aiExtractFields]; afs[ei] = { ...ef, key: e.target.value }; updateType(idx, { ...type, aiExtractFields: afs }); }} disabled={!hasDraft} placeholder="key" />
                <input className="form-input text-xs" value={ef.label} onChange={e => { const afs = [...type.aiExtractFields]; afs[ei] = { ...ef, label: e.target.value }; updateType(idx, { ...type, aiExtractFields: afs }); }} disabled={!hasDraft} placeholder="label" />
                <input className="form-input text-xs" value={ef.instruction} onChange={e => { const afs = [...type.aiExtractFields]; afs[ei] = { ...ef, instruction: e.target.value }; updateType(idx, { ...type, aiExtractFields: afs }); }} disabled={!hasDraft} placeholder="instruction" />
                <div className="flex gap-1">
                  <select className="form-select text-xs flex-1" value={ef.type} onChange={e => { const afs = [...type.aiExtractFields]; afs[ei] = { ...ef, type: e.target.value as any }; updateType(idx, { ...type, aiExtractFields: afs }); }} disabled={!hasDraft}>
                    <option value="text">text</option>
                    <option value="number">number</option>
                    <option value="date">date</option>
                  </select>
                  {hasDraft && <button onClick={() => { const afs = type.aiExtractFields.filter((_: any, i: number) => i !== ei); updateType(idx, { ...type, aiExtractFields: afs }); }} className="text-red-400 hover:text-red-600">×</button>}
                </div>
              </div>
            ))}
            {hasDraft && (
              <button onClick={() => updateType(idx, { ...type, aiExtractFields: [...type.aiExtractFields, { key: '', label: '', instruction: '', type: 'text' }] })} className="text-sm text-primary-600 hover:text-primary-800">+ Add extract field</button>
            )}
          </div>

          {/* Checklist items */}
          <div className="space-y-2">
            <label className="form-label text-xs">Checklist Items</label>
            {type.checklistItems.map((ci, ci2) => (
              <div key={ci2} className="grid grid-cols-3 gap-2">
                <input className="form-input text-xs" value={ci.key} onChange={e => { const cis = [...type.checklistItems]; cis[ci2] = { ...ci, key: e.target.value }; updateType(idx, { ...type, checklistItems: cis }); }} disabled={!hasDraft} placeholder="key" />
                <input className="form-input text-xs" value={ci.label} onChange={e => { const cis = [...type.checklistItems]; cis[ci2] = { ...ci, label: e.target.value }; updateType(idx, { ...type, checklistItems: cis }); }} disabled={!hasDraft} placeholder="label" />
                <input className="form-input text-xs" value={ci.description} onChange={e => { const cis = [...type.checklistItems]; cis[ci2] = { ...ci, description: e.target.value }; updateType(idx, { ...type, checklistItems: cis }); }} disabled={!hasDraft} placeholder="description" />
              </div>
            ))}
            {hasDraft && (
              <button onClick={() => updateType(idx, { ...type, checklistItems: [...type.checklistItems, { key: '', label: '', description: '' }] })} className="text-sm text-primary-600 hover:text-primary-800">+ Add checklist item</button>
            )}
          </div>
        </div>
      ))}
      {hasDraft && (
        <button onClick={addType} className="btn-secondary text-sm">+ Add Type</button>
      )}
    </div>
  );
}

function ColumnsTab({ config, updateConfig, hasDraft }: { config: ProjectConfig; updateConfig: any; hasDraft: boolean }) {
  function addColumn() {
    updateConfig((c: ProjectConfig) => ({ ...c, outputColumns: [...c.outputColumns, { ...EMPTY_COLUMN, key: `col_${Date.now()}` }] }));
  }
  function removeColumn(idx: number) {
    updateConfig((c: ProjectConfig) => ({ ...c, outputColumns: c.outputColumns.filter((_: any, i: number) => i !== idx) }));
  }
  function updateColumn(idx: number, col: OutputColumn) {
    updateConfig((c: ProjectConfig) => {
      const cols = [...c.outputColumns];
      cols[idx] = col;
      return { ...c, outputColumns: cols };
    });
  }

  return (
    <div className="space-y-4">
      {!hasDraft && <p className="text-sm text-gray-500">Create a draft to edit output columns.</p>}
      {config.outputColumns.map((col, idx) => (
        <div key={idx} className="card p-3 space-y-2 relative">
          {!hasDraft || <button onClick={() => removeColumn(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg">×</button>}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <div className="form-field">
              <label className="form-label text-xs">Key</label>
              <input className="form-input text-xs" value={col.key} onChange={e => updateColumn(idx, { ...col, key: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Label</label>
              <input className="form-input text-xs" value={col.label} onChange={e => updateColumn(idx, { ...col, label: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Source</label>
              <select className="form-select text-xs" value={col.source} onChange={e => updateColumn(idx, { ...col, source: e.target.value as any })} disabled={!hasDraft}>
                {['form_field', 'ai_extract', 'computed', 'tracking_field'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Field Key</label>
              <input className="form-input text-xs" value={col.fieldKey || ''} onChange={e => updateColumn(idx, { ...col, fieldKey: e.target.value })} disabled={!hasDraft} />
            </div>
            <div className="form-field">
              <label className="form-label text-xs">Format</label>
              <select className="form-select text-xs" value={col.format || 'text'} onChange={e => updateColumn(idx, { ...col, format: e.target.value as any })} disabled={!hasDraft}>
                {['text', 'number', 'date', 'datetime', 'badge', 'image'].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="form-field flex items-end gap-2">
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={col.sortable || false} onChange={e => updateColumn(idx, { ...col, sortable: e.target.checked })} disabled={!hasDraft} />Sort</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={col.editable || false} onChange={e => updateColumn(idx, { ...col, editable: e.target.checked })} disabled={!hasDraft} />Edit</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={col.excelVisible ?? true} onChange={e => updateColumn(idx, { ...col, excelVisible: e.target.checked })} disabled={!hasDraft} />Excel</label>
            </div>
          </div>
          {col.source === 'computed' && (
            <div className="form-field">
              <label className="form-label text-xs">Expression</label>
              <input className="form-input text-xs font-mono" value={col.expression || ''} onChange={e => updateColumn(idx, { ...col, expression: e.target.value })} disabled={!hasDraft} placeholder="e.g. status === 'APPROVED' ? '✓' : '✗'" />
            </div>
          )}
        </div>
      ))}
      {hasDraft && (
        <button onClick={addColumn} className="btn-secondary text-sm">+ Add Column</button>
      )}
    </div>
  );
}

function PreviewTab({ config }: { config: ProjectConfig }) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="card">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <span className="text-2xl">📋</span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{config.name}</h1>
            <p className="text-sm text-gray-500">{config.description}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {config.formFields.map(field => (
            <div key={field.key} className="form-field">
              <label className="form-label">{field.label}{field.required && <span className="text-red-500">*</span>}</label>
              {field.type === 'dropdown' ? (
                <select className="form-select" disabled>
                  <option value="">Select...</option>
                  {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : field.type === 'file' || field.type === 'file-multiple' ? (
                <div className="flex items-center justify-center w-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-8">
                  <div className="text-center">
                    <p className="text-sm text-gray-500">File upload preview</p>
                    {field.accept && <p className="text-xs text-gray-400 mt-1">Accept: {field.accept}</p>}
                  </div>
                </div>
              ) : field.type === 'textarea' ? (
                <textarea className="form-input" disabled rows={3} />
              ) : (
                <input className="form-input" disabled placeholder={field.placeholder} />
              )}
              {field.helpText && <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VersionsTab({ versions, onRevert, onDelete, onClone }: { versions: ConfigVersionSummary[]; onRevert: (v: number) => void; onDelete: (v: number) => void; onClone: (v: number) => void }) {
  function formatDate(d: Date) {
    return new Date(d).toLocaleString();
  }

  return (
    <div className="space-y-2">
      {versions.length === 0 && <p className="text-sm text-gray-500">No versions found.</p>}
      {versions.map(v => (
        <div key={v.version} className={`card p-4 flex items-center justify-between ${v.status === 'published' ? 'border-l-4 border-l-green-500' : v.status === 'draft' ? 'border-l-4 border-l-amber-500' : ''}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">v{v.version}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                v.status === 'published' ? 'bg-green-100 text-green-800' :
                v.status === 'draft' ? 'bg-amber-100 text-amber-800' :
                'bg-gray-100 text-gray-600'
              }`}>
                {v.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{v.name}</p>
            {v.note && <p className="text-xs text-gray-400 mt-0.5">{v.note}</p>}
            <p className="text-xs text-gray-400 mt-1">Created {formatDate(v.createdAt)} by {v.createdBy}</p>
            {v.publishedAt && <p className="text-xs text-gray-400">Published {formatDate(v.publishedAt)} by {v.publishedBy}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onClone(v.version)} className="btn-secondary text-xs">Clone</button>
            {v.status !== 'published' && (
              <button onClick={() => onRevert(v.version)} className="btn-secondary text-xs">Revert</button>
            )}
            {v.status === 'archived' && (
              <button onClick={() => onDelete(v.version)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
