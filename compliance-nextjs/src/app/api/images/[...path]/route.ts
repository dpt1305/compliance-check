import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUrl, getImageBuffer } from '@/lib/utils/file-storage';
import path from 'path';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path: pathParts } = await params;
  const filename = pathParts.join('/');

  if (filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  const contentType = MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
  const forceDownload = req.nextUrl.searchParams.has('dl');

  // Download mode: always proxy bytes so the browser `download` attribute works
  // (cross-origin redirects lose the download hint, so we stream the file directly)
  if (forceDownload) {
    const buffer = await getImageBuffer(filename);
    if (!buffer) return NextResponse.json({ message: 'Image not found' }, { status: 404 });
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // View mode: redirect to presigned S3 URL (zero proxying overhead)
  const presigned = await getPresignedUrl(filename);
  if (presigned) {
    return NextResponse.redirect(presigned, { status: 302 });
  }

  // Local fallback: proxy directly
  const buffer = await getImageBuffer(filename);
  if (!buffer) return NextResponse.json({ message: 'Image not found' }, { status: 404 });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
