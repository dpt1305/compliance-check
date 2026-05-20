/**
 * Submission repository — async proxy.
 * Routes to MongoDB when MONGODB_URI is set, otherwise falls back to SQLite.
 * All functions return Promises so callers work uniformly with both backends.
 */
import { isMongoEnabled } from './mongo/connection';
import type { Submission } from '@/lib/storage/json-storage';

// ── SQLite implementation (lazy-loaded to avoid import when not needed) ──────

function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const s = require('./sqlite/submission-repo') as typeof import('./sqlite/submission-repo');
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function findAll(): Promise<Submission[]> {
  if (isMongoEnabled()) {
    const { findAll: fn } = await import('./mongo/submission-repo');
    return fn();
  }
  return sqlite().findAll();
}

export async function findById(id: number): Promise<Submission | null> {
  if (isMongoEnabled()) {
    const { findById: fn } = await import('./mongo/submission-repo');
    return fn(id);
  }
  return sqlite().findById(id);
}

export async function save(submission: Submission): Promise<Submission> {
  if (isMongoEnabled()) {
    const { save: fn } = await import('./mongo/submission-repo');
    return fn(submission);
  }
  return sqlite().save(submission);
}

export async function updateStatus(id: number, status: string): Promise<boolean> {
  if (isMongoEnabled()) {
    const { updateStatus: fn } = await import('./mongo/submission-repo');
    return fn(id, status);
  }
  return sqlite().updateStatus(id, status);
}

export async function deleteById(id: number): Promise<boolean> {
  if (isMongoEnabled()) {
    const { deleteById: fn } = await import('./mongo/submission-repo');
    return fn(id);
  }
  return sqlite().deleteById(id);
}

export async function existsById(id: number): Promise<boolean> {
  if (isMongoEnabled()) {
    const { existsById: fn } = await import('./mongo/submission-repo');
    return fn(id);
  }
  return sqlite().existsById(id);
}

export async function deleteByPeriod(month: number, year: number): Promise<Submission[]> {
  if (isMongoEnabled()) {
    const { deleteByPeriod: fn } = await import('./mongo/submission-repo');
    return fn(month, year);
  }
  return sqlite().deleteByPeriod(month, year);
}
