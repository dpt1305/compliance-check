'use client';

import { useState } from 'react';

function getToken() { return sessionStorage.getItem('admin_token') ?? ''; }

export default function Notifications() {
  const [message, setMessage] = useState('Please submit your compliance documents before the deadline.');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState('');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [lastSentMode, setLastSentMode] = useState('');

  async function send() {
    if (!message.trim() || isSending) return;
    setIsSending(true); setSendSuccess(false); setSendError('');
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ message }),
      });
      const data = await res.json() as { message?: string; mode?: string };
      if (!res.ok) { setSendError(data.message ?? 'Failed to send notification'); return; }
      setSendSuccess(true);
      setLastSentAt(new Date());
      setLastSentMode(data.mode ?? '');
    } catch { setSendError('Failed to send notification. Please try again.'); }
    finally { setIsSending(false); }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      {/* Send card */}
      <div className="card overflow-hidden">
        <div className="flex items-start gap-3 border-b border-gray-100 p-4 sm:p-6">
          <span className="text-2xl">🔔</span>
          <div>
            <h2 className="font-semibold text-gray-900">Send Deadline Reminder</h2>
            <p className="text-sm text-gray-500">Notify users via configured channel (Teams / direct)</p>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {lastSentAt && (
            <div className="alert-info">
              <span>🕐</span>
              <span>
                Last sent: <strong>{lastSentAt.toLocaleString()}</strong>
                {lastSentMode && <> via <strong>{lastSentMode}</strong></>}
              </span>
            </div>
          )}

          <div className="form-field">
            <label className="form-label">Notification message</label>
            <textarea
              className="form-input min-h-[100px] w-full"
              value={message}
              onChange={e => { setMessage(e.target.value); setSendSuccess(false); setSendError(''); }}
              placeholder="Enter reminder message…"
              rows={4}
            />
            <span className="form-hint text-right">{message.length} characters</span>
          </div>

          {sendSuccess && (
            <div className="alert-success">
              <span>✅</span> Notification sent successfully!
            </div>
          )}
          {sendError && (
            <div className="alert-error">
              <span>⚠️</span> {sendError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={send}
              disabled={!message.trim() || isSending}
              className="btn-primary w-full sm:w-auto"
            >
              {isSending ? (
                <><span className="spinner w-4 h-4 border-white border-t-transparent"></span> Sending…</>
              ) : (
                <><span>📨</span> Send Reminder</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <span>ℹ️</span>
          <h3 className="font-semibold text-gray-800">Notification Settings</h3>
        </div>
        <p className="text-sm text-gray-600 mb-2">
          The notification channel and deadline date are configured via environment variables in <code className="bg-gray-100 px-1 rounded">.env.local</code>:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li><code>NOTIFICATION_MODE</code> — <code>teams</code> or <code>direct</code></li>
          <li><code>TEAMS_WEBHOOK_URL</code> — Teams incoming webhook URL</li>
          <li><code>DEADLINE_DATE</code> — e.g. <code>2024-12-31</code></li>
          <li><code>REMINDER_DAYS_BEFORE</code> — days before deadline to auto-remind (default 7)</li>
        </ul>
      </div>
    </div>
  );
}
