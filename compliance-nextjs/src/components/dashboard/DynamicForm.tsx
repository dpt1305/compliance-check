'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ProjectConfig, FormField, SubmissionType } from '@/lib/db/mongo/config-repo';
import {
  evaluateVisibility,
  validateField,
  validateForm,
  validatePreRules,
  getFormDefaultValue,
  getFileAcceptString,
  getMaxFileSizeBytes,
} from '@/lib/services/dynamic-form';

function sampleImageSrcdoc(src: string) {
  return `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#f9fafb;display:flex;align-items:flex-start;justify-content:center;min-height:100vh}
    img{width:100%;height:auto;display:block;cursor:zoom-in}
  </style></head><body><img src="${src}" /></body></html>`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type SubmissionResponse = {
  id?: number; account: string; submissionType: string;
  imageUrl?: string; imageSavedName?: string; status: string;
  validationResult: string; submissionDate?: string;
  message?: string;
};

type MemberRow = Record<string, unknown> & {
  no: number | null; account: string; imageUrl: string | null;
  submissionStatus: string | null; submissionDate: string | null;
};

export default function DynamicForm() {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [memberRow, setMemberRow] = useState<MemberRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string[]>>({});
  const [selectedType, setSelectedType] = useState('');
  const [sampleImageUrl, setSampleImageUrl] = useState<string | null>(null);
  const [sampleImageAlt, setSampleImageAlt] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/form/config')
      .then(r => r.json() as Promise<ProjectConfig>)
      .then(cfg => {
        setConfig(cfg);
        const defaults: Record<string, any> = {};
        cfg.formFields.forEach(f => { defaults[f.key] = getFormDefaultValue(f); });
        setFormValues(defaults);
      })
      .catch(() => showToast('Failed to load form config', false))
      .finally(() => setIsLoadingConfig(false));
  }, []);

  useEffect(() => {
    if (!config || !selectedType) {
      setSampleImageUrl(null);
      setSampleImageAlt('');
      return;
    }
    const st = config.submissionTypes.find(t => t.key === selectedType);
    if (st?.sampleImageUrl) {
      setSampleImageUrl(st.sampleImageUrl);
      setSampleImageAlt(st.label || selectedType);
    } else {
      setSampleImageUrl(null);
      setSampleImageAlt('');
    }
  }, [config, selectedType]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function setFieldValue(key: string, value: any) {
    setFormValues(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  }

  function handleFileUpload(fieldKey: string, fieldDef: FormField, fileList: FileList) {
    const arr = Array.from(fileList);
    const maxFiles = fieldDef.maxFiles || (fieldDef.type === 'file-multiple' ? 5 : 1);
    const maxSize = getMaxFileSizeBytes(fieldDef);
    const acceptStr = getFileAcceptString(fieldDef);
    const allowedExts = acceptStr.split(',').map(s => s.trim().replace('.', '').toLowerCase());

    const errors: string[] = [];
    const validFiles: File[] = [];

    for (const f of arr) {
      if (f.size > maxSize) {
        errors.push(`${f.name}: too large (${formatBytes(f.size)}, max ${formatBytes(maxSize)})`);
        continue;
      }
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (allowedExts.length && !allowedExts.includes(ext)) {
        errors.push(`${f.name}: extension .${ext} not allowed`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length > maxFiles) {
      errors.push(`Max ${maxFiles} file(s) allowed`);
      validFiles.length = maxFiles;
    }

    setFileErrors(prev => {
      const n = { ...prev };
      if (errors.length) n[fieldKey] = errors.join('; ');
      else delete n[fieldKey];
      return n;
    });

    setFiles(prev => ({ ...prev, [fieldKey]: validFiles }));

    const urls = validFiles.map(f => URL.createObjectURL(f));
    setImagePreviews(prev => ({ ...prev, [fieldKey]: urls }));
  }

  function clearFile(fieldKey: string) {
    setFiles(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
    setFileErrors(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
    setImagePreviews(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
    setFormValues(prev => { const n = { ...prev }; n[fieldKey] = null; return n; });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!config || isSubmitting) return;

    const visibleFields = config.formFields.filter(f => evaluateVisibility(f, formValues));
    const errs = validateForm(visibleFields, formValues);
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const fileField = config.formFields.find(f => f.type === 'file' || f.type === 'file-multiple');
    if (fileField && evaluateVisibility(fileField, formValues)) {
      if (!files[fileField.key]?.length) {
        setFileErrors(prev => ({ ...prev, [fileField.key]: `${fileField.label} is required` }));
        return;
      }
    }

    const selectedTypeConfig = config.submissionTypes.find(t => t.key === formValues.submissionType);
    if (selectedTypeConfig?.preValidationRules) {
      const preErrs = validatePreRules(selectedTypeConfig.preValidationRules, formValues, files);
      if (preErrs.length) {
        const firstFileKey = config.formFields.find(f => f.type === 'file' || f.type === 'file-multiple')?.key || '';
        setFileErrors(prev => ({ ...prev, [firstFileKey]: preErrs.join('; ') }));
        return;
      }
    }

    setIsSubmitting(true);
    const fd = new FormData();
    for (const [key, val] of Object.entries(formValues)) {
      if (val !== null && val !== undefined && val !== '') {
        fd.append(key, String(val));
      }
    }
    for (const [key, fileArr] of Object.entries(files)) {
      for (const f of fileArr) {
        fd.append(key, f, f.name);
      }
    }

    try {
      const res = await fetch('/api/submission', { method: 'POST', body: fd });
      const data = await res.json() as SubmissionResponse;
      if (!res.ok) { showToast(data.message ?? 'Submission failed', false); return; }
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      if (data.status !== 'REJECTED') {
        showToast('Submission accepted! Awaiting admin approval.', true);
        const accountVal = formValues.account || '';
        fetch(`/api/submission/member?account=${encodeURIComponent(accountVal)}`)
          .then(r => r.json())
          .then((row: MemberRow) => setMemberRow(row))
          .catch(() => setMemberRow(null));
      } else {
        showToast('Validation failed. Please fix the issues and try again.', false);
      }
    } catch {
      showToast('Submission failed. Please try again.', false);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingConfig) {
    return (
      <div className="max-w-5xl mx-auto p-6 flex items-center justify-center">
        <span className="spinner w-6 h-6 border-gray-400 border-t-transparent"></span>
        <span className="ml-3 text-gray-500">Loading form...</span>
      </div>
    );
  }

  if (!config) {
    return <div className="max-w-5xl mx-auto p-6 text-center text-gray-500">Failed to load form configuration.</div>;
  }

  const typeField = config.formFields.find(f => f.type === 'dropdown' && f.key === 'submissionType');
  const submissionTypes = config.submissionTypes;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="card">
        <a
          href="/user-guide.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600
                     text-white text-sm font-medium hover:from-indigo-500 hover:to-violet-500 transition-all
                     group border-b border-indigo-700"
        >
          <span className="text-lg animate-bounce inline-block">📖</span>
          <div className="flex-1">
            <span className="font-bold">New here? Read the User Guide first</span>
            <span className="ml-2 opacity-80 text-xs hidden sm:inline">— see exactly what screenshot you need to submit</span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5
                           rounded-full font-semibold transition-colors whitespace-nowrap">
            Open Guide →
          </span>
        </a>

        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <span className="text-2xl">📋</span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">{config.name}</h1>
            <p className="text-sm text-gray-500">{config.description}</p>
          </div>
          <a href="/admin/login" className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1">
            <span>🔐</span> Admin
          </a>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5" noValidate>
          {config.formFields.map(field => {
            const visible = evaluateVisibility(field, formValues);
            if (!visible) return null;

            return (
              <div key={field.key} className="form-field">
                <label className="form-label">
                  {field.label}
                  {field.required && <span className="text-red-500">*</span>}
                </label>

                {field.type === 'dropdown' ? (
                  <select
                    className={`form-select ${fieldErrors[field.key] ? 'error' : ''}`}
                    value={formValues[field.key] || ''}
                    onChange={e => {
                      setFieldValue(field.key, e.target.value);
                      if (field.key === 'submissionType') setSelectedType(e.target.value);
                    }}
                  >
                    <option value="">Select a type…</option>
                    {(field.options || []).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : field.type === 'file' || field.type === 'file-multiple' ? (
                  <DynamicFileUpload
                    field={field}
                    files={files[field.key] || []}
                    previews={imagePreviews[field.key] || []}
                    error={fileErrors[field.key]}
                    onUpload={(fl) => handleFileUpload(field.key, field, fl)}
                    onClear={() => clearFile(field.key)}
                  />
                ) : field.type === 'textarea' ? (
                  <textarea
                    className={`form-input ${fieldErrors[field.key] ? 'error' : ''}`}
                    value={formValues[field.key] || ''}
                    onChange={e => setFieldValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                  />
                ) : field.type === 'date' ? (
                  <input
                    type="date"
                    className={`form-input ${fieldErrors[field.key] ? 'error' : ''}`}
                    value={formValues[field.key] || ''}
                    onChange={e => setFieldValue(field.key, e.target.value)}
                  />
                ) : field.type === 'datetime' ? (
                  <input
                    type="datetime-local"
                    className={`form-input ${fieldErrors[field.key] ? 'error' : ''}`}
                    value={formValues[field.key] || ''}
                    onChange={e => setFieldValue(field.key, e.target.value)}
                  />
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                    className={`form-input ${fieldErrors[field.key] ? 'error' : ''}`}
                    value={formValues[field.key] ?? ''}
                    onChange={e => setFieldValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}

                {fieldErrors[field.key] && <span className="form-error">{fieldErrors[field.key]}</span>}
                {field.helpText && !fieldErrors[field.key] && <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>}
              </div>
            );
          })}

          {selectedType && sampleImageUrl && (
            <div className="form-field">
              <label className="form-label">Sample Reference Image</label>
              <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                <iframe
                  srcDoc={sampleImageSrcdoc(sampleImageUrl)}
                  title={sampleImageAlt + ' sample'}
                  className="w-full"
                  style={{ height: '480px', border: 'none' }}
                />
                <p className="text-xs text-gray-500 py-1.5 text-center border-t border-gray-200">
                  Example of a valid <span className="font-semibold">{sampleImageAlt}</span> submission
                </p>
              </div>
            </div>
          )}

          {selectedType && (
            <DynamicValidationGuidance submissionType={selectedType} submissionTypes={submissionTypes} />
          )}

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <><span className="spinner w-4 h-4 border-white border-t-transparent"></span> Submitting…</>
              ) : (
                <><span>📤</span> Submit</>
              )}
            </button>
          </div>
        </form>
      </div>

      {result && (
        <div ref={resultRef}>
          <DynamicValidationResult result={result} memberRow={memberRow} />
        </div>
      )}
    </div>
  );
}

// ── File Upload Component ──────────────────────────────────────────────────────

function DynamicFileUpload({
  field, files, previews, error, onUpload, onClear,
}: {
  field: FormField;
  files: File[];
  previews: string[];
  error?: string;
  onUpload: (fl: FileList) => void;
  onClear: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept={getFileAcceptString(field)}
        multiple={field.type === 'file-multiple'}
        onChange={e => { if (e.target.files) onUpload(e.target.files); }}
        className="hidden"
        id={`file-upload-${field.key}`}
      />

      <label
        htmlFor={`file-upload-${field.key}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async e => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-3 w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors px-6 py-8
          ${isDragging ? 'border-primary-500 bg-primary-50'
            : error ? 'border-red-400 bg-red-50'
            : files.length ? 'border-green-400 bg-green-50'
            : 'border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-50'
          }`}
      >
        {files.length > 0 ? (
          <>
            {previews.map((url, i) => (
              <img key={i} src={url} alt="Preview" className="max-h-32 max-w-full rounded object-contain shadow-sm" />
            ))}
            <div className="text-center">
              <p className="text-sm font-medium text-gray-800">
                {files.length} file{files.length > 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-gray-500">
                {files.map(f => f.name).join(', ')} — {formatBytes(files.reduce((s, f) => s + f.size, 0))}
              </p>
            </div>
          </>
        ) : (
          <>
            <span className="text-4xl">{isDragging ? '📂' : '☁️'}</span>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-gray-700">
                {isDragging ? 'Drop file here' : 'Click to browse or drag & drop'}
              </p>
              <p className="text-xs text-gray-400">
                Accept: {getFileAcceptString(field)}
                {field.maxFileSizeMb && ` — max ${field.maxFileSizeMb} MB`}
              </p>
            </div>
          </>
        )}
      </label>

      {files.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="absolute top-2 right-2 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 hover:bg-red-600 text-white text-xs leading-none transition-colors shadow"
        >
          ✕
        </button>
      )}

      {error && <span className="form-error mt-1 block">{error}</span>}
    </div>
  );
}

// ── Dynamic Validation Guidance ────────────────────────────────────────────────

function DynamicValidationGuidance({
  submissionType, submissionTypes,
}: {
  submissionType: string;
  submissionTypes: SubmissionType[];
}) {
  const st = submissionTypes.find(t => t.key === submissionType);
  if (!st || !st.checklistItems?.length) return null;

  return (
    <div className="card p-4 border border-blue-100 bg-blue-50">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600 text-lg">ℹ️</span>
        <div>
          <div className="font-semibold text-gray-800">{st.label} Compliance Requirements</div>
          <div className="text-xs text-gray-500">Your screenshot must include these elements</div>
        </div>
      </div>

      <p className="text-sm text-gray-700 mb-3">
        All {st.checklistItems.length} items above must be visible in your screenshot for approval.
      </p>

      <div className="space-y-2">
        {st.checklistItems.map(item => (
          <div key={item.key} className="flex items-start gap-3">
            <span className="text-lg mt-0.5">✅</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                {item.label}
                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">REQUIRED</span>
              </div>
              <div className="text-xs text-gray-600">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dynamic Validation Result ──────────────────────────────────────────────────

interface AiResult {
  valid?: boolean;
  matchesType?: boolean;
  confidence?: number;
  reason?: string;
  failedChecks?: string[] | null;
  guidelines?: string[] | null;
  suggestion?: string | null;
  checklist?: Record<string, boolean>;
  deviceSerial?: string | null;
  deviceName?: string | null;
}

function DynamicValidationResult({
  result, memberRow,
}: {
  result: SubmissionResponse;
  memberRow?: MemberRow | null;
}) {
  const isApproved = result.status !== 'REJECTED';
  let aiResult: AiResult | null = null;
  try {
    aiResult = result.validationResult ? JSON.parse(result.validationResult) as AiResult : null;
  } catch { /* ignore */ }

  return (
    <div className={`card mt-6 border-l-4 ${isApproved ? 'border-l-green-500' : 'border-l-red-500'}`}>
      <div className={`flex items-center gap-3 p-4 ${isApproved ? 'bg-green-50' : 'bg-red-50'}`}>
        <span className="text-2xl">{isApproved ? '✅' : '❌'}</span>
        <div>
          <div className={`font-semibold ${isApproved ? 'text-green-800' : 'text-red-800'}`}>
            {isApproved ? 'Image Accepted — Pending Approval' : 'Image Not Valid'}
          </div>
          <div className="text-sm text-gray-600 capitalize">Type: {result.submissionType}</div>
        </div>
      </div>

      <div className="p-4">
        {isApproved ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">📤</span>
                <span>Image received and format verified</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">🤖</span>
                <span>
                  AI validation passed
                  {aiResult?.confidence != null && (
                    <strong className="ml-1">({aiResult.confidence}% confidence)</strong>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">🏷️</span>
                <span>Matches submission type: <strong className="capitalize">{result.submissionType}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">✔️</span>
                <span>Submission saved successfully</span>
              </div>
            </div>

            {aiResult?.checklist && (
              <div className="mt-3 space-y-1">
                {Object.entries(aiResult.checklist).map(([key, passed]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span>{passed ? '✅' : '❌'}</span>
                    <span className="text-gray-700">{key}</span>
                  </div>
                ))}
              </div>
            )}

            {memberRow && (
              <div className="mt-3 overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-medium">No.</th>
                      <th className="px-3 py-2 text-left font-medium">Account</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-3 py-2">{memberRow.no ?? '—'}</td>
                      <td className="px-3 py-2">{memberRow.account}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          memberRow.submissionStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          memberRow.submissionStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {memberRow.submissionStatus || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2">{memberRow.submissionDate ? new Date(memberRow.submissionDate).toLocaleDateString() : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {aiResult?.reason && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded p-3">
                <span>⚠️</span>
                <span>{aiResult.reason}</span>
              </div>
            )}

            {aiResult?.failedChecks && aiResult.failedChecks.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <span>📋</span> Failed requirements:
                </div>
                <div className="space-y-2">
                  {aiResult.failedChecks.map((check, i) => (
                    <div key={i} className="bg-red-50 rounded p-3">
                      <div className="flex items-start gap-2 text-sm text-red-700">
                        <span>✗</span>
                        <span>{check}</span>
                      </div>
                      {aiResult?.guidelines?.[i] && (
                        <div className="flex items-start gap-2 text-sm text-blue-700 mt-1 ml-4">
                          <span>→</span>
                          <span>{aiResult.guidelines[i]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {aiResult?.suggestion && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex items-start gap-2 text-sm text-gray-700">
            <span>💡</span>
            <span><strong>Tip:</strong> {aiResult.suggestion}</span>
          </div>
        )}
      </div>
    </div>
  );
}
