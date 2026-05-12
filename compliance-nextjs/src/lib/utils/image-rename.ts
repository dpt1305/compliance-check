import crypto from 'crypto';

function sanitize(input: string): string {
  return (input ?? 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function uuid8(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

export function generateSavedName(userId: string, submissionType: string, ext: string): string {
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `${sanitize(userId)}_${sanitize(submissionType)}_${today()}_${uuid8()}${cleanExt}`;
}
