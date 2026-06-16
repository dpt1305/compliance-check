import { NextRequest, NextResponse } from 'next/server';
import type { FormField, SubmissionType, OutputColumn } from '@/lib/db/mongo/config-repo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      formFields?: FormField[];
      submissionTypes?: SubmissionType[];
      outputColumns?: OutputColumn[];
    };

    const { formFields, submissionTypes, outputColumns } = body;
    const errors: string[] = [];

    // Validate form fields
    if (Array.isArray(formFields)) {
      const fieldKeys = new Set<string>();
      for (const field of formFields) {
        if (!field.key || typeof field.key !== 'string') {
          errors.push('Each form field must have a key');
          continue;
        }
        if (fieldKeys.has(field.key)) {
          errors.push(`Duplicate form field key: ${field.key}`);
        }
        fieldKeys.add(field.key);

        if (!field.label || typeof field.label !== 'string') {
          errors.push(`Form field "${field.key}" must have a label`);
        }

        const validTypes = ['text', 'number', 'email', 'textarea', 'dropdown', 'date', 'datetime', 'file', 'file-multiple'];
        if (!validTypes.includes(field.type)) {
          errors.push(`Form field "${field.key}" has invalid type: ${field.type}`);
        }

        if (field.type === 'dropdown' && (!Array.isArray(field.options) || field.options.length === 0)) {
          errors.push(`Form field "${field.key}" (dropdown) must have options`);
        }

        if (field.visibleWhen) {
          const targetField = formFields.find(f => f.key === field.visibleWhen!.field);
          if (!targetField) {
            errors.push(`Form field "${field.key}" visibility condition references non-existent field "${field.visibleWhen.field}"`);
          }
        }
      }
    }

    // Validate submission types
    if (Array.isArray(submissionTypes)) {
      const typeKeys = new Set<string>();
      for (const type of submissionTypes) {
        if (!type.key || typeof type.key !== 'string') {
          errors.push('Each submission type must have a key');
          continue;
        }
        if (typeKeys.has(type.key)) {
          errors.push(`Duplicate submission type key: ${type.key}`);
        }
        typeKeys.add(type.key);

        if (!type.label || typeof type.label !== 'string') {
          errors.push(`Submission type "${type.key}" must have a label`);
        }

        if (!type.aiPrompt || typeof type.aiPrompt !== 'string' || type.aiPrompt.trim() === '') {
          errors.push(`Submission type "${type.key}" must have an AI prompt`);
        }

        if (!Array.isArray(type.aiExtractFields)) {
          errors.push(`Submission type "${type.key}" must have aiExtractFields array`);
        } else {
          for (const ef of type.aiExtractFields) {
            if (!ef.key || !ef.instruction) {
              errors.push(`Extract field in type "${type.key}" must have key and instruction`);
            }
          }
        }

        if (!Array.isArray(type.checklistItems)) {
          errors.push(`Submission type "${type.key}" must have checklistItems array`);
        }

        if (type.additionalFields && Array.isArray(type.additionalFields)) {
          for (const af of type.additionalFields) {
            if (formFields && !formFields.find(f => f.key === af.key)) {
              errors.push(`Additional field "${af.key}" in type "${type.key}" references a form field that doesn't exist`);
            }
          }
        }
      }
    }

    // Validate output columns
    if (Array.isArray(outputColumns)) {
      const colKeys = new Set<string>();
      for (const col of outputColumns) {
        if (!col.key || typeof col.key !== 'string') {
          errors.push('Each output column must have a key');
          continue;
        }
        if (colKeys.has(col.key)) {
          errors.push(`Duplicate output column key: ${col.key}`);
        }
        colKeys.add(col.key);

        if (!col.label || typeof col.label !== 'string') {
          errors.push(`Output column "${col.key}" must have a label`);
        }

        const validSources = ['form_field', 'ai_extract', 'computed', 'tracking_field'];
        if (!validSources.includes(col.source)) {
          errors.push(`Output column "${col.key}" has invalid source: ${col.source}`);
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors });
    }

    return NextResponse.json({ valid: true, errors: [] });
  } catch (err) {
    console.error('[api/config/validate POST]', err);
    return NextResponse.json({ valid: false, errors: ['Invalid request body'] }, { status: 400 });
  }
}
