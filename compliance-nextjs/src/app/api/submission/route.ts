import { NextRequest, NextResponse } from 'next/server';
import { validateImageBuffer } from '@/lib/utils/magic-bytes';
import { storeImage, getPublicUrl } from '@/lib/utils/file-storage';
import { generateSavedName } from '@/lib/utils/image-rename';
import { isTypeSupported, getAllowedExtensions } from '@/lib/services/excel-mapping';
import { validateImage } from '@/lib/services/ai-validation';
import { decide, normalizeSerial, CONFIDENCE_REJECT_BELOW } from '@/lib/services/validation-policy';
import { save } from '@/lib/db/submission-repo';
import type { Submission } from '@/lib/storage/json-storage';
import { updateTrackingExcel, buildSeedValues } from '@/lib/services/excel-update';
import { readAll as readAllTracking } from '@/lib/db/tracking-repo';
import type { TrackingMember } from '@/lib/db/tracking-repo';

export const maxDuration = 60;

/** Human-readable label for every structured checklist key the AI can return. */
const CHECKLIST_LABELS: Record<string, string> = {
  // Windows
  hasClock:            'System clock not visible on the taskbar (dates inside web pages do not count)',
  hasWindowsUpdate:    "Windows Update does not show \"You're up to date\"",
  hasDeviceName:       'Device name not fully readable (hidden, masked or truncated)',
  hasDeviceSerial:     'Device serial number not fully readable, or serial numbers in the screenshot do not match',
  hasDashboard:        'SEED dashboard not visible or counter values unreadable',
  // Mac
  hasTrellix:          "Trellix status not visible or not showing \"ok\" / \"turned on\"",
  hasSeedDashboard:    'SEED dashboard with device name, serial, and 4+ counters not visible',
  hasTimestamp:        'System clock not visible in the macOS menu bar (dates inside web pages do not count)',
  hasMacInfo:          'About This Mac not visible with the model name and complete serial number',
  // Thin
  hasVirusThreatProtection:     "Virus & threat protection does not show a green tick",
  hasAccountProtection:         "Account protection does not show a green tick",
  hasFirewallNetworkProtection: "Firewall & network protection does not show a green tick",
  hasAppBrowserControl:         "App & browser control does not show a green tick",
  hasDeviceSecurity:            "Device security does not show a green tick",
  hasDevicePerformanceHealth:   "Device performance & health does not show \"No action needed\"",
  hasSerialNumber:              'Terminal output showing the complete serial number not visible',
};

/** What the user should do to fix each failed checklist item. Shown next to the failed item. */
const CHECKLIST_GUIDES: Record<string, string> = {
  hasClock:            'Include the Windows taskbar so the system clock is readable. Dates inside web pages (for example a page footer) do not count.',
  hasWindowsUpdate:    'Open Settings > Windows Update, install any pending updates and restart, then screenshot the page showing "You\'re up to date".',
  hasDeviceName:       'Make sure the complete device name is visible: not masked, blacked-out, cut off or covered by another window (Settings > System > About, or the SEED page).',
  hasDeviceSerial:     'Make sure the complete serial number is visible: not masked, blurred, cut off or covered by another window.',
  hasDashboard:        'Open the SEED dashboard and capture it in full so all four counters (Malware Alerts, Compliance Checks, SEED Configuration, Operating System) are readable.',
  hasTrellix:          'Open Trellix and capture the window showing the status "ok" / "turned on". If it is off or shows a warning, fix that first and then retake the screenshot.',
  hasSeedDashboard:    'Open the SEED dashboard and capture it with the device name, serial number and all counters visible.',
  hasTimestamp:        'Include the macOS menu bar so the system clock is readable. Dates inside web pages (for example a page footer) do not count.',
  hasMacInfo:          'Open the Apple menu > About This Mac and include the model name and the complete serial number.',
  hasVirusThreatProtection:     'Open Windows Security and capture the page where Virus & threat protection shows a green tick. If it shows a warning, resolve it first.',
  hasAccountProtection:         'Open Windows Security and capture the page where Account protection shows a green tick. If it shows a warning, resolve it first.',
  hasFirewallNetworkProtection: 'Open Windows Security and capture the page where Firewall & network protection shows a green tick. If it shows a warning, resolve it first.',
  hasAppBrowserControl:         'Open Windows Security and capture the page where App & browser control shows a green tick. If it shows a warning, resolve it first.',
  hasDeviceSecurity:            'Open Windows Security and capture the page where Device security shows a green tick. If it shows a warning, resolve it first.',
  hasDevicePerformanceHealth:   'Open Windows Security and capture the page where Device performance & health shows "No action needed".',
  hasSerialNumber:              'Run the command that prints the serial number and capture the terminal so the full serial is visible. A serial that wraps onto a second line is fine.',
  hasFullScan:                  'Run a full scan, wait until it completes, then capture the scan result page.',
};
CHECKLIST_LABELS.hasFullScan = 'Full scan result not visible or the scan has not completed';

interface FailedItem { check: string; guide: string }

/** Failed checklist entries (key -> false) as human-readable item + the action to fix it. */
function deriveFailedItems(checklist: Record<string, boolean> | undefined): FailedItem[] {
  if (!checklist) return [];
  return Object.entries(checklist)
    .filter(([, passed]) => !passed)
    .map(([key]) => ({ check: CHECKLIST_LABELS[key] ?? key, guide: CHECKLIST_GUIDES[key] ?? '' }));
}

/**
 * Every non-success outcome uses this one shape so the form can render it in the same bottom panel as a
 * rejected image (red) - a specific reason, the things that failed, and what the user should do next.
 */
function failure(
  status: number,
  o: { title?: string; reason: string; items?: FailedItem[]; suggestion?: string },
): NextResponse {
  const items = o.items ?? [];
  return NextResponse.json({
    valid: false,
    matchesType: false,
    confidence: 0,
    message: o.reason,
    title: o.title,
    reason: o.reason,
    failedChecks: items.map(i => i.check),
    guidelines: items.map(i => i.guide),
    suggestion: o.suggestion,
  }, { status });
}

/**
 * The account typed in the form must be EXACTLY an account the admin configured (same value, ignoring
 * case and surrounding spaces). No matching on e-mail or name, and rows removed from tracking do not count.
 */
function findRegisteredAccountRow(rows: TrackingMember[], account: string): TrackingMember | undefined {
  const wanted = account.trim().toLowerCase();
  if (!wanted) return undefined;
  return rows.find(r => !r.removedFromTracking && (r.account ?? '').trim().toLowerCase() === wanted);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const account = (formData.get('account') as string | null)?.trim();
    const submissionType = (formData.get('submissionType') as string | null)?.trim();
    const imageFile = formData.get('image') as File | null;

    if (!account) return failure(400, {
      title: 'Account is missing',
      reason: 'No account was provided with this submission.',
      items: [{ check: 'Account field is empty', guide: 'Enter your account (the same one registered in the compliance tracking list) and submit again.' }],
    });
    if (!submissionType) return failure(400, {
      title: 'Submission type is missing',
      reason: 'No submission type (Windows / Mac / Thin ...) was selected.',
      items: [{ check: 'Type is not selected', guide: 'Choose the type that matches the device in your screenshot and submit again.' }],
    });
    if (!imageFile) return failure(400, {
      title: 'Image is missing',
      reason: 'No image file was received by the server.',
      items: [{ check: 'No image attached', guide: 'Select or paste your screenshot again, wait for the preview to appear, then submit.' }],
    });

    // Validate type
    if (!isTypeSupported(submissionType)) {
      return failure(400, {
        title: 'Unsupported submission type',
        reason: `The submission type "${submissionType}" is not supported.`,
        items: [{ check: `Type "${submissionType}" is not in the supported list`, guide: 'Reload the page and pick the type from the dropdown. If the type you need is missing, contact your administrator.' }],
      });
    }

    // Read tracking rows once — reused for both the early account check and post-AI serial check
    const trackingRows = await readAllTracking();

    // Early account check: the account must be one the admin registered. Never create users from submissions.
    // Done before the AI call to save cost, and applies even when the tracking list is empty.
    const accountRow = findRegisteredAccountRow(trackingRows, account);
    if (!accountRow) {
      return failure(422, {
        title: 'User not found',
        reason: `We could not find the account "${account}" in the compliance system, so your image was not checked.`,
        items: [{
          check: `Account "${account}" is not registered`,
          guide: 'Check that you typed your account exactly as it was registered (no extra spaces). If it is correct, you have not been registered in the system yet: please contact your administrator for support.',
        }],
        suggestion: 'Nothing was saved. Ask your administrator to add you to the tracking list, then submit again.',
      });
    }

    // Read image bytes
    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBytes = Buffer.from(arrayBuffer);

    // Dual validation: MIME + magic bytes
    let ext: string;
    try {
      const validated = validateImageBuffer(imageBytes, imageFile.type, imageFile.name, imageFile.size);
      ext = validated.ext;
    } catch (err) {
      const msg = (err as Error).message;
      const tooBig = /10MB/i.test(msg);
      return failure(400, {
        title: tooBig ? 'Image is too large' : 'Image file is not valid',
        reason: msg,
        items: [{
          check: tooBig ? 'File is larger than 10 MB' : 'File is not a valid JPG / PNG / WEBP image',
          guide: tooBig
            ? 'Take the screenshot again (a normal full-screen capture is well under 10 MB) or save it as JPG, then submit again.'
            : 'Do not rename other file types to .png/.jpg. Take a fresh screenshot (Win+Shift+S on Windows, Cmd+Shift+4 on Mac), save it as PNG or JPG, and upload that file.',
        }],
      });
    }

    // Check extension against allowed types for submission type
    const allowedExts = getAllowedExtensions(submissionType);
    const extWithoutDot = ext.replace('.', '');
    const extJpeg = extWithoutDot === 'jpg' ? 'jpeg' : extWithoutDot;
    if (!allowedExts.includes(extWithoutDot) && !allowedExts.includes(extJpeg)) {
      return failure(400, {
        title: 'Image format not allowed',
        reason: `The format "${extWithoutDot}" is not accepted for type "${submissionType}". Allowed formats: ${allowedExts.join(', ')}.`,
        items: [{ check: `Format "${extWithoutDot}" not allowed`, guide: `Save or convert your screenshot to one of: ${allowedExts.join(', ')} and upload it again.` }],
      });
    }

    // AI validation
    const aiResult = await validateImage(imageBytes, imageFile.type, submissionType);
    const confidence = Number(aiResult.confidence ?? 0);
    const decision = decide(aiResult);

    // Post-AI cross-validation: the serial in the image must be the one registered for THIS account.
    const extractedSerial = normalizeSerial(aiResult.deviceSerial);
    if (extractedSerial) {
      const rowSerial = normalizeSerial(accountRow.serial);
      if (!rowSerial) {
        return failure(422, {
          title: 'Device not registered',
          reason: `No device serial number is registered for account "${account}", so your screenshot cannot be verified.`,
          items: [{
            check: 'No device serial registered for your account',
            guide: 'Please contact your administrator for support: ask them to add your device serial number to the tracking list, then submit again.',
          }],
          suggestion: 'Nothing was saved.',
        });
      }
      if (extractedSerial !== rowSerial) {
        return failure(422, {
          title: 'Screenshot is from a different device',
          reason: `The serial number in your screenshot ("${aiResult.deviceSerial}") does not match the device registered for account "${account}".`,
          items: [{
            check: 'Serial number does not match your registered device',
            guide: `Submit a screenshot taken on your own registered laptop, and check that "${account}" is your own account. If you were issued a new or replacement device, please contact your administrator to update the device serial in the tracking list, then submit again.`,
          }],
          suggestion: 'Nothing was saved. Once you are on the right device (or the record is updated), submit again.',
        });
      }
    }

    // AI service itself failed (no provider answered) - the image was never judged, so say that clearly
    if (!aiResult.valid && confidence === 0 && !aiResult.checklist && /AI providers/i.test(aiResult.reason ?? '')) {
      return failure(503, {
        title: 'Validation service unavailable',
        reason: 'Your image could not be checked because the AI validation service did not respond. This is not a problem with your screenshot.',
        items: [{
          check: 'AI validation service unavailable',
          guide: 'Wait 1-2 minutes and submit the same image again. If it still fails after a few tries, send your account and the time of the attempt to your administrator.',
        }],
      });
    }

    // If AI validation failed (or confidence is below 100), return result without saving image or record
    if (decision.verdict === 'reject') {
      // Structured checklist items first (each with its own fix), then any extra items the AI returned
      const checklistItems = deriveFailedItems(Object.fromEntries(decision.failedKeys.map(k => [k, false])));
      const aiOnlyItems: FailedItem[] = (aiResult.failedChecks ?? [])
        .map((c, i) => ({ check: c, guide: aiResult.guidelines?.[i] ?? '' }))
        .filter(x => !checklistItems.some(f => f.check.toLowerCase().includes(x.check.toLowerCase().slice(0, 10))));
      const items = [...checklistItems, ...aiOnlyItems];

      // Confidence < 100 but nothing specific failed: tell the user how to get a clearer capture
      if (items.length === 0) {
        items.push({
          check: decision.rejectReasons[0] ?? `Image is not clear or complete enough (${confidence}% confidence - at least ${CONFIDENCE_REJECT_BELOW}% required)`,
          guide: 'Retake the screenshot so every required item is fully visible and sharp: no overlapping windows, no blurry or tiny text, no glare if photographed, and the complete serial number readable. Then submit that new image.',
        });
      }

      const rejectionResult = {
        ...aiResult,
        valid: false,
        title: 'Image Not Valid',
        reason: aiResult.valid
          ? decision.rejectReasons.join(' ')
          : (aiResult.reason || 'The image did not meet the compliance requirements.'),
        failedChecks: items.map(i => i.check),
        guidelines: items.map(i => i.guide),
        suggestion: aiResult.suggestion ?? 'Fix every item above, take a new screenshot, and submit again.',
      };

      return NextResponse.json({
        account,
        submissionType,
        status: 'REJECTED',
        validationResult: JSON.stringify(rejectionResult),
      });
    }

    // Save image only after AI validation passed
    const savedName = generateSavedName(account, submissionType, ext);
    await storeImage(imageBytes, savedName);
    const imageUrl = getPublicUrl(savedName);

    // Build and persist submission
    const failedChecks = aiResult.failedChecks ?? [];
    const [malwareAlerts, complianceCheck, seedConfiguration, operatingSystem] = buildSeedValues(aiResult);

    // Accepted with 80-98% confidence: keep warnings for the admin only.
    const warnings = decision.verdict === 'accept_warning' ? [...decision.warnings] : [];
    const savedResult = { ...aiResult, warning: warnings.length > 0, warnings };

    const submission: Submission = {
      id: 0,
      account,
      submissionType,
      imagePath: savedName,
      imageUrl,
      imageOriginalName: imageFile.name,
      imageSavedName: savedName,
      status: 'PENDING',
      validationResult: JSON.stringify(savedResult),
      validationChecklist: JSON.stringify(failedChecks),
      confidenceScore: aiResult.confidence,
      submissionDate: new Date().toISOString(),
      // SEED / Trellix values extracted by AI
      malwareAlerts,
      complianceCheck,
      seedConfiguration,
      operatingSystem,
      // Device identifiers extracted by AI
      deviceSerial: aiResult.deviceSerial ?? undefined,
      deviceName: aiResult.deviceName ?? undefined,
    };

    // Extract type-specific checklist items
    if (submissionType.toLowerCase() === 'windows') {
      submission.hasClock = !failedChecks.some(c => c.toLowerCase().includes('clock'));
      submission.hasWindowsUpdate = !failedChecks.some(c => c.toLowerCase().includes('update'));
      submission.hasDeviceName = !failedChecks.some(c => c.toLowerCase().includes('device name'));
      submission.hasDeviceSerial = !failedChecks.some(c => c.toLowerCase().includes('serial'));
    } else if (submissionType.toLowerCase() === 'thin') {
      const cl = aiResult.checklist ?? {};
      // ── SECURITY AT A GLANCE checks (commented out — replaced by full scan check) ──
      // submission.hasThinVirusThreatProtection   = cl['hasVirusThreatProtection']     ?? !failedChecks.some(c => c.toLowerCase().includes('virus'));
      // submission.hasThinAccountProtection       = cl['hasAccountProtection']         ?? !failedChecks.some(c => c.toLowerCase().includes('account protection'));
      // submission.hasThinFirewallNetworkProtection = cl['hasFirewallNetworkProtection'] ?? !failedChecks.some(c => c.toLowerCase().includes('firewall'));
      // submission.hasThinAppBrowserControl       = cl['hasAppBrowserControl']         ?? !failedChecks.some(c => c.toLowerCase().includes('app') && c.toLowerCase().includes('browser'));
      // submission.hasThinDeviceSecurity          = cl['hasDeviceSecurity']            ?? !failedChecks.some(c => c.toLowerCase().includes('device security'));
      // submission.hasThinDevicePerformanceHealth = cl['hasDevicePerformanceHealth']   ?? !failedChecks.some(c => c.toLowerCase().includes('performance') || c.toLowerCase().includes('health'));
      // ── Active checks ────────────────────────────────────────────────────────────────
      submission.hasThinWindowsUpdate           = cl['hasWindowsUpdate']             ?? !failedChecks.some(c => c.toLowerCase().includes('update'));
      submission.hasThinSerialNumber            = cl['hasSerialNumber']              ?? !failedChecks.some(c => c.toLowerCase().includes('serial'));
      // hasThinVirusThreatProtection reused to store full-scan result
      submission.hasThinVirusThreatProtection   = cl['hasFullScan']                  ?? !failedChecks.some(c => c.toLowerCase().includes('full scan') || c.toLowerCase().includes('scan'));
      if (aiResult.deviceSerial) submission.deviceSerial = aiResult.deviceSerial;
    } else if (submissionType.toLowerCase() === 'mac') {
      submission.hasSeedDashboard = !failedChecks.some(c => c.toLowerCase().includes('seed'));
      submission.hasTrellix = !failedChecks.some(c => c.toLowerCase().includes('trellix'));
      submission.hasTimestamp = !failedChecks.some(c => c.toLowerCase().includes('timestamp'));
      submission.hasMacInfo = !failedChecks.some(c =>
        c.toLowerCase().includes('mac info') || c.toLowerCase().includes('system info')
      );
    }

    const saved = await save(submission);

    updateTrackingExcel(submissionType, aiResult, account).catch(err =>
      console.error('[submission] excel-update failed:', (err as Error).message)
    );

    return NextResponse.json({
      id: saved.id,
      account: saved.account,
      submissionType: saved.submissionType,
      imageUrl: saved.imageUrl,
      imageSavedName: saved.imageSavedName,
      status: saved.status,
      validationResult: saved.validationResult,
      submissionDate: saved.submissionDate,
    });
  } catch (err) {
    console.error('Submission error:', err);
    return failure(500, {
      title: 'Something went wrong on the server',
      reason: 'The server hit an unexpected error while processing your submission. Your image was not saved.',
      items: [{
        check: 'Unexpected server error',
        guide: 'Try submitting again. If it keeps failing, send your account, the time of the attempt and a screenshot of this message to your administrator.',
      }],
    });
  }
}
