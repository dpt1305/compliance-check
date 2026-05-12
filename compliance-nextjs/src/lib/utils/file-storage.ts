import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ── S3 helpers ────────────────────────────────────────────────────────────────
//
// Credential resolution order (handled automatically by the AWS SDK):
//   1. Environment variables — AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
//      → used for local development (set in .env.local)
//   2. ~/.aws/credentials file
//      → alternative for local dev via `aws configure`
//   3. EC2 Instance Metadata Service (IMDS)
//      → used automatically in production when an IAM Role is attached to the instance
//      → no credentials needed in .env.production
//
// To switch between local and EC2: simply omit AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// from .env.production and attach the IAM Role to the EC2 instance instead.

function s3Client(): S3Client | null {
  if (!process.env.AWS_S3_BUCKET) return null;
  return new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
}

function bucket(): string { return process.env.AWS_S3_BUCKET ?? ''; }

function s3Key(savedName: string): string {
  const prefix = (process.env.AWS_S3_PREFIX ?? 'images').replace(/\/$/, '');
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
