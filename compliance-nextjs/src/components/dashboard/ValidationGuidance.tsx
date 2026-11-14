'use client';

interface GuidanceItem {
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

const WINDOWS_CHECKLIST: GuidanceItem[] = [
  { title: 'SEED Dashboard', description: 'SEED dashboard visible showing device name, serial number, and 4+ metric counters (Malware Alerts, Compliance Checks, SEED Configuration, Operating System)', icon: '📊', required: true },
  { title: 'System Clock', description: "The operating system's own date/time visible on the Windows taskbar (usually bottom-right, but any position is fine). Dates inside web pages do not count", icon: '🕐', required: true },
  { title: 'Windows Update Status', description: "Windows Update screen showing \"You're up to date\"", icon: '🔄', required: true },
  { title: 'Device Name', description: 'Computer hostname completely readable anywhere on screen (not masked, blacked-out, cut off or truncated)', icon: '💻', required: true },
  { title: 'Device Serial Number', description: 'Complete serial number readable anywhere on screen (not masked, blacked-out, cut off or truncated) and identical to your registered device', icon: '#️⃣', required: true },
];

const MAC_CHECKLIST: GuidanceItem[] = [
  { title: 'SEED Dashboard', description: 'SEED dashboard visible showing device name, serial number, and 4+ metric counters (Malware Alerts, Compliance Checks, SEED Configuration, Operating System)', icon: '📊', required: true },
  { title: 'System Clock', description: "The operating system's own date/time visible in the macOS menu bar (usually top-right, but any position is fine). Dates inside web pages do not count", icon: '🕐', required: true },
  { title: 'Mac System Info', description: 'System Settings > General > About (or Apple menu > About This Mac) showing the model name and the complete serial number', icon: 'ℹ️', required: true },
  { title: 'Device Serial Number', description: 'Complete serial number readable (not masked, blacked-out, cut off or truncated); every serial shown in the screenshot must be identical and match your registered device', icon: '#️⃣', required: true },
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
  { title: 'Windows Security — Full Scan Result', description: 'Windows Security → Virus & threat protection (or its Scan options page): must show a completed Full scan with "No current threats", "0 threats found", last scan date/time, and number of files scanned, all visible together', icon: '🛡️', required: true },
  { title: 'Windows Update', description: 'Windows Update screen showing "Up to date"', icon: '🔄', required: true },
  { title: 'Serial Number in Terminal', description: 'Terminal / command prompt (PowerShell, CMD) showing the complete device serial number — e.g. via Get-CimInstance Win32_BIOS or wmic bios get serialnumber. It must be complete and identical to your registered device', icon: '#️⃣', required: true },
  { title: 'System Clock', description: "The operating system's own date/time visible on the Windows taskbar (any position). The scan date or other dates inside windows do not count", icon: '🕐', required: true },
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
        ? 'All 4 items above must be visible in your screenshot for approval.'
        : type === 'thin'
        ? 'All 4 items above must be present in your screenshot for approval. Several windows can be open side by side in one capture.'
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
              <li><strong>SEED dashboard is required</strong> — open the SEED app and capture the dashboard showing all 4 metric counters</li>
              <li>The SEED dashboard should display device name, serial number, Malware Alerts, Compliance Checks, SEED Configuration, and Operating System counters</li>
              <li>Make sure device name and serial are <strong>completely visible</strong> — masked, blacked-out, blurred or cut-off values (including &quot;...&quot;) are rejected</li>
              <li>Keep the <strong>Windows taskbar</strong> in the screenshot so the system clock is readable (dates inside web pages do not count)</li>
              <li>You can capture multiple windows or tabs if needed to show all required elements</li>
              <li>Settings &gt; System &gt; About or the SEED dashboard can show device name and serial</li>
            </>
          )}
          {type === 'mac' && (
            <>
              <li><strong>SEED dashboard is required</strong> — open the SEED app and capture the dashboard showing all 4 metric counters</li>
              <li>Open <strong>System Settings → General → About</strong> (macOS Ventura+) or <strong>Apple menu → About This Mac</strong> to show model name and serial number</li>
              <li>Keep the <strong>macOS menu bar</strong> in the screenshot so the system clock is readable (dates inside web pages, such as a page footer, do not count)</li>
              <li>Make sure device name and serial are <strong>completely visible</strong> — masked, blacked-out, blurred or cut-off values are rejected, and the serial must match your registered device</li>
            </>
          )}
          {type === 'thin' && (
            <>
              <li>Open <strong>Windows Security</strong> → <strong>Virus &amp; threat protection</strong> (or its <strong>&quot;Scan options&quot;</strong> page) — capture the page showing the last Full scan result, date, 0 threats, and files scanned count</li>
              <li>Do <strong>NOT</strong> capture only the Windows Security home screen (the six-tile overview) — the page must show the completed <strong>Full scan result</strong></li>
              <li>Open <strong>Windows Update</strong> (Settings → Windows Update) and capture the &quot;Up to date&quot; screen</li>
              <li>Open <strong>PowerShell</strong> or <strong>Command Prompt</strong> and run: <code>powershell -Command &quot;(Get-CimInstance Win32_BIOS).SerialNumber&quot;</code> — capture the output showing your serial number</li>
              <li>Keep the <strong>Windows taskbar</strong> in the screenshot so the system clock is readable (the scan date does not count)</li>
              <li>The serial in the terminal must be complete and correct; if it wraps onto a second line that is fine, but no characters may be missing</li>
              <li>Put all elements in <strong>one screenshot</strong> (several windows can be open side by side)</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
