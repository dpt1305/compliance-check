import { NextRequest, NextResponse } from 'next/server';
import { getMapping } from '@/lib/services/excel-mapping';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
): Promise<NextResponse> {
  const { type } = await params;
  const mapping = getMapping(type);
  if (!mapping) return NextResponse.json({ message: 'Type not found' }, { status: 404 });
  return NextResponse.json(mapping);
}
