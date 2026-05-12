import { NextRequest, NextResponse } from 'next/server';
import { findAll, deleteByPeriod } from '@/lib/storage/json-storage';
import { deleteImage } from '@/lib/utils/file-storage';

export async function GET(): Promise<NextResponse> {
  const submissions = findAll();
  return NextResponse.json(
    submissions.map(s => ({
      id: s.id,
      account: s.account,
      submissionType: s.submissionType,
      status: s.status,
      imageUrl: s.imageUrl,
      imageSavedName: s.imageSavedName,
      validationResult: s.validationResult,
      submissionDate: s.submissionDate,
      confidenceScore: s.confidenceScore,
      malwareAlerts: s.malwareAlerts,
      complianceCheck: s.complianceCheck,
      seedConfiguration: s.seedConfiguration,
      operatingSystem: s.operatingSystem,
      deviceSerial: s.deviceSerial,
      deviceName: s.deviceName,
    }))
  );
}

/**
 * DELETE /api/admin/submissions?month=4&year=2026
 * Permanently removes all submissions and their image files for the given month/year.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const month  = parseInt(params.get('month') ?? '', 10);
  const year   = parseInt(params.get('year')  ?? '', 10);

  if (!month || !year || month < 1 || month > 12 || year < 2000) {
    return NextResponse.json({ message: 'Valid month (1-12) and year are required' }, { status: 400 });
  }

  const deleted = deleteByPeriod(month, year);

  // Remove image files for each deleted submission
  let imagesDeleted = 0;
  for (const s of deleted) {
    if (s.imageSavedName) {
      try { await deleteImage(s.imageSavedName); imagesDeleted++; } catch { /* already gone */ }
    }
  }

  return NextResponse.json({
    deleted: deleted.length,
    imagesDeleted,
    message: `Deleted ${deleted.length} submission(s) and ${imagesDeleted} image file(s)`,
  });
}
