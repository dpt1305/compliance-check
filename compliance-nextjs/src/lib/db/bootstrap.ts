import { initDefaultAdmin } from './admin-repo';

let bootstrapPromise: Promise<void> | null = null;

async function backfillSubmissionCreatedAt(): Promise<void> {
  try {
    const db = await import('./mongo/connection').then(m => m.getMongoDb());
    const col = db.collection('submissions');
    const result = await col.updateMany(
      { createdAt: { $exists: false } },
      [
        {
          $set: {
            createdAt: {
              $cond: {
                if: { $and: [{ $ne: ['$submissionDate', null] }, { $ne: ['$submissionDate', ''] }] },
                then: { $dateFromString: { dateString: '$submissionDate', onError: '$$NOW', onNull: '$$NOW' } },
                else: '$$NOW',
              },
            },
          },
        },
      ],
    );
    if (result.modifiedCount > 0) {
      console.log(`[db-bootstrap] backfilled createdAt on ${result.modifiedCount} submission(s)`);
    }
  } catch (err) {
    console.error('[db-bootstrap] createdAt backfill failed:', (err as Error).message);
  }
}

async function bootstrapMongo(): Promise<void> {
  const [
    { ensureIndexes: ensureSubmissionIndexes },
    { ensureIndexes: ensureAdminIndexes },
    { ensureIndexes: ensureTrackingIndexes },
    { ensureIndexes: ensureAttendanceIndexes },
  ] = await Promise.all([
    import('./mongo/submission-repo'),
    import('./mongo/admin-repo'),
    import('./mongo/tracking-repo'),
    import('./mongo/attendance-repo'),
  ]);

  await Promise.all([
    ensureSubmissionIndexes(),
    ensureAdminIndexes(),
    ensureTrackingIndexes(),
    ensureAttendanceIndexes(),
  ]);

  await initDefaultAdmin();
  await backfillSubmissionCreatedAt();

  const { ensureS3LifecycleRule } = await import('@/lib/utils/file-storage');
  await ensureS3LifecycleRule();
}

export async function ensureDbReady(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapMongo().catch(err => {
      bootstrapPromise = null;
      throw err;
    });
  }

  await bootstrapPromise;
}
