import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ── Cloudflare R2 helpers (S3-compatible API) ─────────────────────────────────
//
// R2 is accessed through the AWS S3 SDK with a custom endpoint:
//   https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
// Credentials are an R2 API token (Access Key ID + Secret) — there is no
// instance-role fallback like on AWS, so the keys must be set in the env.
//
// Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// Optional env: R2_PREFIX (default "images") — object key = <prefix>/<savedName>
// When R2_BUCKET is unset the app falls back to the local ./data/images folder.

let cachedClient: S3Client | null = null;

function s3Client(): S3Client | null {
  if (!process.env.R2_BUCKET) return null;
  if (cachedClient) return cachedClient;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2_BUCKET is set but R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY is missing',
    );
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 does not need the newer default CRC32 checksums on every request.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return cachedClient;
}

function bucket(): string { return process.env.R2_BUCKET ?? ''; }

function s3Key(savedName: string): string {
  const prefix = (process.env.R2_PREFIX ?? 'images').replace(/\/$/, '');
  return `${prefix}/${savedName}`;
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function localDir(): string {
  const p = process.env.STORAGE_IMAGE_PATH ?? './data/images';
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function safeLocalPath(savedName: string): string {
  const dir = localDir();
  const target = path.join(dir, savedName);
  if (!target.startsWith(path.resolve(dir)))
    throw new Error('Path traversal attempt: ' + savedName);
  return target;
}

// ── Public URL ────────────────────────────────────────────────────────────────

/**
 * Always returns our own /api/images/<name> URL so images are served through
 * the app regardless of storage backend (local or S3).
 * The base comes from STORAGE_IMAGE_BASE_URL (set it to your EC2 / domain URL).
 */
export function getPublicUrl(savedName: string): string {
  const base = (process.env.STORAGE_IMAGE_BASE_URL ?? 'http://localhost:3000/api/images/').replace(/\/$/, '');
  return `${base}/${savedName}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp',
};

export async function storeImage(buffer: Buffer, savedName: string): Promise<void> {
  const client = s3Client();
  if (client) {
    await client.send(new PutObjectCommand({
      Bucket: bucket(),
      Key: s3Key(savedName),
      Body: buffer,
      ContentType: MIME[path.extname(savedName).toLowerCase()] ?? 'image/jpeg',
    }));
    return;
  }
  // Local fallback
  const dir = localDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(safeLocalPath(savedName), buffer);
}

// ── Retrieve ──────────────────────────────────────────────────────────────────

export async function getImageBuffer(savedName: string): Promise<Buffer | null> {
  const client = s3Client();
  if (client) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: s3Key(savedName) }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch { return null; }
  }
  // Local fallback
  try {
    const target = safeLocalPath(savedName);
    return fs.existsSync(target) ? fs.readFileSync(target) : null;
  } catch { return null; }
}

/**
 * Returns a presigned S3 URL (for redirect-based serving).
 * Returns null when using local storage.
 */
export async function getPresignedUrl(savedName: string, expiresIn = 3600): Promise<string | null> {
  const client = s3Client();
  if (!client) return null;
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket(), Key: s3Key(savedName) }),
      { expiresIn },
    );
  } catch { return null; }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteImage(savedName: string): Promise<void> {
  const client = s3Client();
  if (client) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: s3Key(savedName) }));
    return;
  }
  // Local fallback
  try {
    const target = safeLocalPath(savedName);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch { /* already gone */ }
}

// ── R2 Lifecycle Rule (TTL) ───────────────────────────────────────────────────

/**
 * Idempotently applies a lifecycle rule that automatically expires objects
 * under the configured prefix after SUBMISSION_TTL_DAYS days (default: 90).
 *
 * No-op when R2 is not configured (R2_BUCKET is unset).
 *
 * The R2 API token needs "Admin Read & Write" (bucket-level) permission to set
 * lifecycle rules; with "Object Read & Write" only, this logs an error and the
 * app keeps working (set the rule once in the Cloudflare dashboard instead).
 */
export async function ensureStorageLifecycleRule(): Promise<void> {
  const client = s3Client();
  if (!client) return; // local filesystem — nothing to do

  const ttlDays = (() => {
    const d = parseInt(process.env.SUBMISSION_TTL_DAYS ?? '90', 10);
    return Number.isFinite(d) && d > 0 ? d : 90;
  })();

  const prefix = (process.env.R2_PREFIX ?? 'images').replace(/\/$/, '') + '/';

  try {
    await client.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket(),
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'compliance-submission-ttl',
            Status: 'Enabled',
            Filter: { Prefix: prefix },
            Expiration: { Days: ttlDays },
          },
        ],
      },
    }));
    console.log(`[r2-lifecycle] Set expiry rule: ${bucket()}/${prefix}* expires after ${ttlDays} day(s)`);
  } catch (err) {
    // Non-fatal — log and continue. The app still works without the lifecycle rule.
    console.error('[r2-lifecycle] Failed to set lifecycle rule:', (err as Error).message);
  }
}
