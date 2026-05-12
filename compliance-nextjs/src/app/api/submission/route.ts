import { NextRequest, NextResponse } from 'next/server';
import { validateImageBuffer } from '@/lib/utils/magic-bytes';
import { storeImage, getPublicUrl } from '@/lib/utils/file-storage';
import { generateSavedName } from '@/lib/utils/image-rename';
import { isTypeSupported, getAllowedExtensions } from '@/lib/services/excel-mapping';
import { validateImage } from '@/lib/services/ai-validation';
import { save } from '@/lib/storage/json-storage';
import type { Submission } from '@/lib/storage/json-storage';
import { updateTrackingExcel, buildSeedValues } from '@/lib/services/excel-update';
import { readTrackingRows, accountInTracking, findRowForAccount } from '@/lib/services/tracking-reader';
import { existingTrackingPath } from '@/lib/utils/tracking-path';

export const maxDuration = 60;

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
    const trackingRows = existingTrackingPath() ? await readTrackingRows() : [];

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

    // If AI validation failed, return result without saving image or record
    if (!aiResult.valid || !aiResult.matchesType) {
      return NextResponse.json({
        account,
        submissionType,
        status: 'REJECTED',
        validationResult: JSON.stringify(aiResult),
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
      status: 'APPROVED',
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
      submission.hasDashboard = !failedChecks.some(c => c.toLowerCase().includes('dashboard'));
    } else if (submissionType.toLowerCase() === 'thin') {
      submission.hasTrellix = !failedChecks.some(c => c.toLowerCase().includes('trellix'));
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
