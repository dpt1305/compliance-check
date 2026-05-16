import { NextRequest, NextResponse } from 'next/server';
import { validateImageBuffer } from '@/lib/utils/magic-bytes';
import { storeImage, getPublicUrl } from '@/lib/utils/file-storage';
import { generateSavedName } from '@/lib/utils/image-rename';
import { isTypeSupported, getAllowedExtensions } from '@/lib/services/excel-mapping';
import { validateImage } from '@/lib/services/ai-validation';
import { save } from '@/lib/db/submission-repo';
import type { Submission } from '@/lib/storage/json-storage';
import { updateTrackingExcel, buildSeedValues } from '@/lib/services/excel-update';
import { readAll as readAllTracking, accountInTracking, findRowForAccount } from '@/lib/db/tracking-repo';

export const maxDuration = 60;

/** Human-readable label for every structured checklist key the AI can return. */
const CHECKLIST_LABELS: Record<string, string> = {
  // Windows
  hasClock:            'System clock not visible in taskbar bottom-right corner',
  hasWindowsUpdate:    "Windows Update does not show \"You're up to date\"",
  hasDeviceName:       'Device name not fully visible (may be truncated)',
  hasDeviceSerial:     'Device serial number not fully visible (may be truncated)',
  hasDashboard:        'SEED dashboard not visible or counter values unreadable',
  // Mac
  hasTrellix:          "Trellix status not visible or not showing \"ok\" / \"turned on\"",
  hasSeedDashboard:    'SEED dashboard with device name, serial, and 4+ counters not visible',
  hasTimestamp:        'System timestamp not visible in top-right corner',
  hasMacInfo:          'Mac system info (model name + serial) not visible',
  // Thin
  hasVirusThreatProtection:     "Virus & threat protection does not show a green tick",
  hasAccountProtection:         "Account protection does not show a green tick",
  hasFirewallNetworkProtection: "Firewall & network protection does not show a green tick",
  hasAppBrowserControl:         "App & browser control does not show a green tick",
  hasDeviceSecurity:            "Device security does not show a green tick",
  hasDevicePerformanceHealth:   "Device performance & health does not show \"No action needed\"",
  hasSerialNumber:              'Terminal output showing serial number not visible',
};

/**
 * Given the AI's structured checklist (key → boolean), return an array of
 * human-readable descriptions for every item that is false/missing.
 */
function deriveFailedChecks(checklist: Record<string, boolean> | undefined): string[] {
  if (!checklist) return [];
  return Object.entries(checklist)
    .filter(([, passed]) => !passed)
    .map(([key]) => CHECKLIST_LABELS[key] ?? key);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const account = (formData.get('account') as string | null)?.trim();
    const submissionType = (formData.get('submissionType') as string | null)?.trim();
    const imageFile = formData.get('image') as File | null;

    if (!account) return NextResponse.json({ message: 'Account is required' }, { status: 400 });
    if (!submissionType) return NextResponse.json({ message: 'Submission type is required' }, { status: 400 });
    if (!imageFile) return NextResponse.json({ message: 'Image file is required' }, { status: 400 });

    // Validate type
    if (!isTypeSupported(submissionType)) {
      return NextResponse.json(
        { message: `Unsupported submission type: '${submissionType}'` },
        { status: 400 }
      );
    }

    // Read tracking rows once — reused for both the early account check and post-AI serial check
    const trackingRows = readAllTracking();

    // Early account check — reject immediately if account not in tracking.xlsx (saves AI cost)
    if (trackingRows.length > 0 && !accountInTracking(trackingRows, account)) {
      return NextResponse.json({
        valid: false,
        matchesType: false,
        confidence: 0,
        message: `Account "${account}" is not registered in the compliance tracking list. Please contact your administrator.`,
        reason: 'Account not found in tracking system',
        failedChecks: ['Account not registered in tracking system'],
        guidelines: ['Contact your administrator to register your account'],
      }, { status: 422 });
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
      return NextResponse.json({ message: (err as Error).message }, { status: 400 });
    }

    // Check extension against allowed types for submission type
    const allowedExts = getAllowedExtensions(submissionType);
    const extWithoutDot = ext.replace('.', '');
    const extJpeg = extWithoutDot === 'jpg' ? 'jpeg' : extWithoutDot;
    if (!allowedExts.includes(extWithoutDot) && !allowedExts.includes(extJpeg)) {
      return NextResponse.json(
        { message: `Image format '${extWithoutDot}' not allowed for type '${submissionType}'. Allowed: ${allowedExts.join(', ')}` },
        { status: 400 }
      );
    }

    // AI validation
    const aiResult = await validateImage(imageBytes, imageFile.type, submissionType);
    const confidence = Number(aiResult.confidence ?? 0);
    const hasPerfectConfidence = Number.isFinite(confidence) && confidence === 100;

    // Post-AI cross-validation: serial extracted from image must belong to THIS account's row
    if (trackingRows.length > 0) {
      const extractedSerial = aiResult.deviceSerial?.trim().toLowerCase();
      const extractedName   = aiResult.deviceName?.trim().toLowerCase();

      if (extractedSerial || extractedName) {
        const accountRow = findRowForAccount(trackingRows, account);

        if (accountRow) {
          const rowSerial = accountRow.serial?.trim().toLowerCase();
          const rowName   = accountRow.name?.trim().toLowerCase();

          // If AI found a serial, it must match the account's registered serial
          const serialMismatch = extractedSerial && rowSerial && extractedSerial !== rowSerial;
          // If AI found a device name and no serial match, check name doesn't belong to a DIFFERENT row
          const nameBelongsToDifferentRow = !serialMismatch && extractedName && rowName && extractedName !== rowName
            && trackingRows.some(r => r !== accountRow && r.name?.trim().toLowerCase() === extractedName);

          if (serialMismatch || nameBelongsToDifferentRow) {
            return NextResponse.json({
              valid: false,
              matchesType: false,
              confidence: 0,
              message: 'The device shown in the image does not match your registered device. Please submit a screenshot from your own device.',
              reason: serialMismatch
                ? `Device serial "${aiResult.deviceSerial}" does not match the serial registered for account "${account}"`
                : `Device name "${aiResult.deviceName}" is registered to a different account`,
              failedChecks: ['Device does not match account registration'],
              guidelines: ['Make sure you are submitting a screenshot from your own device'],
            }, { status: 422 });
          }
        }
      }
    }

    // If AI validation failed (or confidence is below 100), return result without saving image or record
    if (!aiResult.valid || !aiResult.matchesType || !hasPerfectConfidence) {
      // Derive structured failed checks from the checklist boolean map
      const checklistFailed = deriveFailedChecks(aiResult.checklist as Record<string, boolean> | undefined);

      // Merge: checklist-derived items first (structured), then any extra items AI returned
      const aiFailedChecks = aiResult.failedChecks ?? [];
      const mergedFailedChecks = [
        ...checklistFailed,
        ...aiFailedChecks.filter(c => !checklistFailed.some(f => f.toLowerCase().includes(c.toLowerCase().slice(0, 10)))),
      ];

      // If confidence < 100 but checklist all passed, add a generic clarity note
      if (!hasPerfectConfidence && mergedFailedChecks.length === 0) {
        mergedFailedChecks.push(`Image clarity or completeness below required threshold (${confidence}% confidence — 100% required)`);
      }

      const rejectionResult = {
        ...aiResult,
        valid: false,
        reason: !hasPerfectConfidence && aiResult.valid
          ? `Confidence ${confidence}% is below the required 100%. Please check the conditions listed below and retake your screenshot.`
          : (aiResult.reason || 'Image did not meet compliance requirements.'),
        failedChecks: mergedFailedChecks,
        guidelines: aiResult.guidelines ?? [],
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

    const submission: Submission = {
      id: 0,
      account,
      submissionType,
      imagePath: savedName,
      imageUrl,
      imageOriginalName: imageFile.name,
      imageSavedName: savedName,
      status: 'PENDING',
      validationResult: JSON.stringify(aiResult),
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
      submission.hasThinVirusThreatProtection   = cl['hasVirusThreatProtection']     ?? !failedChecks.some(c => c.toLowerCase().includes('virus'));
      submission.hasThinAccountProtection       = cl['hasAccountProtection']         ?? !failedChecks.some(c => c.toLowerCase().includes('account protection'));
      submission.hasThinFirewallNetworkProtection = cl['hasFirewallNetworkProtection'] ?? !failedChecks.some(c => c.toLowerCase().includes('firewall'));
      submission.hasThinAppBrowserControl       = cl['hasAppBrowserControl']         ?? !failedChecks.some(c => c.toLowerCase().includes('app') && c.toLowerCase().includes('browser'));
      submission.hasThinDeviceSecurity          = cl['hasDeviceSecurity']            ?? !failedChecks.some(c => c.toLowerCase().includes('device security'));
      submission.hasThinDevicePerformanceHealth = cl['hasDevicePerformanceHealth']   ?? !failedChecks.some(c => c.toLowerCase().includes('performance') || c.toLowerCase().includes('health'));
      submission.hasThinWindowsUpdate           = cl['hasWindowsUpdate']             ?? !failedChecks.some(c => c.toLowerCase().includes('update'));
      submission.hasThinSerialNumber            = cl['hasSerialNumber']              ?? !failedChecks.some(c => c.toLowerCase().includes('serial'));
      if (aiResult.deviceSerial) submission.deviceSerial = aiResult.deviceSerial;
    } else if (submissionType.toLowerCase() === 'mac') {
      submission.hasSeedDashboard = !failedChecks.some(c => c.toLowerCase().includes('seed'));
      submission.hasTrellix = !failedChecks.some(c => c.toLowerCase().includes('trellix'));
      submission.hasTimestamp = !failedChecks.some(c => c.toLowerCase().includes('timestamp'));
      submission.hasMacInfo = !failedChecks.some(c =>
        c.toLowerCase().includes('mac info') || c.toLowerCase().includes('system info')
      );
    }

    const saved = save(submission);

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
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
