'use client';

interface GuidanceItem {
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

const WINDOWS_CHECKLIST: GuidanceItem[] = [
  { title: 'System Clock', description: 'Timestamp visible in bottom-right corner of Windows taskbar', icon: '🕐', required: true },
  { title: 'Windows Update Status', description: "Windows Update screen showing \"You're up to date\"", icon: '🔄', required: true },
  { title: 'Device Name', description: 'Computer hostname fully readable (not truncated) anywhere on screen', icon: '💻', required: true },
  { title: 'Device Serial Number', description: 'Serial number fully readable (not truncated) anywhere on screen', icon: '#️⃣', required: true },
  { title: 'Security Status', description: 'Trellix, Defender, Intune, or similar showing "ok" or "no action needed" status', icon: '🛡️', required: true },
];

const MAC_CHECKLIST: GuidanceItem[] = [
  { title: 'SEED Dashboard (Preferred)', description: 'Dashboard showing full device name, serial number, and 4+ metrics/counters', icon: '📊', required: false },
  { title: 'Top-Right Timestamp', description: 'System timestamp visible in top-right corner of screen', icon: '🕐', required: false },
  { title: 'Mac System Info', description: 'Alternative: System Preferences > About This Mac showing model name and serial', icon: 'ℹ️', required: false },
  { title: 'Trellix Status (Fallback)', description: 'If no SEED dashboard: Trellix endpoint security showing "trellix status: ok"', icon: '🛡️', required: false },
];

interface Props {
  submissionType: string | null;
}

export default function ValidationGuidance({ submissionType }: Props) {
  const type = submissionType?.toLowerCase() ?? '';
  const checklist = type === 'windows' ? WINDOWS_CHECKLIST : type === 'mac' ? MAC_CHECKLIST : [];

  if (checklist.length === 0) return null;

  const guidanceText =
    type === 'windows'
      ? 'All 5 items above must be visible in your screenshot for approval.'
      : 'Provide either: (1) SEED dashboard + timestamp, OR (2) System info + timestamp, OR (3) Trellix status showing "ok"';

  return (
    <div className="card p-4 border border-blue-100 bg-blue-50">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600 text-lg">ℹ️</span>
        <div>
          <div className="font-semibold text-gray-800 capitalize">{submissionType} Compliance Requirements</div>
          <div className="text-xs text-gray-500">Your screenshot must include these elements</div>
        </div>
      </div>

      <p className="text-sm text-gray-700 mb-3">{guidanceText}</p>

      <div className="space-y-2">
        {checklist.map(item => (
          <div key={item.title} className="flex items-start gap-3">
            <span className="text-lg mt-0.5">{item.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                {item.title}
                {item.required ? (
                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">REQUIRED</span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">OPTIONAL</span>
                )}
              </div>
              <div className="text-xs text-gray-600">{item.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-blue-200">
        <div className="text-xs font-semibold text-gray-700 mb-1">💡 Tips:</div>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          {type === 'windows' && (
            <>
              <li>You can capture multiple windows or tabs if needed to show all required elements</li>
              <li>Make sure device name and serial are <strong>fully visible</strong> (not cut off with &quot;...&quot;)</li>
              <li>SEED dashboard, System Properties, or Device Manager can show device info</li>
              <li>Settings &gt; System &gt; About or Device Manager shows system info and clock</li>
            </>
          )}
          {type === 'mac' && (
            <>
              <li>SEED dashboard is preferred but not required if you can show alternative paths</li>
              <li>System Preferences &gt; About This Mac shows device name and serial</li>
              <li>You need timestamps to verify device information currency</li>
              <li>Trellix status from System Preferences or security app is acceptable</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
