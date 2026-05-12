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

interface Props {
  result: SubmissionResponse;
}

export default function ValidationResult({ result }: Props) {
  const isApproved = result.status === 'APPROVED';
  let aiResult: AiResult | null = null;
  try {
    aiResult = result.validationResult ? JSON.parse(result.validationResult) as AiResult : null;
  } catch { /* ignore */ }

  return (
    <div className={`card mt-6 border-l-4 ${isApproved ? 'border-l-green-500' : 'border-l-red-500'}`}>
      <div className={`flex items-center gap-3 p-4 ${isApproved ? 'bg-green-50' : 'bg-red-50'}`}>
        <span className="text-2xl">{isApproved ? '✅' : '❌'}</span>
        <div>
          <div className={`font-semibold ${isApproved ? 'text-green-800' : 'text-red-800'}`}>
            {isApproved ? 'Submission Accepted' : 'Image Not Valid'}
          </div>
          <div className="text-sm text-gray-600 capitalize">Type: {result.submissionType}</div>
        </div>
      </div>

      <div className="p-4">
        {isApproved ? (
          <div className="space-y-3">
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
              <span className="text-green-600">💾</span>
              <span>Saved as: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{result.imageSavedName}</code></span>
            </div>
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
