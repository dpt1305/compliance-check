'use client';

import { useEffect, useRef } from 'react';

type DataScope = 'tracking' | 'submissions';

interface AdminEventCallbacks {
  /** Called when tracking_members table changes (add/edit/delete/upload). */
  onTracking?: () => void;
  /** Called when submissions table changes (new submission, status update, delete). */
  onSubmissions?: () => void;
}

/**
 * useAdminEvents — subscribes to the SSE stream at /api/admin/events.
 *
 * Calls `onTracking` or `onSubmissions` immediately when the server broadcasts
 * a change event. The EventSource connection is:
 *   - Established once on mount
 *   - Auto-reconnected by the browser on network errors
 *   - Closed automatically on component unmount
 *
 * Callbacks are stored in a ref so changing them never restarts the connection.
 *
 * Usage:
 *   useAdminEvents({ onTracking: loadData, onSubmissions: loadData });
 */
export function useAdminEvents(callbacks: AdminEventCallbacks): void {
  // Store callbacks in a ref so the effect never needs to re-run when they change
  const cbRef = useRef<AdminEventCallbacks>(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    // EventSource uses cookies for auth automatically (same-origin, httpOnly cookie set by login)
    const es = new EventSource('/api/admin/events');

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { scope: DataScope };
        if (data.scope === 'tracking')     cbRef.current.onTracking?.();
        if (data.scope === 'submissions')  cbRef.current.onSubmissions?.();
      } catch {
        // Ignore heartbeat comments or malformed data
      }
    };

    es.onerror = () => {
      // Browser auto-reconnects; no manual handling needed
    };

    return () => {
      es.close();
    };
  }, []); // Mount-only — callbacks are read from ref
}
