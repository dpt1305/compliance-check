/**
 * MongoDB submission metadata repository.
 * Stores flexible key-value pairs per submission for dynamic config fields.
 */
import { ObjectId } from 'mongodb';
import { getMongoDb } from './connection';

const COLLECTION = 'submissions_metadata';

export interface SubmissionMetadata {
  _id?: ObjectId;
  submissionId: number;
  fieldKey: string;
  fieldValue: string;
}

async function col() {
  const db = await getMongoDb();
  return db.collection<SubmissionMetadata>(COLLECTION);
}

export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ submissionId: 1 });
  await c.createIndex({ submissionId: 1, fieldKey: 1 }, { unique: true });
}

export async function findBySubmissionId(submissionId: number): Promise<Map<string, string>> {
  const c = await col();
  const docs = await c.find({ submissionId }).toArray();
  const map = new Map<string, string>();
  for (const doc of docs) {
    map.set(doc.fieldKey, doc.fieldValue ?? '');
  }
  return map;
}

export async function bulkInsert(submissionId: number, entries: { fieldKey: string; fieldValue: string }[]): Promise<void> {
  if (entries.length === 0) return;
  const c = await col();
  const docs: SubmissionMetadata[] = entries.map(e => ({
    submissionId,
    fieldKey: e.fieldKey,
    fieldValue: e.fieldValue,
  }));
  await c.insertMany(docs);
}

export async function upsertField(submissionId: number, fieldKey: string, fieldValue: string): Promise<void> {
  const c = await col();
  await c.updateOne(
    { submissionId, fieldKey },
    { $set: { fieldValue } },
    { upsert: true },
  );
}

export async function deleteBySubmissionId(submissionId: number): Promise<void> {
  const c = await col();
  await c.deleteMany({ submissionId });
}
