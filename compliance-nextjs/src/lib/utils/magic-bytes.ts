const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

type ImageType = 'jpeg' | 'png' | 'webp';

function detectType(header: Buffer): ImageType | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
    return 'jpeg';
  if (header.length >= 4 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47)
    return 'png';
  if (
    header.length >= 12 &&
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
  )
    return 'webp';
  return null;
}

function typeMatchesMime(detected: ImageType, declared: string): boolean {
  const m = declared.toLowerCase();
  if (detected === 'jpeg') return m.includes('jpeg') || m.includes('jpg');
  if (detected === 'png') return m.includes('png');
  if (detected === 'webp') return m.includes('webp');
  return false;
}

export function getExtensionFromType(type: ImageType): string {
  return type === 'jpeg' ? '.jpg' : `.${type}`;
}

export function validateImageBuffer(
  buffer: Buffer,
  mimeType: string,
  originalFilename: string,
  sizeBytes: number
): { ext: string } {
  if (sizeBytes > 10 * 1024 * 1024)
    throw new Error('Image file size must not exceed 10MB');

  const ct = mimeType?.toLowerCase();
  if (!ct || !ALLOWED_MIME_TYPES.has(ct))
    throw new Error(`Invalid MIME type: ${mimeType}. Allowed: jpeg, png, webp`);

  const ext = originalFilename?.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(ext))
    throw new Error(`Invalid file extension: .${ext}. Allowed: .jpg, .jpeg, .png, .webp`);

  const header = buffer.subarray(0, 12);
  const detected = detectType(header);
  if (!detected)
    throw new Error('File does not match a recognized image format (JPEG, PNG, or WEBP)');

  if (!typeMatchesMime(detected, mimeType))
    throw new Error(`File content mismatch: declared MIME type '${mimeType}' does not match actual file content (${detected})`);

  return { ext: getExtensionFromType(detected) };
}
