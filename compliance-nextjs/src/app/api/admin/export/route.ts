import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/services/excel-export';
import { COOKIE_NAME, extractBearerToken, verifyToken } from '@/lib/auth/jwt';
import { findByUsername } from '@/lib/db/admin-repo';
import { getUserListData } from '@/lib/services/admin-user-list';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sp = req.nextUrl.searchParams;
    const sortCol = sp.get('sortCol') ?? 'name';
    const sortDir = (sp.get('sortDir') ?? 'asc') as 'asc' | 'desc';
    const projectsParam = sp.getAll('project');
    const monthParam = sp.get('month');
    const yearParam = sp.get('year');
    const month = monthParam ? parseInt(monthParam, 10) : null;
    const year = yearParam ? parseInt(yearParam, 10) : null;

    const bearerToken = extractBearerToken(req.headers.get('authorization'));
    const cookieToken = req.cookies.get(COOKIE_NAME)?.value ?? null;
    const token = bearerToken ?? cookieToken;
    const callerUsername = token ? await verifyToken(token) : null;

    let callerRole = 'Admin';
    let callerTeams: string[] = [];
    if (callerUsername) {
      const caller = await findByUsername(callerUsername);
      if (caller) {
        callerRole = caller.role ?? 'Admin';
        try {
          callerTeams = JSON.parse(caller.teams ?? '[]') as string[];
        } catch {
          callerTeams = [];
        }
      }
    }

    const { items } = await getUserListData({
      projects: projectsParam.length > 0 ? projectsParam : null,
      month,
      year,
      tags: sp.getAll('tag'),
      callerRole,
      callerTeams,
      sortCol,
      sortDir,
    });

    const buffer = await generateReport(items);
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
