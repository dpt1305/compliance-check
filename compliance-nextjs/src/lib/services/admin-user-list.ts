import { findAll } from '@/lib/db/submission-repo';
import {
  readActive,
  matchesTrackingRow,
  getDistinctProjects,
  type TrackingMember,
} from '@/lib/db/tracking-repo';
import type { Submission } from '@/lib/storage/json-storage';
import { buildProjectMatcher, dedupeProjects } from '@/lib/utils/project-filter';

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

export type ParsedSubmission = Omit<Submission, 'deviceSerial' | 'deviceName'> & {
  deviceSerial: string | null;
  deviceName: string | null;
};

interface SubmissionMatchIndex {
  parsedSubmissions: ParsedSubmission[];
  submissionsWithAccount: ParsedSubmission[];
  bySerial: Map<string, ParsedSubmission[]>;
  byDeviceName: Map<string, ParsedSubmission[]>;
  byAccount: Map<string, ParsedSubmission[]>;
}

function addToIndex(
  index: Map<string, ParsedSubmission[]>,
  key: string | null | undefined,
  submission: ParsedSubmission,
) {
  const normalized = normStr(key);
  if (!normalized) return;
  const existing = index.get(normalized);
  if (existing) {
    existing.push(submission);
  } else {
    index.set(normalized, [submission]);
  }
}

export function parseSubmissionIdentifiers(submissions: Submission[]): ParsedSubmission[] {
  return submissions.map(submission => {
    let deviceSerial: string | null = submission.deviceSerial ?? null;
    let deviceName: string | null = submission.deviceName ?? null;
    if (!deviceSerial || !deviceName) {
      try {
        const parsed = JSON.parse(submission.validationResult ?? '{}') as {
          deviceSerial?: string;
          deviceName?: string;
        };
        deviceSerial ??= parsed.deviceSerial ?? null;
        deviceName ??= parsed.deviceName ?? null;
      } catch {
        // ignore invalid JSON
      }
    }
    return { ...submission, deviceSerial, deviceName };
  });
}

export function buildSubmissionMatchIndex(submissions: Submission[]): SubmissionMatchIndex {
  const parsedSubmissions = parseSubmissionIdentifiers(submissions);
  const bySerial = new Map<string, ParsedSubmission[]>();
  const byDeviceName = new Map<string, ParsedSubmission[]>();
  const byAccount = new Map<string, ParsedSubmission[]>();

  for (const submission of parsedSubmissions) {
    addToIndex(bySerial, submission.deviceSerial, submission);
    addToIndex(byDeviceName, submission.deviceName, submission);
    addToIndex(byAccount, submission.account, submission);
  }

  return {
    parsedSubmissions,
    submissionsWithAccount: parsedSubmissions.filter(submission => !!normStr(submission.account)),
    bySerial,
    byDeviceName,
    byAccount,
  };
}

export function getMatchesForTrackingRow(
  row: Pick<TrackingMember, 'serial' | 'name' | 'account' | 'email'>,
  index: SubmissionMatchIndex,
  excludeSubmissionIds?: Set<number>,
): ParsedSubmission[] {
  const candidateMap = new Map<number, ParsedSubmission>();

  const addCandidate = (candidate: ParsedSubmission) => {
    if (excludeSubmissionIds?.has(candidate.id)) return;
    candidateMap.set(candidate.id, candidate);
  };

  const addCandidates = (candidates?: ParsedSubmission[]) => {
    if (!candidates) return;
    for (const candidate of candidates) addCandidate(candidate);
  };

  addCandidates(index.bySerial.get(normStr(row.serial)));
  addCandidates(index.byDeviceName.get(normStr(row.name)));
  addCandidates(index.byAccount.get(normStr(row.account)));
  addCandidates(index.byAccount.get(normStr(row.email)));
  addCandidates(index.byAccount.get(normStr(row.name)));

  if (candidateMap.size === 0) {
    const serialNorm = normStr(row.serial);
    const emailNorm = normStr(row.email);
    for (const submission of index.submissionsWithAccount) {
      const accountNorm = normStr(submission.account);
      if (!accountNorm) continue;
      if (
        (serialNorm && serialNorm.includes(accountNorm)) ||
        (emailNorm && emailNorm.includes(accountNorm))
      ) {
        addCandidate(submission);
      }
    }
  }

  return [...candidateMap.values()].filter(submission =>
    matchesTrackingRow(row as TrackingMember, submission.deviceSerial, submission.deviceName, submission.account),
  );
}

/**
 * Representative submission for a member: an APPROVED one always wins (so an admin
 * approval is never hidden by a later duplicate/resubmission); otherwise the most recent.
 */
function pickBest<T extends { id: number; status?: string; submissionDate: string }>(list: T[]): T {
  const isApproved = (s: T) => s.status?.toUpperCase() === 'APPROVED';
  return list.slice().sort((a, b) => {
    const approvedDiff = Number(isApproved(b)) - Number(isApproved(a));
    if (approvedDiff !== 0) return approvedDiff;
    return new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime();
  })[0];
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
  const [trackingRows, submissions] = await Promise.all([
    readActive(),
    findAll(),
  ]);
  const matchIndex = buildSubmissionMatchIndex(submissions);

  const entries: UserListEntry[] = [];
  const matchedSubmissionIds = new Set<number>();

  for (const row of trackingRows) {
    const allMatches = getMatchesForTrackingRow(row, matchIndex, matchedSubmissionIds);

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
      // No submission → no scores. Any values stored on the tracking row are stale
      // (left over from an earlier submission/review), so they must show as "—".
      malwareAlerts: undefined,
      complianceChecks: undefined,
      seedConfiguration: undefined,
      operatingSystem: undefined,
      followUpAction: row.followUpAction ?? undefined,
      responseFromTicket: row.responseFromTicket ?? undefined,
      trackingStatus: row.trackingStatus ?? undefined,
      submissionStatus: 'NOT_SUBMITTED',
    });
  }

  // Submissions that match no tracking member are intentionally NOT listed: the list only shows users the
  // admin registered. Unregistered users are rejected at submit time, and must never appear as new members.

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
  const matchesProject = buildProjectMatcher(filterProjects);
  if (matchesProject) {
    result = result.filter(row => matchesProject(row.project));
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
    const inScope = buildProjectMatcher(callerTeams)!;
    result = result.filter(row => inScope(row.project));
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
  const projects = dedupeProjects(await getDistinctProjects());
  const summary = {
    approved: result.filter(row => row.submissionStatus === 'APPROVED').length,
    submitted: result.filter(row => row.submissionStatus && row.submissionStatus !== 'NOT_SUBMITTED').length,
    notSubmitted: result.filter(row => !row.submissionStatus || row.submissionStatus === 'NOT_SUBMITTED').length,
  };

  return { items, total, projects, summary };
}
