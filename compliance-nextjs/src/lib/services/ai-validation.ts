export interface AiValidationResult {
  valid: boolean;
  matchesType: boolean;
  confidence: number;
  reason: string;
  failedChecks?: string[] | null;
  guidelines?: string[] | null;
  suggestion?: string | null;
  seedDashboard?: {
    malwareAlerts?: string | number | null;
    complianceChecks?: string | number | null;
    seedConfiguration?: string | number | null;
    operatingSystem?: string | number | null;
  } | null;
  deviceSerial?: string | null;
  deviceName?: string | null;
  checklist?: Record<string, boolean>;
}

const GENERIC_PROMPT = `You are a compliance image validator.
Given an image and an expected type, determine:
1. Does the image clearly show the expected item?
2. Is the image clear, unobstructed, and complete?
3. Confidence score (0-100)

List EVERY condition that is not fully met in "failedChecks". If confidence < 100, always explain why in "failedChecks".

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":85,"reason":"short explanation","failedChecks":[],"guidelines":[],"suggestion":null}`;

const WINDOWS_PROMPT = `You are a compliance image validator for Windows device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true and confidence=100.

1. SEED DASHBOARD — The SEED dashboard is clearly visible showing the device name, device serial number, and all 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable).

2. CLOCK — A date or time is visible anywhere on screen.
   Detection rule: Look at the ENTIRE image for any readable time (e.g. "4:08 PM", "08:52 AM", "16:08") or any readable date (e.g. "5/15/2026", "12 Dec 2025", "15/05/2026"). This includes: Windows taskbar bottom-right, page footers, browser tab timestamps, Settings headers, or any other UI element. If you can read ANY time or date text anywhere in the image — even in small text — set hasClock=true. Only set hasClock=false if there is truly zero readable date or time anywhere in the entire image.

3. UPDATE — Windows Update screen is visible showing "You're up to date" or an equivalent completion message.

4. DEVICE NAME — Device name is clearly visible anywhere in the screenshot (SEED Dashboard device info, Settings, title bar, system info, etc.).

5. DEVICE SERIAL — Device serial number is clearly visible anywhere in the screenshot (SEED Dashboard, system info, Settings, etc.).

ALL five checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: device serial number and device name visible anywhere in the screenshot.
SEED DASHBOARD COUNTERS: If hasDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) — no units or labels.
- malwareAlerts: integer shown in the "Malware Alerts" tile
- complianceChecks: integer shown in the "Compliance Checks" tile
- seedConfiguration: integer shown in the "SEED Configuration" tile
- operatingSystem: integer shown in the "Operating System" tile
If hasDashboard=false, set seedDashboard fields to null.

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceSerial":"...","deviceName":"...","seedDashboard":{"malwareAlerts":0,"complianceChecks":0,"seedConfiguration":0,"operatingSystem":0},"checklist":{"hasDashboard":true,"hasClock":true,"hasWindowsUpdate":true,"hasDeviceName":true,"hasDeviceSerial":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;

const MAC_PROMPT = `You are a compliance image validator for macOS device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true.

IMPORTANT RULES — follow these strictly:
- You MUST ONLY check the items listed below. Do NOT invent additional checks.
- Do NOT validate or question the macOS version number (e.g. macOS 26, Tahoe, Sequoia — any version is acceptable).
- Do NOT check for Trellix — it is not required.

1. SEED DASHBOARD — The SEED dashboard is clearly visible showing the device name, device serial number, and all 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable).

2. TIMESTAMP — A readable date or time is visible ANYWHERE in the image. Look at the entire image: menu bar clock, browser tab, page footer, system clock, any UI element. If ANY readable time or date text is found anywhere — set hasTimestamp=true. Only set hasTimestamp=false if there is truly zero readable date or time in the entire image.

3. MAC SYSTEM INFO — macOS system info is visible (System Preferences / System Settings → About This Mac or equivalent) showing at least the model name and serial number.

ALL three checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: deviceName and deviceSerial from anywhere visible in the image.

SEED DASHBOARD COUNTERS: If hasSeedDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) — no units or labels.
- malwareAlerts: integer shown in the "Malware Alerts" tile
- complianceChecks: integer shown in the "Compliance Checks" tile
- seedConfiguration: integer shown in the "SEED Configuration" tile
- operatingSystem: integer shown in the "Operating System" tile
If hasSeedDashboard=false, set seedDashboard to null.

For each checklist item set to false, add a clear description to "failedChecks" explaining exactly what is missing.

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceName":"...","deviceSerial":"...","seedDashboard":{"malwareAlerts":0,"complianceChecks":0,"seedConfiguration":0,"operatingSystem":0},"checklist":{"hasSeedDashboard":true,"hasTimestamp":true,"hasMacInfo":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;

const THIN_PROMPT = `You are a compliance image validator for thin client (Windows) device verification.

The submitted screenshot(s) MUST satisfy ALL of the following checks:

[COMMENTED OUT — security at a glance checks, may restore in the future]
# WINDOWS SECURITY HOME SCREEN — check each item on the Windows Security home screen:
# 1. VIRUS_THREAT_PROTECTION     — "Virus & threat protection" shows a green tick (no current threats)
# 2. ACCOUNT_PROTECTION          — "Account protection" shows a green tick
# 3. FIREWALL_NETWORK_PROTECTION — "Firewall & network protection" shows a green tick
# 4. APP_BROWSER_CONTROL         — "App & browser control" shows a green tick
# 5. DEVICE_SECURITY             — "Device security" shows a green tick
# 6. DEVICE_PERFORMANCE_HEALTH   — "Device performance & health" shows "No action needed"
[END COMMENTED OUT]

WINDOWS SECURITY — SCAN OPTIONS SCREEN (NOT the home/overview screen):
1. FULL_SCAN — The Windows Security > Virus & threat protection > Scan options page MUST be physically visible in the screenshot showing ALL of:
   - A completed "Full scan" result (the text "full scan" must appear in the last scan line, e.g. "Last scan: ... (full scan)")
   - "No current threats" text
   - "0 threats found" text
   - A scan date/time (last scan timestamp)
   - Number of files scanned (any number followed by "files scanned")
   STRICT RULE: If this page is not visible, or the completed scan result text is absent, set hasFullScan=false. The "Full scan" radio button being selected alone is NOT sufficient.

WINDOWS UPDATE SCREEN:
2. WINDOWS_UPDATE — The Windows Settings > Windows Update page MUST be physically visible in the screenshot.
   WHAT TO LOOK FOR: The page heading text "Windows Update" AND the status text "You're up to date" or "Up to date" with a green checkmark icon must both appear in the screenshot.
   HARD BLOCK — set hasWindowsUpdate=false if ANY of the following are true:
   - The page shown is Windows Security (antivirus/threat protection/scan options) — this is NOT Windows Update
   - The only update-related evidence is a completed scan or "No current threats" text — this is NOT Windows Update
   - The Windows Update heading and "You're up to date" text are not both physically visible
   - You cannot find the exact text "Windows Update" as a page title or heading in the screenshot
   Do NOT infer, assume, or derive update status from any other screen. A full scan result does NOT imply Windows is up to date.

TERMINAL / COMMAND LINE:
3. SERIAL_NUMBER — A terminal window (PowerShell, CMD, or similar) MUST be physically visible showing a serial number value as output.
   STRICT RULE: If no terminal window is visible, set hasSerialNumber=false. Partial wrapping of the serial number value is acceptable — do not fail this check due to text wrapping alone.

ALL 3 checks must pass for valid=true. If ANY ONE fails, set valid=false immediately.
- Each check must be PHYSICALLY VISIBLE in the screenshot — do not infer, assume, or guess.
- Do NOT set valid=true unless hasFullScan=true AND hasWindowsUpdate=true AND hasSerialNumber=true.
- COMMON MISTAKE TO AVOID: Windows Security ≠ Windows Update. Seeing a scan result does NOT mean Windows Update is satisfied.
- List every failed check in failedChecks with a specific reason.

ALSO EXTRACT: the device serial number text visible in the terminal output (partial value is acceptable).

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceSerial":"extracted-serial-or-null","checklist":{"hasFullScan":true,"hasWindowsUpdate":true,"hasSerialNumber":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;

function selectPrompt(expectedType: string): string {
  const t = expectedType.toLowerCase();
  if (t === 'windows') return WINDOWS_PROMPT;
  if (t === 'mac') return MAC_PROMPT;
  if (t === 'thin') return THIN_PROMPT;
  return GENERIC_PROMPT;
}

function stripMarkdown(text: string): string {
  let t = (text ?? '').trim();
  if (t.startsWith('```')) {
    const start = t.indexOf('\n') + 1;
    const end = t.lastIndexOf('```');
    if (end > start) t = t.slice(start, end).trim();
  }
  return t;
}

interface AiProvider {
  name: string;
  enabled: boolean;
  order: number;
  apiKey: string;
  endpoint: string;
  model: string;
}

function getProviders(): AiProvider[] {
  const providers: AiProvider[] = [
    {
      name: 'gemini',
      enabled: (process.env.AI_GEMINI_ENABLED ?? 'true') === 'true',
      order: parseInt(process.env.AI_GEMINI_ORDER ?? '0', 10),
      apiKey: process.env.GEMINI_API_KEY ?? '',
      endpoint: process.env.AI_GEMINI_ENDPOINT ?? 'https://aiportalapi.stu-platform.live/jpe',
      model: process.env.AI_GEMINI_MODEL ?? 'Gemini-3.1-Flash-Lite',
    },
    {
      name: 'chatgpt',
      enabled: (process.env.AI_CHATGPT_ENABLED ?? 'true') === 'true',
      order: parseInt(process.env.AI_CHATGPT_ORDER ?? '1', 10),
      apiKey: process.env.CHATGPT_API_KEY ?? '',
      endpoint: process.env.AI_CHATGPT_ENDPOINT ?? 'https://aiportalapi.stu-platform.live/use',
      model: process.env.CHATGPT_MODEL ?? 'GPT-5-mini',
    },
    {
      name: 'nvidia',
      enabled: (process.env.AI_NVIDIA_ENABLED ?? 'false') === 'true',
      order: parseInt(process.env.AI_NVIDIA_ORDER ?? '2', 10),
      apiKey: process.env.NVIDIA_API_KEY ?? '',
      endpoint: process.env.AI_NVIDIA_ENDPOINT ?? '',
      model: process.env.AI_NVIDIA_MODEL ?? '',
    },
  ];
  return providers
    .filter(p => p.enabled && p.apiKey && p.endpoint)
    .sort((a, b) => a.order - b.order);
}

async function callProvider(
  provider: AiProvider,
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string
): Promise<AiValidationResult> {
  if (!provider.apiKey) throw new Error(`${provider.name} API key not configured`);

  const base64Image = imageBytes.toString('base64');
  const systemPrompt = selectPrompt(expectedType);
  const userText = `Expected submission type: ${expectedType}. Validate this image.`;

  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
    max_tokens: 512,
  };

  const url = provider.endpoint.endsWith('/v1/chat/completions')
    ? provider.endpoint
    : `${provider.endpoint}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error(`${provider.name} rate limit exceeded`);
    throw new Error(`${provider.name} API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { choices: [{ message: { content: string } }] };
  const text = data.choices[0].message.content;
  return JSON.parse(stripMarkdown(text)) as AiValidationResult;
}

export async function validateImage(
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string
): Promise<AiValidationResult> {
  const providers = getProviders();

  if (providers.length === 0) {
    return { valid: false, matchesType: false, confidence: 0, reason: 'No AI providers configured' };
  }

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, imageBytes, mimeType, expectedType);
      return result;
    } catch (err) {
      console.warn(`AI provider ${provider.name} failed:`, (err as Error).message);
    }
  }

  return { valid: false, matchesType: false, confidence: 0, reason: 'All AI providers unavailable or failed' };
}
