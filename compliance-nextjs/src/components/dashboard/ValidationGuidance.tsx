'use client';

interface GuidanceItem {
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

const WINDOWS_CHECKLIST: GuidanceItem[] = [
  { title: 'SEED Dashboard', description: 'SEED dashboard visible showing device name, serial number, and 4+ metric counters (Malware Alerts, Compliance Checks, SEED Configuration, Operating System)', icon: '📊', required: true },
  { title: 'System Clock', description: 'Timestamp visible in bottom-right corner of Windows taskbar', icon: '🕐', required: true },
  { title: 'Windows Update Status', description: "Windows Update screen showing \"You're up to date\"", icon: '🔄', required: true },
  { title: 'Device Name', description: 'Computer hostname fully readable (not truncated) anywhere on screen', icon: '💻', required: true },
  { title: 'Device Serial Number', description: 'Serial number fully readable (not truncated) anywhere on screen', icon: '#️⃣', required: true },
];

const MAC_CHECKLIST: GuidanceItem[] = [
  { title: 'SEED Dashboard', description: 'SEED dashboard visible showing device name, serial number, and 4+ metric counters (Malware Alerts, Compliance Checks, SEED Configuration, Operating System)', icon: '📊', required: true },
  { title: 'Timestamp', description: 'A readable date or time visible anywhere in the image (menu bar, page footer, browser, system clock, etc.)', icon: '🕐', required: true },
  { title: 'Mac System Info', description: 'System Preferences / System Settings > About This Mac showing model name and serial number', icon: 'ℹ️', required: true },
];

const THIN_CHECKLIST: GuidanceItem[] = [
  // ── Security at a glance (commented out — replaced by full scan check) ─────────────────
  // { title: 'Virus & threat protection', description: 'Windows Security → "Virus & threat protection" showing a green tick (No current threats)', icon: '🛡️', required: true },
  // { title: 'Account protection', description: 'Windows Security → "Account protection" showing a green tick', icon: '👤', required: true },
  // { title: 'Firewall & network protection', description: 'Windows Security → "Firewall & network protection" showing a green tick', icon: '🔥', required: true },
  // { title: 'App & browser control', description: 'Windows Security → "App & browser control" showing a green tick', icon: '🌐', required: true },
  // { title: 'Device security', description: 'Windows Security → "Device security" showing a green tick', icon: '💻', required: true },
  // { title: 'Device performance & health', description: 'Windows Security → "Device performance & health" showing "No action needed"', icon: '❤️', required: true },
  // ── Active requirements ───────────────────────────────────────────────────────────────
  { title: 'Windows Security — Full Scan Result', description: 'Windows Security → Virus & threat protection → Scan options: must show a completed Full scan with "No current threats", "0 threats found", last scan date/time, and number of files scanned', icon: '🛡️', required: true },
  { title: 'Windows Update', description: 'Windows Update screen showing "Up to date"', icon: '🔄', required: true },
  { title: 'Serial Number in Terminal', description: 'Terminal / command prompt (PowerShell, CMD) showing the device serial number — e.g. via Get-CimInstance Win32_BIOS or wmic bios get serialnumber', icon: '#️⃣', required: true },
];

interface Props {
  submissionType: string | null;
}

export default function ValidationGuidance({ submissionType }: Props) {
  const type = submissionType?.toLowerCase() ?? '';
  const checklist =
    type === 'windows' ? WINDOWS_CHECKLIST :
    type === 'mac'     ? MAC_CHECKLIST     :
    type === 'thin'    ? THIN_CHECKLIST    : [];

  if (checklist.length === 0) return null;

  const guidanceText =
    type === 'windows'
      ? 'All 5 items above must be visible in your screenshot for approval. SEED dashboard is required.'
      : type === 'mac'
        ? 'All 3 items above must be visible in your screenshot for approval.'
        : type === 'thin'
        ? 'All 3 items above must be present in your screenshot(s) for approval. You may combine all screens in one capture.'
        : 'Provide either: (1) SEED dashboard + timestamp, OR (2) System info + timestamp, OR (3) Trellix status showing "ok"';

  return (
    <div className="card border border-blue-100 bg-blue-50 p-3 sm:p-4">
      <div className="mb-3 flex items-start gap-2 sm:items-center">
        <span className="mt-0.5 text-lg text-blue-600 sm:mt-0">ℹ️</span>
        <div className="min-w-0">
          <div className="font-semibold text-gray-800 capitalize">{submissionType} Compliance Requirements</div>
          <div className="text-xs text-gray-500">Your screenshot must include these elements</div>
        </div>
      </div>

      <p className="mb-3 text-sm text-gray-700">{guidanceText}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {checklist.map(item => (
          <div key={item.title} className="flex items-start gap-3 rounded-lg border border-blue-100 bg-white/80 p-3">
            <span className="mt-0.5 text-lg">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col items-start gap-1 text-sm font-medium text-gray-800 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <span>{item.title}</span>
                {item.required ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">REQUIRED</span>
                ) : (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">OPTIONAL</span>
                )}
              </div>
              <div className="text-xs text-gray-600 sm:text-sm">{item.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-blue-200 pt-3">
        <div className="mb-2 text-xs font-semibold text-gray-700">💡 Tips:</div>
        <ul className="ml-4 list-disc space-y-2 text-xs text-gray-600 sm:text-sm">
          {type === 'windows' && (
            <>
              <li><strong>SEED dashboard is required</strong> — open the SEED app and capture the dashboard showing all 4 metric counters</li>
              <li>The SEED dashboard should display device name, serial number, Malware Alerts, Compliance Checks, SEED Configuration, and Operating System counters</li>
              <li>Make sure device name and serial are <strong>fully visible</strong> (not cut off with &quot;...&quot;)</li>
              <li>You can capture multiple windows or tabs if needed to show all required elements</li>
              <li>Settings &gt; System &gt; About or the SEED dashboard can show device name and serial</li>
            </>
          )}
          {type === 'mac' && (
            <>
              <li><strong>SEED dashboard is required</strong> — open the SEED app and capture the dashboard showing all 4 metric counters</li>
              <li>Open <strong>System Settings → General → About</strong> (macOS Ventura+) or <strong>Apple menu → About This Mac</strong> to show model name and serial number</li>
              <li>Any visible timestamp anywhere in the image is acceptable (menu bar clock, browser tab, page footer, etc.)</li>
              <li>Make sure device name and serial are <strong>fully visible</strong> (not truncated)</li>
            </>
          )}
          {type === 'thin' && (
            <>
              <li>Open <strong>Windows Security</strong> → <strong>Virus &amp; threat protection</strong> → click <strong>&quot;Scan options&quot;</strong> — capture the page showing the last Full scan result, date, 0 threats, and files scanned count</li>
              <li>Do <strong>NOT</strong> capture the Windows Security home screen (the six-tile overview) — the <strong>Scan options / scan results page</strong> is required</li>
              <li>Open <strong>Windows Update</strong> (Settings → Windows Update) and capture the &quot;Up to date&quot; screen</li>
              <li>Open <strong>PowerShell</strong> or <strong>Command Prompt</strong> and run: <code className="break-all">powershell -Command &quot;(Get-CimInstance Win32_BIOS).SerialNumber&quot;</code> — capture the output showing your serial number</li>
              <li>You may combine all elements into one screenshot or submit separate captures</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
