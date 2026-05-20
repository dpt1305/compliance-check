import { NextRequest, NextResponse } from 'next/server';
import { findAll } from '@/lib/db/submission-repo';
import {
  readAll, readActive, insertMember, updateMember, deleteMember,
  matchesTrackingRow, getDistinctProjects,
} from '@/lib/db/tracking-repo';

export interface UserListEntry {
  source: 'tracking' | 'submission' | 'both';

  // From tracking DB
  trackingRowNum?: number;   // maps to DB id
  trackingNo?: number | null;
  project?: string;
  name: string;
  email?: string;
  serial?: string;
  trackingAccount?: string;
  deviceType?: string;
  malwareAlerts?: string;
  complianceChecks?: string;
  seedConfiguration?: string;
  operatingSystem?: string;
  followUpAction?: string;
  responseFromTicket?: string;
  trackingStatus?: string;

  // From submission (if matched)
  submissionId?: number;
  account?: string;
  submissionType?: string;
  submissionStatus?: string;
  submissionDate?: string;
  imageUrl?: string;
  confidenceScore?: number;
  deviceSerial?: string;
  deviceName?: string;
  validationResult?: string;
}

export interface UserListResponse {
  items: UserListEntry[];
  total: number;
  projects: string[];
  summary: { approved: number; submitted: number; notSubmitted: number };
}

const SEARCH_KEYS: (keyof UserListEntry)[] = [
  'name', 'account', 'trackingAccount', 'email', 'serial', 'project',
  'submissionType', 'deviceType', 'malwareAlerts', 'complianceChecks',
  'seedConfiguration', 'operatingSystem', 'followUpAction', 'responseFromTicket',
  'trackingStatus', 'submissionStatus', 'deviceSerial', 'deviceName', 'source',
];

function applyPeriodMask(entry: UserListEntry, month: number, year: number): UserListEntry | null {
  if (!entry.submissionDate) {
    return entry.source === 'submission' ? null : entry;
  }
  const d = new Date(entry.submissionDate);
  const inPeriod = d.getMonth() + 1 === month && d.getFullYear() === year;
  if (inPeriod) return entry;
  if (entry.source === 'submission') return null;
  return {
    ...entry,
    submissionId: undefined,
    submissionStatus: 'NOT_SUBMITTED',
    submissionDate: undefined,
    imageUrl: undefined,
    validationResult: undefined,
    deviceSerial: undefined,
    deviceName: undefined,
    malwareAlerts: '',
    complianceChecks: '',
    seedConfiguration: '',
    operatingSystem: '',
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0);
  const limit  = Math.max(1, Math.min(99999, parseInt(sp.get('limit') ?? '50', 10) || 50));
  const projectsParam = sp.getAll('project');
  const filterProjects: string[] | null = projectsParam.length > 0 ? projectsParam : null;
  const monthParam = sp.get('month');
  const yearParam  = sp.get('year');
  const tagsParam  = sp.getAll('tag');

  const month = monthParam ? parseInt(monthParam, 10) : null;
  const year  = yearParam  ? parseInt(yearParam,  10) : null;
  const hasPeriod = month !== null && year !== null && month >= 1 && month <= 12 && year > 0;
  const trackingRows = await readActive();
  const submissions  = await findAll();

  // Parse AI identifiers from each submission's validationResult
  const parsedSubs = submissions.map(s => {
    let deviceSerial: string | null = s.deviceSerial ?? null;
    let deviceName: string | null = s.deviceName ?? null;
    if (!deviceSerial || !deviceName) {
      try {
        const r = JSON.parse(s.validationResult ?? '{}') as { deviceSerial?: string; deviceName?: string };
        deviceSerial ??= r.deviceSerial ?? null;
        deviceName  ??= r.deviceName  ?? null;
      } catch { /* ignore */ }
    }
    return { ...s, deviceSerial, deviceName };
  });

  const entries: UserListEntry[] = [];
  const matchedSubmissionIds = new Set<number>();

  /** Pick the most recent submission (latest submissionDate wins). */
  function pickBest<T extends { id: number; status: string; submissionDate: string }>(list: T[]): T {
    return list.slice().sort((a, b) =>
      new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime()
    )[0];
  }

  // Build a normalised lookup of ALL tracking member identifiers (including removed ones)
  // so we can suppress unlinked-submission rows whose owner is already known to the system.
  function normStr(v: string | null | undefined) { return (v ?? '').trim().toLowerCase(); }
  const trackingIdentifiers = new Set<string>();
  for (const row of await readAll()) {          // readAll = active + removed
    if (row.account) trackingIdentifiers.add(normStr(row.account));
    if (row.email)   trackingIdentifiers.add(normStr(row.email));
    if (row.serial)  trackingIdentifiers.add(normStr(row.serial));
  }

  for (const row of trackingRows) {
    // Collect ALL submissions matching this tracking row (case-insensitive account + serial)
    const allMatches = parsedSubs.filter(s =>
      !matchedSubmissionIds.has(s.id) &&
      matchesTrackingRow(row, s.deviceSerial, s.deviceName, s.account)
    );

    if (allMatches.length > 0) {
      // Mark every match so none appear as unlinked submissions
      for (const m of allMatches) matchedSubmissionIds.add(m.id);

      // Display only the best submission for this member
      const best = pickBest(allMatches);
      entries.push({
        source: 'both',
        trackingRowNum: row.id,
        trackingNo: row.no,
        project: row.project ?? undefined,
        name: row.name,
        email: row.email ?? undefined,
        serial: row.serial ?? undefined,
        trackingAccount: row.account ?? undefined,
        deviceType: row.deviceType ?? undefined,
        malwareAlerts: row.malwareAlerts ?? undefined,
        complianceChecks: row.complianceChecks ?? undefined,
        seedConfiguration: row.seedConfiguration ?? undefined,
        operatingSystem: row.operatingSystem ?? undefined,
        followUpAction: row.followUpAction ?? undefined,
        responseFromTicket: row.responseFromTicket ?? undefined,
        trackingStatus: row.trackingStatus ?? undefined,
        submissionId: best.id,
        account: best.account,
        submissionType: best.submissionType,
        submissionStatus: best.status,
        submissionDate: best.submissionDate,
        imageUrl: best.imageUrl,
        confidenceScore: best.confidenceScore,
        deviceSerial: best.deviceSerial ?? undefined,
        deviceName: best.deviceName ?? undefined,
        validationResult: best.validationResult ?? undefined,
      });
    } else {
      entries.push({
        source: 'tracking',
        trackingRowNum: row.id,
        trackingNo: row.no,
        project: row.project ?? undefined,
        name: row.name,
        email: row.email ?? undefined,
        serial: row.serial ?? undefined,
        trackingAccount: row.account ?? undefined,
        deviceType: row.deviceType ?? undefined,
        malwareAlerts: row.malwareAlerts ?? undefined,
        complianceChecks: row.complianceChecks ?? undefined,
        seedConfiguration: row.seedConfiguration ?? undefined,
        operatingSystem: row.operatingSystem ?? undefined,
        followUpAction: row.followUpAction ?? undefined,
        responseFromTicket: row.responseFromTicket ?? undefined,
        trackingStatus: row.trackingStatus ?? undefined,
        submissionStatus: 'NOT_SUBMITTED',
      });
    }
  }

  // Submissions without a matching tracking row
  for (const s of parsedSubs) {
    if (matchedSubmissionIds.has(s.id)) continue;

    // If this submission's account / serial belongs to a known tracking member,
    // it is already represented by that member's row — suppress the duplicate.
    const normAccount = normStr(s.account);
    const normSerial  = normStr(s.deviceSerial);
    if (
      (normAccount && trackingIdentifiers.has(normAccount)) ||
      (normSerial  && trackingIdentifiers.has(normSerial))
    ) continue;
    entries.push({
      source: 'submission',
      name: s.deviceName ?? s.account,
      account: s.account,
      submissionId: s.id,
      submissionType: s.submissionType,
      submissionStatus: s.status,
      submissionDate: s.submissionDate,
      imageUrl: s.imageUrl,
      confidenceScore: s.confidenceScore,
      deviceSerial: s.deviceSerial ?? undefined,
      deviceName: s.deviceName ?? undefined,
      validationResult: s.validationResult ?? undefined,
      malwareAlerts: s.malwareAlerts,
      complianceChecks: s.complianceCheck,
      seedConfiguration: s.seedConfiguration,
      operatingSystem: s.operatingSystem,
    });
  }

  // 1. Project filter
  let result = entries;
  if (filterProjects !== null) {
    result = result.filter(r => filterProjects.includes(r.project ?? ''));
  }

  // 2. Period mask
  if (hasPeriod) {
    result = result.map(e => applyPeriodMask(e, month!, year!)).filter(Boolean) as UserListEntry[];
  }

  // 3. Tag search — OR logic: row matches if ANY tag matches ANY string field
  const activeTags = tagsParam.map(t => t.trim().toLowerCase()).filter(Boolean);
  if (activeTags.length > 0) {
    result = result.filter(row =>
      activeTags.some(tag =>
        SEARCH_KEYS.some(key => {
          const val = row[key as keyof UserListEntry];
          return typeof val === 'string' && val.toLowerCase().includes(tag);
        })
      )
    );
  }

  const total = result.length;
  const items = result.slice(offset, offset + limit);
  const projects = await getDistinctProjects();
  const summary = {
    approved:     result.filter(r => r.submissionStatus === 'APPROVED').length,
    submitted:    result.filter(r => r.submissionStatus && r.submissionStatus !== 'NOT_SUBMITTED').length,
    notSubmitted: result.filter(r => !r.submissionStatus || r.submissionStatus === 'NOT_SUBMITTED').length,
  };

  return NextResponse.json({ items, total, projects, summary } satisfies UserListResponse);
}

interface AddMemberBody {
  project?: string;
  name?: string;
  email?: string;
  serial?: string;
  account?: string;
  deviceType?: string;
}

interface UpdateMemberBody {
  rowNum?: number;
  project?: string;
  name?: string;
  email?: string;
  serial?: string;
  account?: string;
  deviceType?: string;
  trackingStatus?: string;
}

function trimValue(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as AddMemberBody;
    const name = trimValue(body.name);
    if (!name) {
      return NextResponse.json({ message: 'Name is required' }, { status: 400 });
    }

    const email = trimValue(body.email);
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ message: 'Email is invalid' }, { status: 400 });
    }

    const inserted = await insertMember({
      project:   trimValue(body.project) || null,
      name,
      email:     email || null,
      serial:    trimValue(body.serial) || null,
      account:   trimValue(body.account) || null,
      deviceType: trimValue(body.deviceType) || null,
      malwareAlerts: null,
      complianceChecks: null,
      seedConfiguration: null,
      operatingSystem: null,
      followUpAction: 'Default',
      responseFromTicket: 'Refer photo captured in folder',
      trackingStatus: 'Ok',
    });

    return NextResponse.json({ message: 'Member added successfully', rowNum: inserted.id }, { status: 201 });
  } catch (err) {
    console.error('[user-list-add-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to add member' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as UpdateMemberBody;
    const id = Number(body.rowNum);
    if (!id || id < 1) {
      return NextResponse.json({ message: 'Valid rowNum is required' }, { status: 400 });
    }

    const name = body.name !== undefined ? trimValue(body.name) : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ message: 'Name cannot be empty' }, { status: 400 });
    }

    const email = body.email !== undefined ? trimValue(body.email) : undefined;
    if (email !== undefined && email && !isValidEmail(email)) {
      return NextResponse.json({ message: 'Email is invalid' }, { status: 400 });
    }

    const updated = await updateMember(id, {
      ...(body.project !== undefined   && { project: trimValue(body.project) || null }),
      ...(name !== undefined           && { name }),
      ...(email !== undefined          && { email: email || null }),
      ...(body.serial !== undefined    && { serial: trimValue(body.serial) || null }),
      ...(body.account !== undefined   && { account: trimValue(body.account) || null }),
      ...(body.deviceType !== undefined && { deviceType: trimValue(body.deviceType) || null }),
      ...(body.trackingStatus !== undefined && { trackingStatus: trimValue(body.trackingStatus) || null }),
    });

    if (!updated) return NextResponse.json({ message: `Tracking row not found: ${id}` }, { status: 404 });
    return NextResponse.json({ message: 'Member updated successfully', rowNum: id });
  } catch (err) {
    console.error('[user-list-update-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const id = Number(req.nextUrl.searchParams.get('rowNum'));
    if (!id || id < 1) {
      return NextResponse.json({ message: 'Valid rowNum is required' }, { status: 400 });
    }

    const ok = await deleteMember(id);
    if (!ok) return NextResponse.json({ message: `Tracking row not found: ${id}` }, { status: 404 });
    return NextResponse.json({ message: 'Member deleted successfully', rowNum: id });
  } catch (err) {
    console.error('[user-list-delete-member] Failed:', (err as Error).message);
    return NextResponse.json({ message: 'Failed to delete member' }, { status: 500 });
  }
}

