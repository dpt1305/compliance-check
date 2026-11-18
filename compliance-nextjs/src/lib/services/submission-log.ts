/**
 * Per-request trace for POST /api/submission. Collects the AI findings, the policy decision, every notable step
 * and the final outcome, then stores one document in `submission_logs` (TTL 90 days by default).
 *
 * The active trace is kept in AsyncLocalStorage, so deep code (ai-validation) can add steps with trace.info/warn
 * without passing anything around. Outside a submission request those calls just print to the console.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { ValidationRun } from './ai-validation';
import type { PolicyDecision } from './validation-policy';
import {
  insertLog,
  type SubmissionLogDoc,
  type SubmissionLogEvent,
  type SubmissionLogOutcome,
} from '@/lib/db/mongo/submission-log-repo';

const MAX_RAW_TEXT = 50_000;
const MAX_EVENTS = 200;
const WRITE_TIMEOUT_MS = 3_000;

export class SubmissionTrace {
  readonly requestId = randomUUID();
  private readonly started = Date.now();
  readonly doc: SubmissionLogDoc;

  constructor(req: NextRequest) {
    this.doc = {
      requestId: this.requestId,
      createdAt: new Date(this.started),
      client: {
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
      events: [],
    };
  }

  event(level: SubmissionLogEvent['level'], message: string): void {
    if (this.doc.events.length >= MAX_EVENTS) return;
    this.doc.events.push({ at: new Date().toISOString(), ms: Date.now() - this.started, level, message });
  }

  setAi(run: ValidationRun): void {
    const raw = run.rawText;
    this.doc.ai = {
      provider: run.provider,
      model: run.model,
      durationMs: run.durationMs,
      cropCount: run.cropCount,
      usage: run.usage,
      attempts: run.attempts,
      rawText: raw && raw.length > MAX_RAW_TEXT ? `${raw.slice(0, MAX_RAW_TEXT)}…[truncated ${raw.length - MAX_RAW_TEXT} chars]` : raw,
      result: run.result,
    };
  }

  setDecision(d: PolicyDecision): void {
    this.doc.decision = {
      verdict: d.verdict,
      confidence: d.confidence,
      failedKeys: d.failedKeys,
      warnings: d.warnings,
      rejectReasons: d.rejectReasons,
    };
  }

  setOutcome(status: SubmissionLogOutcome, httpStatus: number, o: { title?: string; reason?: string; failedChecks?: string[] } = {}): void {
    this.doc.outcome = { status, httpStatus, ...o };
  }

  setError(err: unknown): void {
    const e = err as Error;
    this.doc.error = { message: e?.message ?? String(err), stack: e?.stack };
  }

  /** Store the trace. Never throws and never blocks the response for more than a few seconds. */
  async save(): Promise<void> {
    this.doc.finishedAt = new Date();
    this.doc.durationMs = Date.now() - this.started;
    try {
      await Promise.race([
        insertLog(this.doc),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${WRITE_TIMEOUT_MS}ms`)), WRITE_TIMEOUT_MS)),
      ]);
    } catch (err) {
      console.error(`[submission-log] could not store log ${this.requestId}: ${(err as Error).message}`);
    }
  }
}

const storage = new AsyncLocalStorage<SubmissionTrace>();

export function runWithTrace<T>(t: SubmissionTrace, fn: () => Promise<T>): Promise<T> {
  return storage.run(t, fn);
}

export function currentTrace(): SubmissionTrace | undefined {
  return storage.getStore();
}

const fmt = (args: unknown[]) =>
  args.map(a => (typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(' ');

/** console.* that is also recorded in the current submission trace (if any). */
export const trace = {
  info(...args: unknown[]) { console.info(...args); currentTrace()?.event('info', fmt(args)); },
  warn(...args: unknown[]) { console.warn(...args); currentTrace()?.event('warn', fmt(args)); },
  error(...args: unknown[]) { console.error(...args); currentTrace()?.event('error', fmt(args)); },
};
