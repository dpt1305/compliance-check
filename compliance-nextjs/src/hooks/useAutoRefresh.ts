'use client';

import { useEffect, useRef } from 'react';

export const AUTO_REFRESH_INTERVAL_MS = 60_000;

interface Options {
  /** Time between refreshes. Default: 1 minute. */
  intervalMs?: number;
  /** Return true while the user is editing something; the tick is then skipped. */
  isBusy?: () => boolean;
}

/** True when keyboard focus is in a text-entry control (typing/editing in progress). */
export function isTypingInField(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Calls `onRefresh` every `intervalMs` (default 60 s).
 * - Skipped while the browser tab is hidden.
 * - Skipped while `isBusy()` is true (admin is editing); the next tick tries again.
 * Callbacks live in refs so changing them never resets the timer.
 */
export function useAutoRefresh(onRefresh: () => void, options: Options = {}): void {
  const refreshRef = useRef(onRefresh);
  const busyRef = useRef(options.isBusy);
  refreshRef.current = onRefresh;
  busyRef.current = options.isBusy;
  const intervalMs = options.intervalMs ?? AUTO_REFRESH_INTERVAL_MS;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      if (busyRef.current?.()) return;
      refreshRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
