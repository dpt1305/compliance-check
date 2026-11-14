import { buildImageCrops, type ImageCrop } from '@/lib/utils/image-crops';

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
  /** Per checklist key: the exact text the AI read and where it appears. */
  evidence?: Record<string, string>;
  /** Every distinct serial number the AI could read anywhere in the image. */
  serialsSeen?: string[] | null;
  /** Items the AI passed but was not fully sure about (drives the admin warning). */
  uncertainties?: string[] | null;
  /** Set by the submission API when accepted with confidence 80-98. Admin-only. */
  warning?: boolean;
  warnings?: string[] | null;
}

const GENERIC_PROMPT = `You are a compliance image validator.
Given an image and an expected type, determine:
1. Does the image clearly show the expected item?
2. Is the image clear, unobstructed, and complete?
3. Confidence score (0-100)

List EVERY condition that is not fully met in "failedChecks". If confidence < 100, always explain why in "failedChecks".

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":85,"reason":"short explanation","failedChecks":[],"guidelines":[],"suggestion":null}`;

/** Rules shared by every device type. Appended to each type-specific prompt. */
const COMMON_RULES = `GENERAL RULES (apply to every check)
- Judge ONLY what is physically visible. Never infer, assume or guess.
- The FIRST image is the submitted screenshot. Any images after it are zoomed crops of the SAME screenshot; use them only to read small text and do not treat them as separate submissions.
- The screenshot does NOT have to be full-screen, but it MUST contain every item required above.
- EVIDENCE: for every checklist item you set to true, add an entry to "evidence" with the exact text you read and where it appears, for example "Thu 9 Apr 16:03 - macOS menu bar". An item with no concrete evidence MUST be false.
- SYSTEM CLOCK: a date and/or time rendered by the operating system's own bar: the Windows taskbar notification area (usually bottom-right, but the taskbar can be moved to any screen edge) or the macOS menu bar (usually top-right). It may be at any position, but it MUST be on the OS bar. These are NOT a system clock and must never be accepted: dates or times inside a web page or app window (page footers such as "Last Updated 12 Dec 2025", "(c) 2025", "Last checked: Today, 7:08 AM", scan dates, browser tab text, document dates). If the OS bar is not visible in the screenshot, the clock check is false: look at the very top edge (macOS menu bar) and at the screen edges (Windows taskbar); if the bar has been cropped out, there is NO system clock. In "evidence" you MUST quote the exact digits you read from the clock (for example "16:03" or "5/20/2026 1:36 PM"); if you cannot read actual digits of a time or date on the OS bar, the check is false. Never write that the clock "area is present" or "is visible" without quoting its digits.
- DEVICE SERIAL NUMBER: valid ONLY if the COMPLETE value is readable, every character. Set the check to false if it is blurred, masked, blacked-out, covered by another window, cut off by an image or window edge, shortened with "...", or partly hidden in any way. A serial that wraps onto the next line in a terminal is acceptable: join the lines (remove line breaks and spaces) and return the full value. Copy it character by character and never guess ambiguous characters (0/O, 1/I/l, 5/S, 8/B); if any character is not clearly legible the check is false. Put the full serial in "deviceSerial" and list EVERY distinct serial value visible anywhere in the image in "serialsSeen". If different places show different serials, the check is false.
- DEVICE NAME: valid ONLY if the complete name is readable. Blacked-out, partly hidden, cut off or "..."-truncated names are false.
- CONFIDENCE: use 99-100 only when every item is clearly and fully legible. Use 80-98 when every item passes but you were not completely sure about one or more of them, and list each one in "uncertainties" (one short sentence naming the item and why). Use below 80 when any item cannot be read reliably or is false. If any item is false, "valid" must be false.`;

const WINDOWS_PROMPT = `You are a compliance image validator for Windows device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true.

1. hasDashboard - SEED DASHBOARD: The SEED dashboard is clearly visible showing the device name, device serial number, and all 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable).

2. hasClock - SYSTEM CLOCK: The operating system's own clock (date and/or time) is visible on the Windows taskbar. See the SYSTEM CLOCK rule below.

3. hasWindowsUpdate - WINDOWS UPDATE: The Windows Settings > Windows Update page is visible with the heading "Windows Update" and the status "You're up to date" (or an equivalent completion message).

4. hasDeviceName - DEVICE NAME: The complete device name is readable (SEED dashboard device info, Settings > System > About, title bar, etc.).

5. hasDeviceSerial - DEVICE SERIAL: The complete device serial number is readable (SEED dashboard, system info, Settings, etc.).

ALL five checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: deviceSerial, deviceName.
SEED DASHBOARD COUNTERS: If hasDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) - no units or labels.
- malwareAlerts: integer shown in the "Malware Alerts" tile
- complianceChecks: integer shown in the "Compliance Checks" tile
- seedConfiguration: integer shown in the "SEED Configuration" tile
- operatingSystem: integer shown in the "Operating System" tile
If hasDashboard=false, set seedDashboard fields to null.

${COMMON_RULES}

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceSerial":"...","serialsSeen":["..."],"deviceName":"...","seedDashboard":{"malwareAlerts":0,"complianceChecks":0,"seedConfiguration":0,"operatingSystem":0},"checklist":{"hasDashboard":true,"hasClock":true,"hasWindowsUpdate":true,"hasDeviceName":true,"hasDeviceSerial":true},"evidence":{"hasDashboard":"...","hasClock":"...","hasWindowsUpdate":"...","hasDeviceName":"...","hasDeviceSerial":"..."},"uncertainties":[],"failedChecks":[],"guidelines":[],"suggestion":null}`;

const MAC_PROMPT = `You are a compliance image validator for macOS device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true.

IMPORTANT RULES - follow these strictly:
- You MUST ONLY check the items listed below. Do NOT invent additional checks.
- Do NOT validate or question the macOS version number (e.g. macOS 26, Tahoe, Sequoia - any version is acceptable).
- Do NOT check for Trellix - it is not required.

1. hasSeedDashboard - SEED DASHBOARD: The SEED dashboard is clearly visible showing the device name and all 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable). Any device name or serial shown on the dashboard must be completely readable.

2. hasTimestamp - SYSTEM CLOCK: The operating system's own clock (date and/or time) is visible in the macOS menu bar. See the SYSTEM CLOCK rule below.

3. hasMacInfo - MAC SYSTEM INFO: macOS system info is visible (System Settings > General > About, or Apple menu > About This Mac) showing at least the model name and the complete serial number.

4. hasDeviceSerial - DEVICE SERIAL: The complete serial number is readable, and every serial shown in the image (About This Mac, SEED dashboard, ...) is identical.

ALL four checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: deviceName and deviceSerial.

SEED DASHBOARD COUNTERS: If hasSeedDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) - no units or labels.
- malwareAlerts: integer shown in the "Malware Alerts" tile
- complianceChecks: integer shown in the "Compliance Checks" tile
- seedConfiguration: integer shown in the "SEED Configuration" tile
- operatingSystem: integer shown in the "Operating System" tile
If hasSeedDashboard=false, set seedDashboard to null.

For each checklist item set to false, add a clear description to "failedChecks" explaining exactly what is missing.

${COMMON_RULES}

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceName":"...","deviceSerial":"...","serialsSeen":["..."],"seedDashboard":{"malwareAlerts":0,"complianceChecks":0,"seedConfiguration":0,"operatingSystem":0},"checklist":{"hasSeedDashboard":true,"hasTimestamp":true,"hasMacInfo":true,"hasDeviceSerial":true},"evidence":{"hasSeedDashboard":"...","hasTimestamp":"...","hasMacInfo":"...","hasDeviceSerial":"..."},"uncertainties":[],"failedChecks":[],"guidelines":[],"suggestion":null}`;

const THIN_PROMPT = `You are a compliance image validator for thin client (Windows) device verification.

The submitted screenshot MUST satisfy ALL of the following checks:

[COMMENTED OUT - security at a glance checks, may restore in the future]
# WINDOWS SECURITY HOME SCREEN - check each item on the Windows Security home screen:
# 1. VIRUS_THREAT_PROTECTION     - "Virus & threat protection" shows a green tick (no current threats)
# 2. ACCOUNT_PROTECTION          - "Account protection" shows a green tick
# 3. FIREWALL_NETWORK_PROTECTION - "Firewall & network protection" shows a green tick
# 4. APP_BROWSER_CONTROL         - "App & browser control" shows a green tick
# 5. DEVICE_SECURITY             - "Device security" shows a green tick
# 6. DEVICE_PERFORMANCE_HEALTH   - "Device performance & health" shows "No action needed"
[END COMMENTED OUT]

WINDOWS SECURITY - FULL SCAN RESULT:
1. hasFullScan - FULL_SCAN: A Windows Security window MUST be physically visible in the screenshot showing a completed Full scan result, all together in the same window. It may be the Virus & threat protection page OR its Scan options page; either is fine. The result must show ALL of:
   - A completed "Full scan" result (the text "full scan" must appear in the last scan line, e.g. "Last scan: ... (full scan)")
   - "No current threats" text
   - "0 threats found" text
   - A scan date/time (last scan timestamp)
   - Number of files scanned (any number followed by "files scanned")
   RULE: If the completed scan result text is absent, set hasFullScan=false. The "Full scan" radio button being selected alone is NOT sufficient, and the six-tile Windows Security home/overview screen without these result lines is NOT sufficient. Do not reject merely because the page is "Virus & threat protection" instead of "Scan options".

WINDOWS UPDATE SCREEN:
2. hasWindowsUpdate - WINDOWS_UPDATE: The Windows Settings > Windows Update page MUST be physically visible in the screenshot.
   WHAT TO LOOK FOR: The page heading text "Windows Update" AND the status text "You're up to date" or "Up to date" with a green checkmark icon must both appear in the screenshot.
   HARD BLOCK - set hasWindowsUpdate=false if ANY of the following are true:
   - The page shown is Windows Security (antivirus/threat protection/scan options) - this is NOT Windows Update
   - The only update-related evidence is a completed scan or "No current threats" text - this is NOT Windows Update
   - The Windows Update heading and "You're up to date" text are not both physically visible
   - You cannot find the exact text "Windows Update" as a page title or heading in the screenshot
   Do NOT infer, assume, or derive update status from any other screen. A full scan result does NOT imply Windows is up to date.

TERMINAL / COMMAND LINE:
3. hasSerialNumber - SERIAL_NUMBER: A terminal window (PowerShell, CMD, or similar) MUST be physically visible showing the COMPLETE serial number value as output.
   STRICT RULE: If no terminal window is visible, set hasSerialNumber=false. A serial that wraps onto the next line is acceptable (join the lines), but the full value must be there and correct.

SYSTEM CLOCK:
4. hasClock - SYSTEM CLOCK: The operating system's own clock (date and/or time) is visible on the Windows taskbar. The scan date, the "Last checked" text and any other date inside a window do NOT count. See the SYSTEM CLOCK rule below.

ALL 4 checks must pass for valid=true. If ANY ONE fails, set valid=false immediately.
- Each check must be PHYSICALLY VISIBLE in the screenshot - do not infer, assume, or guess.
- Do NOT set valid=true unless hasFullScan, hasWindowsUpdate, hasSerialNumber and hasClock are all true.
- COMMON MISTAKE TO AVOID: Windows Security is not Windows Update. Seeing a scan result does NOT mean Windows Update is satisfied.
- List every failed check in failedChecks with a specific reason.

ALSO EXTRACT: the device serial number text visible in the terminal output (complete value).

${COMMON_RULES}

Respond ONLY with valid JSON (no markdown):
{"valid":true,"matchesType":true,"confidence":100,"reason":"...","deviceSerial":"extracted-serial-or-null","serialsSeen":["..."],"checklist":{"hasFullScan":true,"hasWindowsUpdate":true,"hasSerialNumber":true,"hasClock":true},"evidence":{"hasFullScan":"...","hasWindowsUpdate":"...","hasSerialNumber":"...","hasClock":"..."},"uncertainties":[],"failedChecks":[],"guidelines":[],"suggestion":null}`;

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

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** Reasoning tokens, when the gateway reports them (they are billed as output). */
  reasoningTokens: number | null;
}

export interface ProviderAttempt {
  provider: string;
  model: string;
  ok: boolean;
  error?: string;
  durationMs: number;
}

/** Everything about one validation call - used for logging and by the evaluation script. */
export interface ValidationRun {
  result: AiValidationResult;
  provider: string | null;
  model: string | null;
  durationMs: number;
  usage: TokenUsage | null;
  /** Number of zoomed crops that were sent along with the full image. */
  cropCount: number;
  rawText: string | null;
  attempts: ProviderAttempt[];
}

export interface RunOptions {
  /** Send zoomed crops with the full image. Default true. */
  useCrops?: boolean;
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

interface ChatCompletionResponse {
  choices: [{ message: { content: string } }];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

async function callProvider(
  provider: AiProvider,
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string,
  crops: ImageCrop[] = [],
): Promise<{ text: string; usage: TokenUsage | null }> {
  if (!provider.apiKey) throw new Error(`${provider.name} API key not configured`);

  const base64Image = imageBytes.toString('base64');
  const systemPrompt = selectPrompt(expectedType);
  const baseText = `Expected submission type: ${expectedType}. Validate this image.`;
  const userText = crops.length > 0
    ? `${baseText}\n\nThe FIRST image is the full screenshot. The ${crops.length} images after it are zoomed, sharpened crops of the SAME screenshot (corners where clocks/timestamps usually are, and the central text area). Use them to read small text, dates and times; do not treat them as separate submissions.`
    : baseText;

  const imageParts = [
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
    ...crops.flatMap(crop => [
      { type: 'text', text: `Crop: ${crop.label}` },
      { type: 'image_url', image_url: { url: `data:${crop.mimeType};base64,${crop.bytes.toString('base64')}`, detail: 'high' } },
    ]),
  ];

  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          ...imageParts,
        ],
      },
    ],
    // The answer now carries per-item evidence, so it is longer than before.
    max_tokens: 1024,
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

  const data = await res.json() as ChatCompletionResponse;
  const u = data.usage;
  const usage: TokenUsage | null = u
    ? {
        promptTokens: u.prompt_tokens ?? null,
        completionTokens: u.completion_tokens ?? null,
        totalTokens: u.total_tokens ?? null,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
      }
    : null;
  return { text: data.choices[0].message.content, usage };
}

/** Attempts per provider when the reply is not valid JSON (1 try + 1 retry). */
const MAX_JSON_ATTEMPTS = 2;

function addUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a) return b;
  if (!b) return a;
  const add = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    promptTokens: add(a.promptTokens, b.promptTokens),
    completionTokens: add(a.completionTokens, b.completionTokens),
    totalTokens: add(a.totalTokens, b.totalTokens),
    reasoningTokens: add(a.reasoningTokens, b.reasoningTokens),
  };
}

/** Full-detail validation: result plus timing, tokens, provider and raw reply. */
export async function runValidation(
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string,
  options: RunOptions = {},
): Promise<ValidationRun> {
  const started = Date.now();
  const providers = getProviders();
  const attempts: ProviderAttempt[] = [];

  const failedRun = (reason: string, cropCount: number): ValidationRun => ({
    result: { valid: false, matchesType: false, confidence: 0, reason },
    provider: null,
    model: null,
    durationMs: Date.now() - started,
    usage: null,
    cropCount,
    rawText: null,
    attempts,
  });

  if (providers.length === 0) return failedRun('No AI providers configured', 0);

  // Built once and reused if we have to fall back to another provider.
  const crops = options.useCrops === false ? [] : await buildImageCrops(imageBytes);

  for (const provider of providers) {
    // A malformed JSON reply is usually a one-off glitch, so the same provider gets one more try.
    // Network/HTTP errors (rate limit, 5xx) are not retried here: they fall through to the next provider.
    let wastedUsage: TokenUsage | null = null; // tokens burned by earlier attempts that returned bad JSON
    for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
      const t0 = Date.now();
      let rawText: string | null = null;
      let usage: TokenUsage | null = null;
      try {
        const reply = await callProvider(provider, imageBytes, mimeType, expectedType, crops);
        rawText = reply.text;
        usage = reply.usage;
        const result = JSON.parse(stripMarkdown(reply.text)) as AiValidationResult;
        attempts.push({ provider: provider.name, model: provider.model, ok: true, durationMs: Date.now() - t0 });

        const failedKeys = Object.entries(result.checklist ?? {}).filter(([, ok]) => !ok).map(([k]) => k);
        console.info(
          `[ai-validation] ${provider.name}/${provider.model} type=${expectedType} crops=${crops.length} ` +
          `attempt=${attempt} ${Date.now() - t0}ms confidence=${result.confidence} valid=${result.valid} ` +
          `failed=[${failedKeys.join(',')}] uncertainties=${JSON.stringify(result.uncertainties ?? [])} ` +
          `reason=${JSON.stringify(result.reason)}`,
        );

        return {
          result,
          provider: provider.name,
          model: provider.model,
          durationMs: Date.now() - started,
          usage: addUsage(wastedUsage, usage),
          cropCount: crops.length,
          rawText,
          attempts,
        };
      } catch (err) {
        const message = (err as Error).message;
        const badJson = err instanceof SyntaxError;
        attempts.push({ provider: provider.name, model: provider.model, ok: false, error: message, durationMs: Date.now() - t0 });
        console.warn(
          `AI provider ${provider.name} failed (attempt ${attempt}/${MAX_JSON_ATTEMPTS}):`, message,
          rawText ? `| raw reply: ${rawText.slice(0, 300)}` : '',
        );
        if (badJson && attempt < MAX_JSON_ATTEMPTS) {
          wastedUsage = addUsage(wastedUsage, usage);
          continue; // retry the same provider once
        }
        break; // give up on this provider, try the next one
      }
    }
  }

  return failedRun('All AI providers unavailable or failed', crops.length);
}

export async function validateImage(
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string
): Promise<AiValidationResult> {
  return (await runValidation(imageBytes, mimeType, expectedType)).result;
}
