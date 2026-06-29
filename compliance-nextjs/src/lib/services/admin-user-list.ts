import { findAll } from '@/lib/db/submission-repo';
import {
  readAll,
  readActive,
  matchesTrackingRow,
  getDistinctProjects,
} from '@/lib/db/tracking-repo';

export interface UserListEntry {
  source: 'tracking' | 'submission' | 'both';
  trackingRowNum?: number;
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

export interface UserListQuery {
  offset?: number;
  limit?: number;
  projects?: string[] | null;
  month?: number | null;
  year?: number | null;
  tags?: string[];
  callerRole?: string;
  callerTeams?: string[];
  sortCol?: string;
  sortDir?: 'asc' | 'desc';
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

function normStr(v: string | null | undefined) {
  return (v ?? '').trim().toLowerCase();
}

function pickBest<T extends { id: number; submissionDate: string }>(list: T[]): T {
  return list.slice().sort((a, b) =>
    new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime()
  )[0];
}

function sortValue(row: UserListEntry, col: string): string {
  switch (col) {
    case 'project':
      return row.project ?? '';
    case 'name':
      return row.name ?? '';
    case 'account':
      return (row.trackingAccount ?? row.account ?? '').toLowerCase();
    case 'email':
      return row.email ?? '';
    case 'serial':
      return row.serial ?? '';
    case 'type':
      return row.deviceType ?? row.submissionType ?? '';
    case 'status':
      return row.submissionStatus ?? '';
    case 'malwareAlerts':
      return row.malwareAlerts ?? '';
    case 'complianceChecks':
      return row.complianceChecks ?? '';
    case 'seedConfig':
      return row.seedConfiguration ?? '';
    case 'os':
      return row.operatingSystem ?? '';
    case 'submitted':
      return row.submissionDate ?? '';
    default:
      return '';
  }
}

export function compareUserListRows(
  rowA: UserListEntry,
  rowB: UserListEntry,
  sortCol: string,
  sortDir: 'asc' | 'desc',
) {
  const va = sortValue(rowA, sortCol);
  const vb = sortValue(rowB, sortCol);
  const cmp =
    sortCol === 'submitted'
      ? new Date(va || 0).getTime() - new Date(vb || 0).getTime()
      : va.localeCompare(vb, undefined, { sensitivity: 'base', numeric: true });
  return sortDir === 'asc' ? cmp : -cmp;
}

export async function buildUserListEntries(): Promise<UserListEntry[]> {
  const [trackingRows, submissions, allTrackingRows] = await Promise.all([
    readActive(),
    findAll(),
    readAll(),
  ]);

  const parsedSubs = submissions.map(s => {
    let deviceSerial: string | null = s.deviceSerial ?? null;
    let deviceName: string | null = s.deviceName ?? null;
    if (!deviceSerial || !deviceName) {
      try {
        const r = JSON.parse(s.validationResult ?? '{}') as { deviceSerial?: string; deviceName?: string };
        deviceSerial ??= r.deviceSerial ?? null;
        deviceName ??= r.deviceName ?? null;
      } catch {
        // ignore invalid JSON
      }
    }
    return { ...s, deviceSerial, deviceName };
  });

  const entries: UserListEntry[] = [];
  const matchedSubmissionIds = new Set<number>();

  const trackingIdentifiers = new Set<string>();
  for (const row of allTrackingRows) {
    if (row.account) trackingIdentifiers.add(normStr(row.account));
    if (row.email) trackingIdentifiers.add(normStr(row.email));
    if (row.serial) trackingIdentifiers.add(normStr(row.serial));
  }

  for (const row of trackingRows) {
    const allMatches = parsedSubs.filter(s =>
      !matchedSubmissionIds.has(s.id) &&
      matchesTrackingRow(row, s.deviceSerial, s.deviceName, s.account)
    );

    if (allMatches.length > 0) {
      for (const match of allMatches) matchedSubmissionIds.add(match.id);

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
      continue;
    }

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

  for (const submission of parsedSubs) {
    if (matchedSubmissionIds.has(submission.id)) continue;

    const normAccount = normStr(submission.account);
    const normSerial = normStr(submission.deviceSerial);
    if (
      (normAccount && trackingIdentifiers.has(normAccount)) ||
      (normSerial && trackingIdentifiers.has(normSerial))
    ) {
      continue;
    }

    entries.push({
      source: 'submission',
      name: submission.deviceName ?? submission.account,
      account: submission.account,
      submissionId: submission.id,
      submissionType: submission.submissionType,
      submissionStatus: submission.status,
      submissionDate: submission.submissionDate,
      imageUrl: submission.imageUrl,
      confidenceScore: submission.confidenceScore,
      deviceSerial: submission.deviceSerial ?? undefined,
      deviceName: submission.deviceName ?? undefined,
      validationResult: submission.validationResult ?? undefined,
      malwareAlerts: submission.malwareAlerts,
      complianceChecks: submission.complianceCheck,
      seedConfiguration: submission.seedConfiguration,
      operatingSystem: submission.operatingSystem,
    });
  }

  return entries;
}

export function filterUserListEntries(entries: UserListEntry[], query: UserListQuery): UserListEntry[] {
  const filterProjects = query.projects ?? null;
  const month = query.month ?? null;
  const year = query.year ?? null;
  const tags = (query.tags ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean);
  const callerRole = query.callerRole ?? 'Admin';
  const callerTeams = query.callerTeams ?? [];
  const hasPeriod = month !== null && year !== null && month >= 1 && month <= 12 && year > 0;

  let result = entries;
  if (filterProjects !== null) {
    result = result.filter(row => filterProjects.includes(row.project ?? ''));
  }

  if (hasPeriod) {
    result = result
      .map(entry => applyPeriodMask(entry, month, year))
      .filter(Boolean) as UserListEntry[];
  }

  if (tags.length > 0) {
    result = result.filter(row =>
      tags.some(tag =>
        SEARCH_KEYS.some(key => {
          const val = row[key];
          return typeof val === 'string' && val.toLowerCase().includes(tag);
        })
      )
    );
  }

  if (callerRole === 'Teamlead' && callerTeams.length > 0) {
    result = result.filter(row => {
      const project = (row.project ?? '').trim().toLowerCase();
      return callerTeams.some(team => team.trim().toLowerCase() === project);
    });
  } else if (callerRole === 'Teamlead' && callerTeams.length === 0) {
    result = [];
  }

  return result;
}

export async function getUserListData(query: UserListQuery = {}): Promise<UserListResponse> {
  const offset = Math.max(0, query.offset ?? 0);
  const limit =
    query.limit === undefined
      ? undefined
      : Math.max(1, Math.min(99999, query.limit));
  const sortCol = query.sortCol;
  const sortDir = query.sortDir ?? 'asc';

  let result = filterUserListEntries(await buildUserListEntries(), query);
  if (sortCol) {
    result = [...result].sort((a, b) => compareUserListRows(a, b, sortCol, sortDir));
  }

  const total = result.length;
  const items = limit === undefined ? result.slice(offset) : result.slice(offset, offset + limit);
  const projects = await getDistinctProjects();
  const summary = {
    approved: result.filter(row => row.submissionStatus === 'APPROVED').length,
    submitted: result.filter(row => row.submissionStatus && row.submissionStatus !== 'NOT_SUBMITTED').length,
    notSubmitted: result.filter(row => !row.submissionStatus || row.submissionStatus === 'NOT_SUBMITTED').length,
  };

  return { items, total, projects, summary };
}
