/**
 * One document per POST /api/submission: who submitted what, every AI step and the final outcome
 * (success and failure alike), so an admin can trace a submission later.
 * Documents are deleted automatically by a TTL index after SUBMISSION_LOG_TTL_DAYS (default 90).
 */
import type { Filter } from 'mongodb';
import { getMongoDb } from './connection';

const COLLECTION = 'submission_logs';

export type SubmissionLogOutcome =
  | 'ACCEPTED'
  | 'ACCEPTED_WARNING'
  | 'REJECTED'
  | 'SERIAL_MISMATCH'
  | 'NO_SERIAL_REGISTERED'
  | 'USER_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'AI_UNAVAILABLE'
  | 'SERVER_ERROR';

export interface SubmissionLogEvent {
  at: string;
  /** Milliseconds since the request started. */
  ms: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface SubmissionLogDoc {
  requestId: string;
  createdAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  client?: { ip?: string | null; userAgent?: string | null };
  account?: string | null;
  submissionType?: string | null;
  registeredSerial?: string | null;
  image?: {
    originalName?: string;
    mimeType?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
    savedName?: string;
    url?: string;
  };
  /** Everything the AI did: provider, model, timings, tokens, raw reply and the parsed findings. */
  ai?: {
    provider: string | null;
    model: string | null;
    durationMs: number;
    cropCount: number;
    usage: unknown;
    attempts: unknown[];
    rawText: string | null;
    result: unknown;
  };
  /** What the policy layer made of the AI answer. */
  decision?: {
    verdict: string;
    confidence: number;
    failedKeys: string[];
    warnings: string[];
    rejectReasons: string[];
  };
  outcome?: {
    status: SubmissionLogOutcome;
    httpStatus: number;
    title?: string;
    reason?: string;
    failedChecks?: string[];
  };
  submissionId?: number;
  error?: { message: string; stack?: string };
  events: SubmissionLogEvent[];
}

function ttlSeconds(): number {
  const days = parseInt(process.env.SUBMISSION_LOG_TTL_DAYS ?? '90', 10);
  return (Number.isFinite(days) && days > 0 ? days : 90) * 24 * 60 * 60;
}

async function col() {
  const db = await getMongoDb();
  return db.collection<SubmissionLogDoc>(COLLECTION);
}

export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ requestId: 1 }, { unique: true });
  await c.createIndex({ account: 1, createdAt: -1 });
  await c.createIndex({ 'outcome.status': 1, createdAt: -1 });
  const expireAfterSeconds = ttlSeconds();
  try {
    await c.createIndex({ createdAt: 1 }, { name: 'ttl_createdAt', expireAfterSeconds });
  } catch (err) {
    // The TTL was changed in env: update the existing index in place instead of failing.
    if ((err as { codeName?: string }).codeName !== 'IndexOptionsConflict') throw err;
    const db = await getMongoDb();
    await db.command({ collMod: COLLECTION, index: { name: 'ttl_createdAt', expireAfterSeconds } });
  }
}

let indexesReady: Promise<void> | null = null;

export async function insertLog(doc: SubmissionLogDoc): Promise<void> {
  // Make sure the TTL index exists even if the app's bootstrap never ran in this instance.
  indexesReady ??= ensureIndexes().catch(err => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  const c = await col();
  await c.insertOne(doc);
}

export interface LogQuery {
  requestId?: string;
  account?: string;
  status?: string;
  submissionType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  skip?: number;
}

const escapeRegex = (v: string) => v.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function queryLogs(q: LogQuery): Promise<{ total: number; items: SubmissionLogDoc[] }> {
  const c = await col();
  const filter: Filter<SubmissionLogDoc> = {};
  if (q.requestId) filter.requestId = q.requestId;
  if (q.account) filter.account = { $regex: `^${escapeRegex(q.account)}$`, $options: 'i' };
  if (q.status) filter['outcome.status'] = { $in: q.status.split(',').map(s => s.trim().toUpperCase()) } as never;
  if (q.submissionType) filter.submissionType = { $regex: `^${escapeRegex(q.submissionType)}$`, $options: 'i' };
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  const [total, items] = await Promise.all([
    c.countDocuments(filter),
    c.find(filter, { projection: { _id: 0 } }).sort({ createdAt: -1 }).skip(q.skip ?? 0).limit(limit).toArray(),
  ]);
  return { total, items };
}
