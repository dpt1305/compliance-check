import { NextRequest, NextResponse } from 'next/server';
import { findById, save, deleteById, existsById } from '@/lib/db/submission-repo';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  const submission = await findById(id);
  if (!submission) return NextResponse.json({ message: `Submission not found: ${id}` }, { status: 404 });
  return NextResponse.json(submission);
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  const submission = await findById(id);
  if (!submission) return NextResponse.json({ message: `Submission not found: ${id}` }, { status: 404 });

  const body = await req.json() as { status?: string };
  const statusStr = body.status?.toUpperCase();

  if (!statusStr) return NextResponse.json({ message: "Field 'status' is required" }, { status: 400 });
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(statusStr)) {
    return NextResponse.json(
      { message: `Invalid status: ${statusStr}. Allowed: PENDING, APPROVED, REJECTED` },
      { status: 400 }
    );
  }

  submission.status = statusStr as 'PENDING' | 'APPROVED' | 'REJECTED';
  const updated = await save(submission);
  return NextResponse.json({
    id: updated.id,
    account: updated.account,
    submissionType: updated.submissionType,
    status: updated.status,
    imageUrl: updated.imageUrl,
    imageSavedName: updated.imageSavedName,
    validationResult: updated.validationResult,
    submissionDate: updated.submissionDate,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!await existsById(id)) {
    return NextResponse.json({ message: `Submission not found: ${id}` }, { status: 404 });
  }
  await deleteById(id);
  return new NextResponse(null, { status: 204 });
}
