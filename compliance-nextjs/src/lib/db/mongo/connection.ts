/**
 * MongoDB singleton client.
 * Reused across hot-reloads in dev and across serverless invocations in production.
 */
import { MongoClient, Db, type Collection } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

let _db: Db | null = null;

export function getMongoUri(): string | undefined {
  return process.env.MONGODB_URI;
}

export function isMongoEnabled(): boolean {
  return !!getMongoUri();
}

export async function getMongoDb(): Promise<Db> {
  if (_db) return _db;

  const uri = getMongoUri();
  if (!uri) throw new Error('MONGODB_URI is not set');

  const dbName = process.env.MONGODB_DB_NAME ?? 'compliance';

  if (!globalThis._mongoClient) {
    globalThis._mongoClient = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    await globalThis._mongoClient.connect();
  }

  _db = globalThis._mongoClient.db(dbName);
  return _db;
}

/** Counter document shape — uses string _id for named counters. */
export type CounterDoc = { _id: string; seq: number };

/** Get a typed reference to the `_counters` collection (avoids InferIdType<ObjectId> conflicts). */
export async function getCounters(): Promise<Collection<CounterDoc>> {
  const db = await getMongoDb();
  return db.collection('_counters') as unknown as Collection<CounterDoc>;
}
