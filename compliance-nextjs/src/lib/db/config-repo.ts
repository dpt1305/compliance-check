/**
 * Proxy repos for config and metadata — MongoDB only.
 * Mirrors the pattern of submission-repo.ts.
 */
import { isMongoEnabled } from './mongo/connection';

// ── Config repo proxy ────────────────────────────────────────────────────────

export async function findPublished(): Promise<any | null> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { findPublished: fn } = await import('./mongo/config-repo');
  return fn();
}

export async function findDraft(): Promise<any | null> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { findDraft: fn } = await import('./mongo/config-repo');
  return fn();
}

export async function findFullDraft(): Promise<any | null> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { findFullDraft: fn } = await import('./mongo/config-repo');
  return fn();
}

export async function findAllVersions(): Promise<any[]> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { findAllVersions: fn } = await import('./mongo/config-repo');
  return fn();
}

export async function findByVersion(version: number): Promise<any | null> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { findByVersion: fn } = await import('./mongo/config-repo');
  return fn(version);
}

export async function createDraftFromPublished(createdBy: string): Promise<any> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { createDraftFromPublished: fn } = await import('./mongo/config-repo');
  return fn(createdBy);
}

export async function publishDraft(note: string | undefined, createdBy: string): Promise<any> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { publishDraft: fn } = await import('./mongo/config-repo');
  return fn(note, createdBy);
}

export async function revertToVersion(version: number, note: string | undefined, createdBy: string): Promise<any> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { revertToVersion: fn } = await import('./mongo/config-repo');
  return fn(version, note, createdBy);
}

export async function updateDraft(config: any, createdBy: string): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { updateDraft: fn } = await import('./mongo/config-repo');
  return fn(config, createdBy);
}

export async function deleteVersion(version: number): Promise<boolean> {
  if (!isMongoEnabled()) throw new Error('Config requires MongoDB (MONGODB_URI must be set)');
  const { deleteVersion: fn } = await import('./mongo/config-repo');
  return fn(version);
}

// ── Metadata repo proxy ──────────────────────────────────────────────────────

export async function metadataFindBySubmissionId(submissionId: number): Promise<Map<string, string>> {
  if (!isMongoEnabled()) throw new Error('Metadata requires MongoDB (MONGODB_URI must be set)');
  const { findBySubmissionId: fn } = await import('./mongo/metadata-repo');
  return fn(submissionId);
}

export async function metadataBulkInsert(submissionId: number, entries: { fieldKey: string; fieldValue: string }[]): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Metadata requires MongoDB (MONGODB_URI must be set)');
  const { bulkInsert: fn } = await import('./mongo/metadata-repo');
  return fn(submissionId, entries);
}

export async function metadataDeleteBySubmissionId(submissionId: number): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Metadata requires MongoDB (MONGODB_URI must be set)');
  const { deleteBySubmissionId: fn } = await import('./mongo/metadata-repo');
  return fn(submissionId);
}

export async function metadataUpsertField(submissionId: number, fieldKey: string, fieldValue: string): Promise<void> {
  if (!isMongoEnabled()) throw new Error('Metadata requires MongoDB (MONGODB_URI must be set)');
  const { upsertField: fn } = await import('./mongo/metadata-repo');
  return fn(submissionId, fieldKey, fieldValue);
}
