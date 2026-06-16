'use client';

import { useEffect, useRef } from 'react';

type DataScope = 'tracking' | 'submissions' | 'config';

interface AdminEventCallbacks {
  /** Called when tracking_members table changes (add/edit/delete/upload). */
  onTracking?: () => void;
  /** Called when submissions table changes (new submission, status update, delete). */
  onSubmissions?: () => void;
  /** Called when project config changes (publish/revert). */
  onConfig?: () => void;
}

const POLL_INTERVAL_MS = 5_000;
// If SSE errors within this window we assume serverless / no SSE support
const SSE_PROBE_MS = 3_000;

/**
 * useAdminEvents — subscribes to the SSE stream at /api/admin/events.
 *
 * Falls back to polling every 5 s when SSE is unavailable (e.g. Vercel serverless).
 * SSE failure is detected by an error event arriving before the first message.
 *
 * Callbacks are stored in a ref so changing them never restarts the connection.
 */
export function useAdminEvents(callbacks: AdminEventCallbacks): void {
  const cbRef = useRef<AdminEventCallbacks>(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let probeTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let sseWorking = false;

    // ── Polling fallback ────────────────────────────────────────────────────
    // We call the version endpoints to detect changes cheaply.
    // Tracking version is already an integer; submissions we track by count/latest id.
    let lastTrackingVersion = -1;
    let lastSubmissionsTs   = -1;

    async function poll() {
      try {
        const [tvRes, subRes] = await Promise.all([
          fetch('/api/admin/tracking/version', { cache: 'no-store' }),
          fetch('/api/admin/submissions?_poll=1', { cache: 'no-store' }),
        ]);

        if (tvRes.ok) {
          const { mtime } = await tvRes.json() as { mtime: number };
          if (lastTrackingVersion !== -1 && mtime !== lastTrackingVersion) {
            cbRef.current.onTracking?.();
          }
          lastTrackingVersion = mtime;
        }

        if (subRes.ok) {
          const data = await subRes.json() as { ts?: number; total?: number };
          // Use total count as a cheap change signal
          const ts = data.ts ?? data.total ?? 0;
          if (lastSubmissionsTs !== -1 && ts !== lastSubmissionsTs) {
            cbRef.current.onSubmissions?.();
          }
          lastSubmissionsTs = ts;
        }
      } catch {
        // Network error — ignore, try again next interval
      }
    }

    function startPolling() {
      poll(); // prime the initial values immediately
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    }

    // ── SSE attempt ─────────────────────────────────────────────────────────
    es = new EventSource('/api/admin/events');

    // If SSE sends a real message within the probe window → SSE is working
    es.onmessage = (e: MessageEvent<string>) => {
      sseWorking = true;
      if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
      try {
        const data = JSON.parse(e.data) as { scope: DataScope };
        if (data.scope === 'tracking')    cbRef.current.onTracking?.();
        if (data.scope === 'submissions') cbRef.current.onSubmissions?.();
        if (data.scope === 'config')      cbRef.current.onConfig?.();
      } catch {
        // Ignore heartbeat comments or malformed data
      }
    };

    es.onerror = () => {
      if (sseWorking) return; // SSE was working, browser will auto-reconnect — let it
      // SSE failed before any message — switch to polling
      if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
      es?.close();
      es = null;
      startPolling();
    };

    // Fallback: if no message or error within probe window, assume serverless
    probeTimer = setTimeout(() => {
      if (!sseWorking) {
        es?.close();
        es = null;
        startPolling();
      }
    }, SSE_PROBE_MS);

    return () => {
      es?.close();
      if (probeTimer) clearTimeout(probeTimer);
      if (pollTimer)  clearInterval(pollTimer);
    };
  }, []); // Mount-only — callbacks are read from ref
}
