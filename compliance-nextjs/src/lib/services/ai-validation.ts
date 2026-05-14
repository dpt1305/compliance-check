export interface AiValidationResult {
  valid: boolean;
  matchesType: boolean;
  confidence: number;
  reason: string;
  failedChecks?: string[] | null;
  guidelines?: string[] | null;
  suggestion?: string | null;
  seedDashboard?: {
    malwareAlerts?: string | null;
    complianceChecks?: string | null;
    seedConfiguration?: string | null;
    operatingSystem?: string | null;
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

The submitted screenshot MUST satisfy the following checks:

OPTION A — SEED Dashboard (preferred):
1. SEED DASHBOARD — A SEED dashboard is visible showing 4 counter values (e.g., "Malware Alerts: X", "Compliance Checks: X", "SEED Configuration: X", "Operating System: X")
   - The 4 counters are READABLE with full numbers visible (no truncation)
   - Any counter values (0, 19, 100, etc.) are acceptable
   - If these 4 counters are present and readable, valid=true

OPTION B — Trellix (fallback if no SEED Dashboard):
1. CLOCK      — System clock visible in bottom-right corner of Windows taskbar
2. UPDATE     — Windows Update screen showing "You're up to date"
3. DEVICE INFO — Device name AND serial number fully visible (no truncation)
4. TRELLIX STATUS — Trellix showing "trellix status: ok" or "turned on" + "no action needed"

ALSO EXTRACT: device serial number and device name visible anywhere in the screenshot.
seedDashboard counter values MUST be plain integers (e.g. 4, 19, 0) — no units or labels.

For each checklist item set to false, add a clear description to "failedChecks" explaining exactly what is missing or wrong.
If confidence < 100, every reason for uncertainty must appear in "failedChecks".

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":85,"reason":"...","deviceSerial":"...","deviceName":"...","seedDashboard":{"malwareAlerts":null,"complianceChecks":null,"seedConfiguration":null,"operatingSystem":null},"checklist":{"hasClock":true,"hasWindowsUpdate":true,"hasDeviceName":true,"hasDeviceSerial":true,"hasDashboard":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;

const MAC_PROMPT = `You are a compliance image validator for macOS device verification.

PATH 1 — SEED Dashboard (preferred):
1. SEED DASHBOARD with full device name, serial number, and 4+ counters
2. TIMESTAMP — readable timestamp in top-right corner
Result: valid=true if BOTH present.

PATH 2 — Trellix Fallback:
1. TRELLIX — showing "trellix status: ok"
Result: valid=true if Trellix shows ok.

For each checklist item set to false, add a clear description to "failedChecks" explaining exactly what is missing or wrong.
If confidence < 100, every reason for uncertainty must appear in "failedChecks".

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":85,"reason":"...","checklist":{"hasSeedDashboard":true,"hasTrellix":false,"hasTimestamp":true,"hasMacInfo":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;

const THIN_PROMPT = `You are a compliance image validator for thin client (Windows) device verification.

The submitted screenshot(s) MUST satisfy ALL of the following checks:

WINDOWS SECURITY SCREEN — check each item on the Windows Security home screen:
1. VIRUS_THREAT_PROTECTION    — "Virus & threat protection" shows a green tick (no current threats)
2. ACCOUNT_PROTECTION         — "Account protection" shows a green tick
3. FIREWALL_NETWORK_PROTECTION— "Firewall & network protection" shows a green tick
4. APP_BROWSER_CONTROL        — "App & browser control" shows a green tick
5. DEVICE_SECURITY            — "Device security" shows a green tick
6. DEVICE_PERFORMANCE_HEALTH  — "Device performance & health" shows "No action needed"

WINDOWS UPDATE SCREEN:
7. WINDOWS_UPDATE — Windows Update screen shows "Up to date" or "You're up to date"

TERMINAL / COMMAND LINE:
8. SERIAL_NUMBER — A terminal window (PowerShell, CMD, or similar) is visible showing the device serial number output from a command such as Get-CimInstance Win32_BIOS, wmic bios get serialnumber, or equivalent

ALL 8 checks must pass for valid=true. If any one fails, set valid=false and list it in failedChecks.
For EVERY checklist item set to false, add a specific description to "failedChecks" explaining exactly what is missing.
If confidence < 100, every reason for uncertainty must appear in "failedChecks".

ALSO EXTRACT: the device serial number text visible in the terminal output.

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":85,"reason":"...","deviceSerial":"extracted-serial-or-null","checklist":{"hasVirusThreatProtection":true,"hasAccountProtection":true,"hasFirewallNetworkProtection":true,"hasAppBrowserControl":true,"hasDeviceSecurity":true,"hasDevicePerformanceHealth":true,"hasWindowsUpdate":true,"hasSerialNumber":true},"failedChecks":[],"guidelines":[],"suggestion":null}`;

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
