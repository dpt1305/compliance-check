/**
 * MongoDB submission repository.
 * Mirrors the interface of src/lib/db/submission-repo.ts exactly so callers need no changes.
 */
import { ObjectId } from 'mongodb';
import { getMongoDb, getCounters } from './connection';
import { emitChange } from '../event-bus';
import type { Submission, SubmissionStatus } from '@/lib/storage/json-storage';

const COLLECTION = 'submissions';

async function counters() { return getCounters(); }

// MongoDB document shape — _id is ObjectId, numericId is the auto-increment surrogate
interface SubmissionDoc extends Omit<Submission, 'id' | 'status'> {
  _id?: ObjectId;
  numericId: number;
  status: string; // stored as string, cast to SubmissionStatus on read
}

async function col() {
  const db = await getMongoDb();
  return db.collection<SubmissionDoc>(COLLECTION);
}

/** Ensure collection + indexes exist (idempotent). */
export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ numericId: 1 }, { unique: true });
  await c.createIndex({ account: 1 });
  await c.createIndex({ submissionDate: -1 });
}

function docToSubmission(doc: SubmissionDoc): Submission {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, numericId, status, ...rest } = doc;
  return { ...rest, id: numericId, status: status as SubmissionStatus } satisfies Submission;
}

function submissionToDoc(s: Submission): Omit<SubmissionDoc, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = s;
  return { ...rest, numericId: typeof id === 'number' ? id : 0 };
}

/** Get next numeric id from a counters collection (atomic). */
async function nextId(): Promise<number> {
  const c = await counters();
  const result = await c.findOneAndUpdate(
    { _id: 'submissions' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return result!.seq;
}

export async function findAll(): Promise<Submission[]> {
  const c = await col();
  const docs = await c.find({}).sort({ numericId: -1 }).toArray();
  return docs.map(docToSubmission);
}

export async function findById(id: number): Promise<Submission | null> {
  const c = await col();
  const doc = await c.findOne({ numericId: id });
  return doc ? docToSubmission(doc) : null;
}

export async function save(submission: Submission): Promise<Submission> {
  const c = await col();

  if (submission.id) {
    const existing = await c.findOne({ numericId: submission.id });
    if (existing) {
      const doc = submissionToDoc(submission);
      await c.replaceOne({ numericId: submission.id }, doc);
      emitChange('submissions');
      return submission;
    }
  }

  // New submission — assign auto-increment id
  const id = await nextId();
  const doc: SubmissionDoc = { ...submissionToDoc({ ...submission, id }), numericId: id };
  await c.insertOne(doc);
  emitChange('submissions');
  return { ...submission, id };
}

export async function updateStatus(id: number, status: string): Promise<boolean> {
  const c = await col();
  const result = await c.updateOne({ numericId: id }, { $set: { status } });
  return result.matchedCount > 0;
}

export async function deleteById(id: number): Promise<boolean> {
  const c = await col();
  const result = await c.deleteOne({ numericId: id });
  if (result.deletedCount > 0) emitChange('submissions');
  return result.deletedCount > 0;
}

export async function existsById(id: number): Promise<boolean> {
  const c = await col();
  const count = await c.countDocuments({ numericId: id });
  return count > 0;
}

export async function deleteByPeriod(month: number, year: number): Promise<Submission[]> {
  const all = await findAll();
  const toDelete = all.filter(s => {
    const d = new Date(s.submissionDate);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });
  if (toDelete.length === 0) return [];

  const c = await col();
  const ids = toDelete.map(s => s.id as number);
  await c.deleteMany({ numericId: { $in: ids } });
  emitChange('submissions');
  return toDelete;
}
