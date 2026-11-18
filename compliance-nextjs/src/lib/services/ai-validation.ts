import { buildImageCrops, type ImageCrop } from '@/lib/utils/image-crops';
import { CONFIDENCE_CLEAN_FROM } from './validation-policy';

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

// SEED renamed the "Malware Alerts" tile to "Security Alerts"; both are the same counter.
const SEED_TILE_NAMES = `The first counter tile is titled "Security Alerts" in current SEED versions and "Malware Alerts" in older ones - both are the same counter and both are acceptable; never fail the check because of which of the two names is shown. Small wording differences in tile titles (e.g. "Compliance Checks/Trellix", "OS") are also acceptable as long as four counter tiles with numbers are visible.`;

const WINDOWS_PROMPT = `You are a compliance image validator for Windows device verification.

The submitted screenshot MUST satisfy ALL of the following checks. Every single check must pass for valid=true.

1. hasDashboard - SEED DASHBOARD: The SEED dashboard is clearly visible showing the device name, device serial number, and all 4 metric counters: Security Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable). ${SEED_TILE_NAMES}

2. hasClock - SYSTEM CLOCK: The operating system's own clock (date and/or time) is visible on the Windows taskbar. See the SYSTEM CLOCK rule below.

3. hasWindowsUpdate - WINDOWS UPDATE: The Windows Settings > Windows Update page is visible with the heading "Windows Update" and the status "You're up to date" (or an equivalent completion message).

4. hasDeviceName - DEVICE NAME: The complete device name is readable (SEED dashboard device info, Settings > System > About, title bar, etc.).

5. hasDeviceSerial - DEVICE SERIAL: The complete device serial number is readable (SEED dashboard, system info, Settings, etc.).

ALL five checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: deviceSerial, deviceName.
SEED DASHBOARD COUNTERS: If hasDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) - no units or labels.
- malwareAlerts: integer shown in the "Security Alerts" tile (older SEED versions call it "Malware Alerts")
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

1. hasSeedDashboard - SEED DASHBOARD: The SEED dashboard is clearly visible showing the device name and all 4 metric counters: Security Alerts, Compliance Checks, SEED Configuration, and Operating System (any numeric values including 0 are acceptable). ${SEED_TILE_NAMES} Any device name or serial shown on the dashboard must be completely readable.

2. hasTimestamp - SYSTEM CLOCK: The operating system's own clock (date and/or time) is visible in the macOS menu bar. See the SYSTEM CLOCK rule below.

3. hasMacInfo - MAC SYSTEM INFO: macOS system info is visible (System Settings > General > About, or Apple menu > About This Mac) showing at least the model name and the complete serial number.

4. hasDeviceSerial - DEVICE SERIAL: The complete serial number is readable, and every serial shown in the image (About This Mac, SEED dashboard, ...) is identical.

ALL four checks must pass for valid=true. If even one fails, set valid=false and list only the actually failing items in failedChecks.

ALSO EXTRACT: deviceName and deviceSerial.

SEED DASHBOARD COUNTERS: If hasSeedDashboard=true, read the 4 numeric counter values from the SEED dashboard tiles and populate seedDashboard. Values MUST be plain integers (e.g. 4, 19, 0) - no units or labels.
- malwareAlerts: integer shown in the "Security Alerts" tile (older SEED versions call it "Malware Alerts")
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
  /**
   * The serial registered for the account. Never sent to the model: it only triggers an independent re-read when
   * the extracted serial differs from it (see verifySerial).
   */
  registeredSerial?: string | null;
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
  choices?: [{ message?: { content?: string | null }; finish_reason?: string }];
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
  timeoutMs?: number,
): Promise<{ text: string; usage: TokenUsage | null }> {
  if (!provider.apiKey) throw new Error(`${provider.name} API key not configured`);

  const base64Image = imageBytes.toString('base64');
  const systemPrompt = selectPrompt(expectedType);
  const baseText = `Expected submission type: ${expectedType}. Validate this image.`;
  const userText = crops.length > 0
    ? `${baseText}\n\nThe FIRST image is the full screenshot and is the one you judge. The ${crops.length} images after it are enlarged views of the SAME screenshot, left / middle / right parts that overlap each other (so the same text can appear in two of them): first a set with enhanced contrast, then a set in the original colours. Use them only to read small text, labels, numbers, dates and times more reliably; the full screenshot decides what is visible. Do not treat them as separate submissions.\n\nIMPORTANT: the edges of these enlarged views are artificial cuts, NOT edges of the screenshot or of a window. Text that is cut at the border of one enlarged view is NOT "cut off": find it whole in the full screenshot or in the overlapping neighbouring view before judging it. Never mark a serial number, device name or label as cut off, partly hidden or unreadable only because it touches the border of an enlarged view.`
    : baseText;

  const imageParts = [
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
    ...crops.flatMap(crop => [
      { type: 'text', text: `Crop: ${crop.label}` },
      { type: 'image_url', image_url: { url: `data:${crop.mimeType};base64,${crop.bytes.toString('base64')}`, detail: 'high' } },
    ]),
  ];

  return postChat(provider, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: [{ type: 'text', text: userText }, ...imageParts] },
  ], timeoutMs);
}

/** One chat-completions round trip (shared by the main validation and the focused serial reads). */
async function postChat(
  provider: AiProvider,
  messages: unknown[],
  timeoutMs?: number,
): Promise<{ text: string; usage: TokenUsage | null }> {
  if (!provider.apiKey) throw new Error(`${provider.name} API key not configured`);

  const body = {
    model: provider.model,
    messages,
    // The answer carries per-item evidence, so it is longer than a plain verdict. Reasoning models (gpt-5.x/6)
    // also spend this budget on hidden reasoning tokens: too small a value leaves the visible reply EMPTY.
    // Some newer models only accept `max_completion_tokens`, hence the configurable parameter name.
    [process.env.AI_MAX_TOKENS_PARAM || 'max_tokens']: maxTokens(),
    ...(process.env.AI_REASONING_EFFORT ? { reasoning_effort: process.env.AI_REASONING_EFFORT } : {}),
  };

  const url = provider.endpoint.endsWith('/v1/chat/completions')
    ? provider.endpoint
    : `${provider.endpoint}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new Error(`${provider.name} timed out after ${timeoutMs}ms`);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error(`${provider.name} rate limit exceeded`);
    throw new Error(`${provider.name} API error ${res.status}: ${text}`);
  }

  // Read as text first: an empty/non-JSON body would otherwise surface as a cryptic "Unexpected end of JSON input".
  const bodyText = await res.text();
  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(bodyText) as ChatCompletionResponse;
  } catch {
    throw new Error(`${provider.name} returned a non-JSON HTTP body (status ${res.status}): ${bodyText.slice(0, 300) || '<empty>'}`);
  }
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content || !content.trim()) {
    const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens;
    throw new Error(
      `${provider.name} returned an empty reply (finish_reason=${choice?.finish_reason ?? 'unknown'}, ` +
      `completion_tokens=${data.usage?.completion_tokens ?? '?'}, reasoning_tokens=${reasoning ?? '?'}). ` +
      `If finish_reason=length, raise AI_MAX_TOKENS or lower AI_REASONING_EFFORT.`,
    );
  }
  const u = data.usage;
  const usage: TokenUsage | null = u
    ? {
        promptTokens: u.prompt_tokens ?? null,
        completionTokens: u.completion_tokens ?? null,
        totalTokens: u.total_tokens ?? null,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
      }
    : null;
  return { text: content, usage };
}

function maxTokens(): number {
  const n = parseInt(process.env.AI_MAX_TOKENS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 4096;
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

const SERIAL_READ_PROMPT = `You are an OCR specialist. The images are the SAME screenshot: first the full image, then overlapping enlarged tiles of it (contrast-enhanced and original colours), so the same text may appear in two tiles. Find the device SERIAL NUMBER (next to a label such as "Serial", "Serial number", "Device serial", or the output of a serial command in a terminal) and transcribe it exactly.

Method - follow it strictly:
1. Locate the serial in the sharpest tile that shows it completely.
2. Spell it ONE CHARACTER AT A TIME into "chars", left to right. Do not read it as a word and do not "correct" it.
3. For each character decide letter vs digit from the glyph shape, not from what looks plausible:
   - "5" has a flat top bar and a straight vertical stroke on its upper left; "S" is curved all the way through with no flat top.
   - "0" (zero) is narrower and more oval than the round "O"; "1" has a flag/serif at the top, "I" is a plain bar, "l" is a tall plain bar.
   - "8" has two closed loops; "B" has a straight vertical stroke on its left side. "2" has a flat base; "Z" has a flat top and base with a diagonal.
4. Serial numbers are uppercase letters and digits only, with no spaces. If the value wraps onto two lines, join them.
5. If ANY character cannot be told apart with certainty, list it in "ambiguous" (for example "position 1: 5 or S") and set "legible" to false. Never guess.
6. If no serial number is visible, or it is blurred, masked, covered or cut off, return "serial": null and "legible": false. The border of an enlarged tile is an artificial cut, not the edge of the screenshot: if the serial touches a tile border, read it whole from the full image or the overlapping neighbouring tile instead of calling it cut off.

Respond ONLY with JSON (no markdown):
{"serial":"5CD346FHVH","chars":["5","C","D","3","4","6","F","H","V","H"],"legible":true,"ambiguous":[]}`;



/** Focused serial re-reads run only when the serial from the main read does not equal the registered one. 0 = off. */
function serialExtraReads(): number {
  const n = parseInt(process.env.AI_SERIAL_VOTES ?? '1', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

function envMs(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normSerialText(v: string | null | undefined): string {
  return (v ?? '').replace(/[\s​]+/g, '').toUpperCase();
}

async function readSerialOnce(
  provider: AiProvider,
  imageBytes: Buffer,
  mimeType: string,
  tiles: ImageCrop[],
  timeoutMs: number,
): Promise<{ serial: string | null; usage: TokenUsage | null }> {
  const content: unknown[] = [
    { type: 'text', text: 'Read the device serial number from this screenshot.' },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBytes.toString('base64')}`, detail: 'high' } },
    ...tiles.flatMap(t => [
      { type: 'text', text: `Enlarged tile: ${t.label}` },
      { type: 'image_url', image_url: { url: `data:${t.mimeType};base64,${t.bytes.toString('base64')}`, detail: 'high' } },
    ]),
  ];
  const reply = await postChat(provider, [
    { role: 'system', content: SERIAL_READ_PROMPT },
    { role: 'user', content },
  ], timeoutMs);
  const parsed = JSON.parse(stripMarkdown(reply.text)) as { serial?: string | null; chars?: string[]; legible?: boolean };
  // Prefer the character-by-character spelling when present: it is the more careful transcription.
  const spelled = Array.isArray(parsed.chars) ? normSerialText(parsed.chars.join('')) : '';
  const serial = normSerialText(spelled || parsed.serial);
  if (parsed.legible === false || !serial) return { serial: null, usage: reply.usage };
  return { serial, usage: reply.usage };
}

interface Reading {
  result: AiValidationResult;
  rawText: string;
  usage: TokenUsage | null;
}

/** One full validation call. A malformed JSON reply is usually a one-off glitch, so it gets one more try. */
async function readOnce(
  provider: AiProvider,
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string,
  crops: ImageCrop[],
  timeoutMs: number,
  canRetry: () => boolean,
): Promise<Reading> {
  let wasted: TokenUsage | null = null; // tokens burned by an earlier attempt that returned bad JSON
  for (let attempt = 1; ; attempt++) {
    let rawText = '';
    let usage: TokenUsage | null = null;
    try {
      const reply = await callProvider(provider, imageBytes, mimeType, expectedType, crops, timeoutMs);
      rawText = reply.text;
      usage = reply.usage;
      const result = JSON.parse(stripMarkdown(reply.text)) as AiValidationResult;
      return { result, rawText, usage: addUsage(wasted, usage) };
    } catch (err) {
      if (err instanceof SyntaxError && attempt < MAX_JSON_ATTEMPTS && canRetry()) {
        console.warn(`AI provider ${provider.name} bad JSON (attempt ${attempt}/${MAX_JSON_ATTEMPTS}) | raw reply: ${rawText.slice(0, 300)}`);
        wasted = addUsage(wasted, usage);
        continue;
      }
      throw err;
    }
  }
}

/** Nothing to double-check: everything passed, fully confident, and a serial was read. */
function isCleanPass(r: AiValidationResult): boolean {
  const checks = Object.values(r.checklist ?? {});
  return (
    r.valid === true &&
    r.matchesType === true &&
    checks.every(Boolean) &&
    Number(r.confidence) >= CONFIDENCE_CLEAN_FROM &&
    !!normSerialText(r.deviceSerial)
  );
}

/**
 * The comparison against the registered serial stays strictly equal (done by the caller). This only decides
 * whether the extracted value deserves a second, independent look BEFORE it is compared:
 *  - it already equals the registered serial -> verified, nothing more to do (the usual, fast path)
 *  - it differs -> one focused re-read (character-by-character, enlarged tiles). The registered serial is never
 *    shown to the model, so it cannot be nudged towards it.
 *      re-read equals the registered serial -> the first read was a one-off misread; use the re-read
 *      re-read equals the first read         -> two independent reads agree on a different serial: another device
 *      re-read gives a third value / nothing -> unreliable: no serial, so the user is asked for a clearer image
 */
async function verifySerial(
  provider: AiProvider,
  result: AiValidationResult,
  registeredSerial: string,
  imageBytes: Buffer,
  mimeType: string,
  crops: ImageCrop[],
  timeoutMs: number,
): Promise<TokenUsage | null> {
  const read = normSerialText(result.deviceSerial);
  const registered = normSerialText(registeredSerial);
  if (!read || !registered || read === registered) return null;

  let usage: TokenUsage | null = null;
  try {
    const again = await readSerialOnce(provider, imageBytes, mimeType, crops, timeoutMs);
    usage = again.usage;
    if (again.serial === registered) {
      console.info(`[ai-validation] serial re-read corrected "${read}" -> "${again.serial}"`);
      result.serialsSeen = (result.serialsSeen ?? []).map(s => (normSerialText(s) === read ? registered : s));
      result.deviceSerial = registered;
    } else if (again.serial === read) {
      console.info(`[ai-validation] serial confirmed by re-read: "${read}" (registered differs)`);
    } else if (!again.serial) {
      // The strict focused read could not decide (unreadable / a character in doubt). That is no evidence against the
      // first read, so keep it: the strict comparison with the registered serial still decides, nothing is accepted.
      console.warn(`[ai-validation] serial re-read inconclusive, keeping first read "${read}"`);
    } else {
      console.warn(`[ai-validation] serial reads disagree: "${read}" vs "${again.serial}"`);
      result.uncertainties = [
        ...(result.uncertainties ?? []),
        `The serial number was read differently each time (${[read, again.serial ?? 'unreadable'].join(' / ')}).`,
      ];
      result.deviceSerial = null;
    }
  } catch (err) {
    console.warn(`[ai-validation] serial re-read skipped: ${(err as Error).message}`);
  }
  return usage;
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

  // Hard time budget: the hosting platform kills the request at maxDuration (60 s on Vercel Hobby), so every call
  // gets the smaller of its own timeout and what is left, and extra reads are skipped once time is short.
  const totalBudget = envMs('AI_TOTAL_BUDGET_MS', 50_000);
  const escalateBefore = envMs('AI_ESCALATE_BEFORE_MS', 28_000);
  const requestTimeout = envMs('AI_REQUEST_TIMEOUT_MS', 30_000);
  const elapsed = () => Date.now() - started;
  const callTimeout = () => Math.min(requestTimeout, totalBudget - elapsed());
  const canEscalate = () => elapsed() < escalateBefore;

  const failedRun = (reason: string, cropCount: number): ValidationRun => ({
    result: { valid: false, matchesType: false, confidence: 0, reason },
    provider: null,
    model: null,
    durationMs: elapsed(),
    usage: null,
    cropCount,
    rawText: null,
    attempts,
  });

  if (providers.length === 0) return failedRun('No AI providers configured', 0);

  // Built once and reused by every call/provider.
  // AI_USE_CROPS=false: send only the original image (one call, no extra tiles).
  const useCrops = options.useCrops !== false && process.env.AI_USE_CROPS !== 'false';
  const crops = useCrops ? await buildImageCrops(imageBytes) : [];
  // Pass 1 stays light (full image + 3 enlarged original-colour tiles). The contrast tiles only join if needed.
  const leanCrops = crops.filter(c => c.kind === 'zoom');

  for (const provider of providers) {
    if (callTimeout() < 5_000) break; // not enough time left for another provider
    const t0 = Date.now();
    try {
      const p1 = await readOnce(provider, imageBytes, mimeType, expectedType, leanCrops, callTimeout(), canEscalate);
      let result = p1.result;
      let usage = p1.usage;
      let rawText = p1.rawText;
      let readings = 1;

      // Something is missing or uncertain: ONE more look with everything (contrast + enlarged tiles). It sees
      // strictly more than pass 1, so its answer replaces it.
      if (!isCleanPass(result) && crops.length > leanCrops.length && canEscalate() && callTimeout() > 5_000) {
        try {
          const p2 = await readOnce(provider, imageBytes, mimeType, expectedType, crops, callTimeout(), () => false);
          result = p2.result;
          usage = addUsage(usage, p2.usage);
          rawText = `${rawText}\n---\n${p2.rawText}`;
          readings = 2;
        } catch (err) {
          console.warn(`[ai-validation] second look failed, keeping the first reading: ${(err as Error).message}`);
        }
      }

      // Serial differs from the registered one: one independent focused re-read before the strict comparison.
      if (options.registeredSerial && serialExtraReads() > 0 && canEscalate() && callTimeout() > 5_000) {
        usage = addUsage(
          usage,
          await verifySerial(provider, result, options.registeredSerial, imageBytes, mimeType, crops, callTimeout()),
        );
      }

      attempts.push({ provider: provider.name, model: provider.model, ok: true, durationMs: Date.now() - t0 });
      const failedKeys = Object.entries(result.checklist ?? {}).filter(([, ok]) => !ok).map(([k]) => k);
      console.info(
        `[ai-validation] ${provider.name}/${provider.model} type=${expectedType} tiles=${leanCrops.length}${readings > 1 ? `+${crops.length - leanCrops.length}` : ''} ` +
        `readings=${readings} ${Date.now() - t0}ms confidence=${result.confidence} valid=${result.valid} ` +
        `serial=${JSON.stringify(result.deviceSerial ?? null)} seen=${JSON.stringify(result.serialsSeen ?? [])} ` +
        `failed=[${failedKeys.join(',')}] uncertainties=${JSON.stringify(result.uncertainties ?? [])} ` +
        `reason=${JSON.stringify(result.reason)}`,
      );

      return {
        result,
        provider: provider.name,
        model: provider.model,
        durationMs: elapsed(),
        usage,
        cropCount: readings > 1 ? crops.length : leanCrops.length,
        rawText,
        attempts,
      };
    } catch (err) {
      // Network/HTTP errors (rate limit, 5xx, timeout) are not retried here: they fall through to the next provider.
      attempts.push({ provider: provider.name, model: provider.model, ok: false, error: (err as Error).message, durationMs: Date.now() - t0 });
      console.warn(`AI provider ${provider.name} failed:`, (err as Error).message);
    }
  }

  return failedRun('All AI providers unavailable or failed', crops.length);
}

export async function validateImage(
  imageBytes: Buffer,
  mimeType: string,
  expectedType: string,
  options: RunOptions = {},
): Promise<AiValidationResult> {
  return (await runValidation(imageBytes, mimeType, expectedType, options)).result;
}
