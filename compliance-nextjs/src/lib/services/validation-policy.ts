import type { AiValidationResult } from './ai-validation';

/**
 * Single source of truth for turning an AI answer into a decision.
 * Used by the submission API and by the offline evaluation script so both behave identically.
 *
 *   confidence < 80      -> reject
 *   80 <= confidence <= 98 -> accept, flagged with warnings (admin sees them, the user does not)
 *   confidence >= 99     -> accept
 *
 * Whatever the confidence, a submission is rejected if any checklist item is false, any "true"
 * item has no evidence, or the serial number is missing / inconsistent.
 */
export const CONFIDENCE_REJECT_BELOW = 80;
export const CONFIDENCE_CLEAN_FROM = 99;

export type Verdict = 'reject' | 'accept_warning' | 'accept';

export interface PolicyDecision {
  verdict: Verdict;
  confidence: number;
  /** Checklist keys that are false or have no evidence. */
  failedKeys: string[];
  /** Why the AI was not fully sure (shown to admins only when accepted with a warning). */
  warnings: string[];
  /** Plain-language reasons the policy rejected this answer (empty when accepted). */
  rejectReasons: string[];
}

/** Serial numbers are compared ignoring whitespace / line breaks / case (terminal output wraps). */
export function normalizeSerial(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s ​]+/g, '').toUpperCase();
}

/** Checklist keys that claim a system clock is visible. */
const CLOCK_KEYS = new Set(['hasClock', 'hasTimestamp']);

/**
 * A clock claim is only believed if the evidence quotes real digits of a time or date
 * (e.g. "16:03", "5/20/2026", "Thu 9 Apr"). "The clock area is present" is a hallucination.
 */
const CLOCK_EVIDENCE = /\d{1,2}\s*[:.]\s*\d{2}|\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i;

function hasEvidence(result: AiValidationResult, key: string): boolean {
  const ev = result.evidence?.[key];
  return typeof ev === 'string' && ev.trim().length > 0;
}

export function decide(result: AiValidationResult): PolicyDecision {
  const confidence = Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0;
  const checklist = result.checklist ?? {};
  const failedKeys: string[] = [];
  const rejectReasons: string[] = [];
  const warnings: string[] = [...(result.uncertainties ?? []).filter(u => typeof u === 'string' && u.trim())];

  for (const [key, passed] of Object.entries(checklist)) {
    if (!passed) failedKeys.push(key);
    else if (!hasEvidence(result, key)) {
      failedKeys.push(key);
      rejectReasons.push(`The AI gave no evidence for "${key}", so it is treated as not satisfied.`);
    } else if (CLOCK_KEYS.has(key) && !CLOCK_EVIDENCE.test(result.evidence?.[key] ?? '')) {
      failedKeys.push(key);
      rejectReasons.push('The system clock could not be read: no actual time or date was quoted from the taskbar / menu bar.');
    }
  }

  if (!result.valid) rejectReasons.push(result.reason || 'The AI marked the image as not valid.');
  if (!result.matchesType) rejectReasons.push('The image does not match the selected submission type.');
  if (failedKeys.length > 0) rejectReasons.push('One or more required items are missing from the image.');

  // Serial number: must be present and every serial the AI saw in the image must agree.
  const serial = normalizeSerial(result.deviceSerial);
  if (!serial) {
    rejectReasons.push('The device serial number could not be read in full.');
  } else {
    const seen = new Set((result.serialsSeen ?? []).map(normalizeSerial).filter(Boolean));
    seen.add(serial);
    if (seen.size > 1) {
      rejectReasons.push('Different serial numbers appear in the screenshot, so the serial cannot be trusted.');
    }
  }

  if (confidence < CONFIDENCE_REJECT_BELOW) {
    rejectReasons.push(
      `The AI could only read the screenshot with ${confidence}% confidence; at least ${CONFIDENCE_REJECT_BELOW}% is required.`,
    );
  }

  if (rejectReasons.length > 0) {
    return { verdict: 'reject', confidence, failedKeys, warnings, rejectReasons };
  }

  if (confidence < CONFIDENCE_CLEAN_FROM) {
    if (warnings.length === 0) {
      warnings.push(`The AI was only ${confidence}% confident in this screenshot; please double-check it.`);
    }
    return { verdict: 'accept_warning', confidence, failedKeys, warnings, rejectReasons };
  }

  return { verdict: 'accept', confidence, failedKeys, warnings, rejectReasons };
}
