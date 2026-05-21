'use client';

interface AiResult {
  valid?: boolean;
  matchesType?: boolean;
  confidence?: number;
  reason?: string;
  failedChecks?: string[] | null;
  guidelines?: string[] | null;
  suggestion?: string | null;
}

interface SubmissionResponse {
  id?: number;
  account: string;
  submissionType: string;
  imageUrl?: string;
  imageSavedName?: string;
  status: string;
  validationResult: string;
  submissionDate?: string;
}

interface MemberRow {
  no: number | null;
  project: string | null;
  name: string | null;
  email: string | null;
  serial: string | null;
  trackingAccount: string | null;
  deviceType: string | null;
  malwareAlerts: string | null;
  complianceChecks: string | null;
  seedConfiguration: string | null;
  operatingSystem: string | null;
  trackingStatus: string | null;
  submissionId: number | null;
  account: string;
  submissionType: string | null;
  submissionStatus: string | null;
  submissionDate: string | null;
  imageUrl: string | null;
  confidenceScore: number | null;
}

interface Props {
  result: SubmissionResponse;
  memberRow?: MemberRow | null;
}

function statusBadge(status: string | null | undefined) {
  if (!status) return <span className="text-gray-400">—</span>;
  const s = status.toUpperCase();
  if (s === 'APPROVED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✓ Approved</span>;
  if (s === 'REJECTED') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">✗ Rejected</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{status}</span>;
}

function cell(value: string | number | null | undefined) {
  return <span className="text-gray-700">{value ?? <span className="text-gray-400">—</span>}</span>;
}

export default function ValidationResult({ result, memberRow }: Props) {
  const isApproved = result.status !== 'REJECTED';
  let aiResult: AiResult | null = null;
  try {
    aiResult = result.validationResult ? JSON.parse(result.validationResult) as AiResult : null;
  } catch { /* ignore */ }

  const imageFilename = (memberRow?.imageUrl ?? result.imageUrl ?? '')
    .split('/').pop() ?? '';

  const submittedInfo = imageFilename
    ? (
      <span className="inline-flex max-w-full items-center gap-1 break-all whitespace-normal rounded border border-indigo-200 bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
        📷 {imageFilename}
      </span>
    )
    : cell(memberRow?.submissionDate
      ? new Date(memberRow.submissionDate).toLocaleDateString()
      : result.submissionDate
        ? new Date(result.submissionDate).toLocaleDateString()
        : null);

  const memberDetails = memberRow ? [
    { label: 'No.', value: cell(memberRow.no) },
    { label: 'Project', value: cell(memberRow.project) },
    { label: 'Name', value: cell(memberRow.name) },
    { label: 'Account', value: cell(memberRow.trackingAccount ?? memberRow.account) },
    { label: 'Email', value: cell(memberRow.email) },
    { label: 'Serial', value: cell(memberRow.serial) },
    { label: 'Type', value: cell(memberRow.deviceType ?? memberRow.submissionType) },
    { label: 'Status', value: statusBadge(memberRow.submissionStatus ?? memberRow.trackingStatus) },
    { label: 'Malware Alerts', value: cell(memberRow.malwareAlerts) },
    { label: 'Compliance Checks', value: cell(memberRow.complianceChecks) },
    { label: 'SEED Config', value: cell(memberRow.seedConfiguration) },
    { label: 'OS', value: cell(memberRow.operatingSystem) },
    { label: 'Submitted', value: submittedInfo },
  ] : [];

  return (
    <div className={`card mt-6 border-l-4 ${isApproved ? 'border-l-green-500' : 'border-l-red-500'}`}>
      <div className={`flex items-start gap-3 p-3 sm:items-center sm:p-4 ${isApproved ? 'bg-green-50' : 'bg-red-50'}`}>
        <span className="text-2xl">{isApproved ? '✅' : '❌'}</span>
        <div className="min-w-0">
          <div className={`font-semibold ${isApproved ? 'text-green-800' : 'text-red-800'}`}>
            {isApproved ? 'Image Accepted — Pending Approval' : 'Image Not Valid'}
          </div>
          <div className="text-sm text-gray-600 capitalize">Type: {result.submissionType}</div>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {isApproved ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border border-green-100 bg-green-50/70 p-3 text-sm">
                <span className="text-green-600">📤</span>
                <span>Image received and format verified</span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-green-100 bg-green-50/70 p-3 text-sm">
                <span className="text-green-600">🤖</span>
                <span>
                  AI validation passed
                  {aiResult?.confidence != null && (
                    <strong className="ml-1">({aiResult.confidence}% confidence)</strong>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-green-100 bg-green-50/70 p-3 text-sm">
                <span className="text-green-600">🏷️</span>
                <span>Matches submission type: <strong className="capitalize">{result.submissionType}</strong></span>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-green-100 bg-green-50/70 p-3 text-sm">
                <span className="text-green-600">✔️</span>
                <span>Submission saved successfully</span>
              </div>
            </div>

            {memberRow && (
              <>
                <div className="grid grid-cols-1 gap-3 md:hidden">
                  {memberDetails.map(detail => (
                    <div key={detail.label} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{detail.label}</div>
                      <div className="mt-1 text-sm text-gray-800 break-words">{detail.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 hidden overflow-x-auto rounded border border-gray-200 md:block">
                  <table className="min-w-full whitespace-nowrap text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 uppercase tracking-wide">
                        {['No.','Project','Name','Account','Email','Serial','Type','Status',
                          'Malware Alerts','Compliance Checks','SEED Config','OS','Submitted'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white align-top">
                        <td className="px-3 py-2">{cell(memberRow.no)}</td>
                        <td className="px-3 py-2">{cell(memberRow.project)}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{cell(memberRow.name)}</td>
                        <td className="px-3 py-2">{cell(memberRow.trackingAccount ?? memberRow.account)}</td>
                        <td className="px-3 py-2">{cell(memberRow.email)}</td>
                        <td className="px-3 py-2">{cell(memberRow.serial)}</td>
                        <td className="px-3 py-2 capitalize">{cell(memberRow.deviceType ?? memberRow.submissionType)}</td>
                        <td className="px-3 py-2">{statusBadge(memberRow.submissionStatus ?? memberRow.trackingStatus)}</td>
                        <td className="px-3 py-2">{cell(memberRow.malwareAlerts)}</td>
                        <td className="px-3 py-2">{cell(memberRow.complianceChecks)}</td>
                        <td className="px-3 py-2">{cell(memberRow.seedConfiguration)}</td>
                        <td className="px-3 py-2">{cell(memberRow.operatingSystem)}</td>
                        <td className="px-3 py-2">{submittedInfo}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {aiResult?.reason && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <span>⚠️</span>
                <span>{aiResult.reason}</span>
              </div>
            )}

            {aiResult?.failedChecks && aiResult.failedChecks.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span>📋</span> Failed requirements:
                </div>
                <div className="space-y-3">
                  {aiResult.failedChecks.map((check, i) => (
                    <div key={i} className="rounded-lg bg-red-50 p-3">
                      <div className="flex items-start gap-2 text-sm text-red-700">
                        <span>✗</span>
                        <span>{check}</span>
                      </div>
                      {aiResult?.guidelines?.[i] && (
                        <div className="ml-4 mt-2 flex items-start gap-2 text-sm text-blue-700">
                          <span>→</span>
                          <span>{aiResult.guidelines[i]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {aiResult?.suggestion && (
          <div className="mt-4 flex items-start gap-2 border-t border-gray-200 pt-4 text-sm text-gray-700">
            <span>💡</span>
            <span><strong>Tip:</strong> {aiResult.suggestion}</span>
          </div>
        )}
      </div>
    </div>
  );
}
