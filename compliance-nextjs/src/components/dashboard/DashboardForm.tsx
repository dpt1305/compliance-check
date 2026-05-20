'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ValidationGuidance from './ValidationGuidance';
import ValidationResult from './ValidationResult';
import Link from 'next/link';

const TYPE_SAMPLE_IMAGES: Record<string, string> = {
  windows: '/window_sample.png',
  mac: '/macos_sample.png',
  thin: '/thin_sample_2.png',
};

function sampleImageSrcdoc(src: string) {
  return `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#f9fafb;display:flex;align-items:flex-start;justify-content:center;min-height:100vh}
    img{width:100%;height:auto;display:block;cursor:zoom-in}
  </style></head><body><img src="${src}" /></body></html>`;
}

type MemberRow = {
  no: number | null;
  project: string | null;
  name: string | null;
  email: string | null;
  serial: string | null;
  trackingAccount: string | null;
  deviceType: string | null;
  malwareAlerts: string | null;
  complianceChecks: string | null;
  seedConfiguration: string | null;
  operatingSystem: string | null;
  trackingStatus: string | null;
  submissionId: number | null;
  account: string;
  submissionType: string | null;
  submissionStatus: string | null;
  submissionDate: string | null;
  imageUrl: string | null;
  confidenceScore: number | null;
};

type SubmissionResponse = {
  id?: number; account: string; submissionType: string;
  imageUrl?: string; imageSavedName?: string; status: string;
  validationResult: string; submissionDate?: string;
};

type FileError =
  | { type: 'required' }
  | { type: 'fileTooLarge'; actualMb: string }
  | { type: 'invalidExtension'; actual: string; allowed: string }
  | { type: 'invalidMagicBytes' }
  | { type: 'mimeTypeMismatch' };

const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_BYTES = 10 * 1024 * 1024;

function detectImageType(b: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

function typeMatchesMime(detected: string, declared: string): boolean {
  const m = declared.toLowerCase();
  if (detected === 'jpeg') return m.includes('jpeg') || m.includes('jpg');
  return m.includes(detected);
}

async function validateFile(file: File): Promise<FileError | null> {
  if (file.size > MAX_BYTES)
    return { type: 'fileTooLarge', actualMb: (file.size / (1024 * 1024)).toFixed(1) };

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.includes(ext))
    return { type: 'invalidExtension', actual: ext, allowed: ALLOWED_EXTS.join(', ') };

  const bytes = await new Promise<Uint8Array>((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => res(new Uint8Array(e.target!.result as ArrayBuffer));
    reader.onerror = () => rej(new Error('read failed'));
    reader.readAsArrayBuffer(file.slice(0, 12));
  });

  const detected = detectImageType(bytes);
  if (!detected) return { type: 'invalidMagicBytes' };
  if (!typeMatchesMime(detected, file.type)) return { type: 'mimeTypeMismatch' };
  return null;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DashboardForm() {
  const [account, setAccount] = useState('');
  const [submissionType, setSubmissionType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<FileError | null>(null);
  const [fileValidating, setFileValidating] = useState(false);
  const [fileTouched, setFileTouched] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [supportedTypes, setSupportedTypes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [memberRow, setMemberRow] = useState<MemberRow | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/mapping/types')
      .then(r => r.json())
      .then((d: { types: string[] }) => setSupportedTypes([...d.types].sort()))
      .catch(() => showToast('Failed to load submission types', false));
  }, []);

  const applyFile = useCallback(async (f: File) => {
    setFile(f);
    setFileTouched(true);
    setFileValidating(true);
    // Create preview URL (revoke previous one first)
    setImagePreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    const err = await validateFile(f);
    setFileError(err);
    setFileValidating(false);
  // All deps are stable React state setters + module-level validateFile
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global paste handler — Ctrl+V anywhere on the page pastes clipboard image
  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (!imgItem) return;
      e.preventDefault();
      const blob = imgItem.getAsFile();
      if (!blob) return;
      const ext = imgItem.type === 'image/png' ? 'png' : imgItem.type === 'image/webp' ? 'webp' : 'jpg';
      const pasted = new File([blob], `clipboard.${ext}`, { type: imgItem.type });
      await applyFile(pasted);
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [applyFile]);

  function clearFile(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFile(null);
    setFileError(null);
    setFileTouched(false);
    setImagePreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    if (fileRef.current) fileRef.current.value = '';
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFileTouched(true); setFileError({ type: 'required' }); return; }
    await applyFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account.trim() || !submissionType || !file || fileError || fileValidating || isSubmitting) return;

    if (result) {
      setResult(null);
    }

    setIsSubmitting(true);
    const fd = new FormData();
    fd.append('account', account.trim());
    fd.append('submissionType', submissionType);
    fd.append('image', file, file.name);

    try {
      const res = await fetch('/api/submission', { method: 'POST', body: fd });
      const data = await res.json() as SubmissionResponse & { message?: string };
      if (!res.ok) { showToast(data.message ?? 'Submission failed', false); return; }
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      if (data.status !== 'REJECTED') {
        showToast('Submission accepted! Awaiting admin approval.', true);
        // Fetch member row to display full user-list-style entry
        fetch(`/api/submission/member?account=${encodeURIComponent(account)}`)
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

  const accountError = account.trim().length === 0 ? 'required' : account.trim().length < 2 ? 'minlength' : null;
  const formInvalid = !!accountError || !submissionType || !file || !!fileError || fileValidating;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium transition-all ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <span className="text-2xl">📋</span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">Submit Compliance Document</h1>
            <p className="text-sm text-gray-500">Upload your device image for AI validation</p>
          </div>
          <Link href="/admin/login" className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1">
            <span>🔐</span> Admin
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5" noValidate>
          {/* Account */}
          <div className="form-field">
            <label className="form-label">Account ID <span className="text-red-500">*</span></label>
            <input
              className={`form-input ${account.trim() && accountError ? 'error' : ''}`}
              value={account}
              onChange={e => setAccount(e.target.value)}
              placeholder="e.g. HuyenTP"
              autoComplete="off"
            />
            {account.trim() && accountError === 'required' && <span className="form-error">Account is required</span>}
            {account.trim() && accountError === 'minlength' && <span className="form-error">Account must be at least 2 characters</span>}
          </div>

          {/* Submission Type */}
          <div className="form-field">
            <label className="form-label">Submission Type <span className="text-red-500">*</span></label>
            <select
              className="form-select"
              value={submissionType}
              onChange={e => setSubmissionType(e.target.value)}
            >
              <option value="">Select a type…</option>
              {supportedTypes.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Validation guidance */}
          {submissionType && <ValidationGuidance submissionType={submissionType} />}

          {/* Sample image */}
          {submissionType && TYPE_SAMPLE_IMAGES[submissionType.toLowerCase()] && (
            <div className="form-field">
              <label className="form-label">Sample Reference Image</label>
              <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                <iframe
                  srcDoc={sampleImageSrcdoc(TYPE_SAMPLE_IMAGES[submissionType.toLowerCase()])}
                  title={`${submissionType} sample`}
                  className="w-full"
                  style={{ height: '480px', border: 'none' }}
                />
                <p className="text-xs text-gray-500 py-1.5 text-center border-t border-gray-200">
                  Example of a valid <span className="font-semibold capitalize">{submissionType}</span> submission — scroll or pinch to zoom
                </p>
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div className="form-field">
            <label className="form-label">Image <span className="text-red-500">*</span></label>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />

            {/* Drop zone */}
            <div className="relative">
            <label
              htmlFor="file-upload"
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={async e => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) await applyFile(f);
              }}
              className={`flex flex-col items-center justify-center gap-3 w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors px-6 py-8
                ${isDragging
                  ? 'border-primary-500 bg-primary-50'
                  : fileTouched && fileError
                    ? 'border-red-400 bg-red-50'
                    : file && !fileError
                      ? 'border-green-400 bg-green-50'
                      : 'border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-50'
                }`}
            >
              {fileValidating ? (
                <>
                  <span className="spinner w-6 h-6 border-gray-400 border-t-transparent"></span>
                  <span className="text-sm text-gray-500">Validating…</span>
                </>
              ) : file && !fileError ? (
                <>
                  {imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-40 max-w-full rounded-lg object-contain shadow-sm"
                    />
                  )}
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-800 break-all">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(file.size)} — click or drop to replace</p>
                  </div>
                </>
              ) : file && fileError ? (
                <>
                  {imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-32 max-w-full rounded-lg object-contain shadow-sm opacity-60"
                    />
                  )}
                  <div className="text-center">
                    <p className="text-sm font-medium text-red-700 break-all">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(file.size)} — click or drop to replace</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-4xl">{isDragging ? '📂' : '☁️'}</span>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-gray-700">
                      {isDragging ? 'Drop image here' : 'Click to browse or drag & drop'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Or press <kbd className="px-1.5 py-0.5 rounded border border-gray-300 bg-white text-gray-600 font-mono text-xs">Ctrl+V</kbd> to paste from clipboard
                    </p>
                    <p className="text-xs text-gray-400">JPG, PNG, WEBP — max 10 MB</p>
                  </div>
                </>
              )}
            </label>

            {/* Clear button — shown when a file is selected */}
            {file && !fileValidating && (
              <button
                type="button"
                onClick={clearFile}
                title="Remove image"
                className="absolute top-2 right-2 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 hover:bg-red-600 text-white text-xs leading-none transition-colors shadow"
              >
                ✕
              </button>
            )}
            </div>

            {fileTouched && fileError && !fileValidating && (
              <div className="mt-1 space-y-1">
                {fileError.type === 'required' && <span className="form-error">Image is required</span>}
                {fileError.type === 'fileTooLarge' && <span className="form-error">File too large ({fileError.actualMb} MB). Max: 10 MB</span>}
                {fileError.type === 'invalidExtension' && <span className="form-error">Invalid extension (.{fileError.actual}). Allowed: {fileError.allowed}</span>}
                {fileError.type === 'invalidMagicBytes' && <span className="form-error">File is not a valid image (corrupt or unsupported format)</span>}
                {fileError.type === 'mimeTypeMismatch' && <span className="form-error">File extension does not match actual file content</span>}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="btn-primary"
              disabled={formInvalid || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner w-4 h-4 border-white border-t-transparent"></span>
                  Submitting…
                </>
              ) : (
                <><span>📤</span> Submit</>
              )}
            </button>
          </div>
        </form>
      </div>

      {result && <div ref={resultRef}><ValidationResult result={result} memberRow={memberRow} /></div>}
    </div>
  );
}
