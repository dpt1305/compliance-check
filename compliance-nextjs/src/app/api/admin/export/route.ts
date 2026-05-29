import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/services/excel-export';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sp = req.nextUrl.searchParams;
    const sortCol = sp.get('sortCol') ?? 'name';
    const sortDir = (sp.get('sortDir') ?? 'asc') as 'asc' | 'desc';
    const buffer = await generateReport(sortCol, sortDir);
    const filename = `compliance-report-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.xlsx`;
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ message: 'Failed to generate report' }, { status: 500 });
  }
}
