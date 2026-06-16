/**
 * MongoDB project config repository — version-aware.
 *
 * Each config version is a separate document in the `project_config` collection.
 * Only one document has status 'published' at any time.
 * Max 50 versions retained (oldest archived pruned).
 */
import { ObjectId } from 'mongodb';
import { getMongoDb, getCounters } from './connection';
import { emitChange } from '../event-bus';

const COLLECTION = 'project_config';
const MAX_VERSIONS = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'textarea' | 'dropdown' | 'date' | 'datetime' | 'file' | 'file-multiple';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { label: string; value: string }[];
  accept?: string;
  maxFileSizeMb?: number;
  maxFiles?: number;
  defaultValue?: string;
  visibleWhen?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty';
    value: string;
  };
}

export interface ExtractField {
  key: string;
  label: string;
  instruction: string;
  type: 'text' | 'number' | 'date';
}

export interface ChecklistItem {
  key: string;
  label: string;
  description: string;
}

export interface PreValidationRule {
  type: 'field_required' | 'field_min_length' | 'field_pattern' | 'file_count_min' | 'file_count_max';
  field: string;
  value: string | number;
  message: string;
}

export interface SubmissionType {
  key: string;
  label: string;
  description: string;
  sampleImageUrl?: string;
  aiPrompt: string;
  aiExtractFields: ExtractField[];
  minConfidence: number;
  checklistItems: ChecklistItem[];
  additionalFields?: FormField[];
  preValidationRules?: PreValidationRule[];
}

export interface OutputColumn {
  key: string;
  label: string;
  source: 'form_field' | 'ai_extract' | 'computed' | 'tracking_field';
  fieldKey?: string;
  expression?: string;
  width?: number;
  sortable?: boolean;
  editable?: boolean;
  excelVisible?: boolean;
  format?: 'text' | 'number' | 'date' | 'datetime' | 'badge' | 'image';
}

export interface ProjectConfig {
  name: string;
  description: string;
  formFields: FormField[];
  submissionTypes: SubmissionType[];
  outputColumns: OutputColumn[];
}

export interface ConfigVersionDoc extends ProjectConfig {
  _id?: ObjectId;
  version: number;
  status: 'draft' | 'published' | 'archived';
  note?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  publishedAt?: Date;
  publishedBy?: string;
}

export interface ConfigVersionSummary {
  version: number;
  status: 'draft' | 'published' | 'archived';
  name: string;
  note?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  publishedAt?: Date;
  publishedBy?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function col() {
  const db = await getMongoDb();
  return db.collection<ConfigVersionDoc>(COLLECTION);
}

async function counters() { return getCounters(); }

export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await c.createIndex({ version: 1 }, { unique: true });
  await c.createIndex({ status: 1 });
  await c.createIndex({ updatedAt: -1 });
}

function stripVersion(doc: ConfigVersionDoc): ConfigVersionSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, formFields, submissionTypes, outputColumns, ...rest } = doc;
  return rest as ConfigVersionSummary;
}

function toProjectConfig(doc: ConfigVersionDoc): ProjectConfig {
  return {
    name: doc.name,
    description: doc.description,
    formFields: doc.formFields,
    submissionTypes: doc.submissionTypes,
    outputColumns: doc.outputColumns,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function findAllVersions(): Promise<ConfigVersionSummary[]> {
  const c = await col();
  const docs = await c.find({}).sort({ version: -1 }).toArray();
  return docs.map(stripVersion);
}

export async function findPublished(): Promise<ProjectConfig | null> {
  const c = await col();
  const doc = await c.findOne({ status: 'published' });
  return doc ? toProjectConfig(doc) : null;
}

export async function findDraft(): Promise<ProjectConfig | null> {
  const c = await col();
  const doc = await c.findOne({ status: 'draft' });
  return doc ? toProjectConfig(doc) : null;
}

export async function findFullDraft(): Promise<ConfigVersionDoc | null> {
  const c = await col();
  return await c.findOne({ status: 'draft' });
}

export async function findByVersion(version: number): Promise<ProjectConfig | null> {
  const c = await col();
  const doc = await c.findOne({ version });
  return doc ? toProjectConfig(doc) : null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveVersion(doc: ConfigVersionDoc): Promise<void> {
  const c = await col();
  if (doc._id) {
    await c.replaceOne({ _id: doc._id }, doc as ConfigVersionDoc);
  } else {
    await c.insertOne(doc as ConfigVersionDoc);
  }
}

export async function deleteVersion(version: number): Promise<boolean> {
  const c = await col();
  const result = await c.deleteOne({ version });
  if (result.deletedCount > 0) {
    await pruneOldVersions();
    emitConfigChange();
  }
  return result.deletedCount > 0;
}

export async function getNextVersion(): Promise<number> {
  const result = await (await counters()).findOneAndUpdate(
    { _id: 'config_version' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return result!.seq;
}

/**
 * Create a draft from the current published config.
 * Archives the published version, creates a new draft copy.
 */
export async function createDraftFromPublished(createdBy: string): Promise<ConfigVersionDoc> {
  const c = await col();
  const now = new Date();

  // Get the current published doc first
  const published = await c.findOne({ status: 'published' });
  if (!published) {
    throw new Error('No published config found to create draft from');
  }

  // Archive current published
  await c.updateOne(
    { _id: published._id },
    { $set: { status: 'archived', updatedAt: now, updatedBy: createdBy } },
  );

  const nextVer = await getNextVersion();
  const draft: ConfigVersionDoc = {
    name: published.name,
    description: published.description,
    formFields: published.formFields,
    submissionTypes: published.submissionTypes,
    outputColumns: published.outputColumns,
    version: nextVer,
    status: 'draft',
    note: undefined,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
    publishedAt: undefined,
    publishedBy: undefined,
  };

  await c.insertOne(draft);
  emitConfigChange();
  return draft;
}

/**
 * Publish the current draft config.
 */
export async function publishDraft(note: string | undefined, createdBy: string): Promise<ConfigVersionDoc> {
  const c = await col();
  const now = new Date();

  const draft = await c.findOne({ status: 'draft' });
  if (!draft) {
    throw new Error('No draft config found to publish');
  }

  await c.updateOne(
    { _id: draft._id },
    {
      $set: {
        status: 'published',
        note: note || draft.note,
        updatedAt: now,
        updatedBy: createdBy,
        publishedAt: now,
        publishedBy: createdBy,
      },
    },
  );

  emitConfigChange();
  return { ...draft, status: 'published', note: note || draft.note, updatedAt: now, updatedBy: createdBy, publishedAt: now, publishedBy: createdBy };
}

/**
 * Revert to a specific version — creates a new version from the target config and publishes it.
 */
export async function revertToVersion(ver: number, note: string | undefined, createdBy: string): Promise<ConfigVersionDoc> {
  const c = await col();
  const now = new Date();

  // Archive current published
  await c.updateMany(
    { status: 'published' },
    { $set: { status: 'archived', updatedAt: now, updatedBy: createdBy } },
  );

  // Find source version
  const source = await c.findOne({ version: ver });
  if (!source) {
    throw new Error(`Config version ${ver} not found`);
  }

  const nextVer = await getNextVersion();
  const reverted: ConfigVersionDoc = {
    name: source.name,
    description: source.description,
    formFields: source.formFields,
    submissionTypes: source.submissionTypes,
    outputColumns: source.outputColumns,
    version: nextVer,
    status: 'published',
    note: note || `Reverted to v${ver}`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy,
    publishedAt: now,
    publishedBy: createdBy,
  };

  await c.insertOne(reverted);
  await pruneOldVersions();
  emitConfigChange();
  return reverted;
}

/**
 * Update an existing draft.
 */
export async function updateDraft(config: ProjectConfig, createdBy: string): Promise<void> {
  const c = await col();
  const now = new Date();

  const draft = await c.findOne({ status: 'draft' });
  if (!draft) {
    throw new Error('No draft config found — create draft first');
  }

  await c.updateOne(
    { _id: draft._id },
    {
      $set: {
        name: config.name,
        description: config.description,
        formFields: config.formFields,
        submissionTypes: config.submissionTypes,
        outputColumns: config.outputColumns,
        updatedAt: now,
        updatedBy: createdBy,
      },
    },
  );
}

/**
 * Seed initial config (first run).
 */
export async function seedConfig(config: ProjectConfig, note: string): Promise<ConfigVersionDoc> {
  const c = await col();
  const now = new Date();

  const doc: ConfigVersionDoc = {
    name: config.name,
    description: config.description,
    formFields: config.formFields,
    submissionTypes: config.submissionTypes,
    outputColumns: config.outputColumns,
    version: 1,
    status: 'published',
    note,
    createdAt: now,
    createdBy: 'system',
    updatedAt: now,
    updatedBy: 'system',
    publishedAt: now,
    publishedBy: 'system',
  };

  await c.insertOne(doc);

  // Initialize counter
  await (await counters()).updateOne(
    { _id: 'config_version' },
    { $set: { seq: 1 } },
    { upsert: true },
  );

  return doc;
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Prune oldest archived versions beyond MAX_VERSIONS limit.
 */
async function pruneOldVersions(): Promise<void> {
  const c = await col();
  const total = await c.countDocuments();
  if (total <= MAX_VERSIONS) return;

  const excess = total - MAX_VERSIONS;
  const oldest = await c.find({ status: 'archived' }).sort({ version: 1 }).limit(excess).toArray();
  if (oldest.length > 0) {
    const versions = oldest.map(d => d.version);
    await c.deleteMany({ version: { $in: versions } });
  }
}

function emitConfigChange(): void {
  try {
    emitChange('config');
  } catch { /* ignore */ }
}
