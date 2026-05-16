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

  return (
    <div className={`card mt-6 border-l-4 ${isApproved ? 'border-l-green-500' : 'border-l-red-500'}`}>
      <div className={`flex items-center gap-3 p-4 ${isApproved ? 'bg-green-50' : 'bg-red-50'}`}>
        <span className="text-2xl">{isApproved ? '✅' : '❌'}</span>
        <div>
          <div className={`font-semibold ${isApproved ? 'text-green-800' : 'text-red-800'}`}>
            {isApproved ? 'Image Accepted — Pending Approval' : 'Image Not Valid'}
          </div>
          <div className="text-sm text-gray-600 capitalize">Type: {result.submissionType}</div>
        </div>
      </div>

      <div className="p-4">
        {isApproved ? (
          <div className="space-y-4">
            {/* Checklist */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">📤</span>
                <span>Image received and format verified</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">🤖</span>
                <span>
                  AI validation passed
                  {aiResult?.confidence != null && (
                    <strong className="ml-1">({aiResult.confidence}% confidence)</strong>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">🏷️</span>
                <span>Matches submission type: <strong className="capitalize">{result.submissionType}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600">✔️</span>
                <span>Submission saved successfully</span>
              </div>
            </div>

            {/* Member row table — shown after memberRow is fetched */}
            {memberRow && (
              <div className="mt-3 overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wide">
                      {['No.','Project','Name','Account','Email','Serial','Type','Status',
                        'Malware Alerts','Compliance Checks','SEED Config','OS','Submitted'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
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
                      <td className="px-3 py-2">
                        {imageFilename ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded text-indigo-700 font-medium">
                            📷 {imageFilename}
                          </span>
                        ) : (
                          cell(memberRow.submissionDate
                            ? new Date(memberRow.submissionDate).toLocaleDateString()
                            : null)
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {aiResult?.reason && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded p-3">
                <span>⚠️</span>
                <span>{aiResult.reason}</span>
              </div>
            )}

            {aiResult?.failedChecks && aiResult.failedChecks.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <span>📋</span> Failed requirements:
                </div>
                <div className="space-y-2">
                  {aiResult.failedChecks.map((check, i) => (
                    <div key={i} className="bg-red-50 rounded p-3">
                      <div className="flex items-start gap-2 text-sm text-red-700">
                        <span>✗</span>
                        <span>{check}</span>
                      </div>
                      {aiResult?.guidelines?.[i] && (
                        <div className="flex items-start gap-2 text-sm text-blue-700 mt-1 ml-4">
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
          <div className="mt-4 pt-4 border-t border-gray-200 flex items-start gap-2 text-sm text-gray-700">
            <span>💡</span>
            <span><strong>Tip:</strong> {aiResult.suggestion}</span>
          </div>
        )}
      </div>
    </div>
  );
}
