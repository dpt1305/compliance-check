/**
 * Dynamic form service — field validation, conditional visibility, pre-validation.
 */
import type { FormField, PreValidationRule } from './project-config';

export function evaluateVisibility(field: FormField, formValues: Record<string, any>): boolean {
  if (!field.visibleWhen) return true;
  const { field: targetField, operator, value } = field.visibleWhen;
  const targetValue = formValues[targetField];

  switch (operator) {
    case 'equals':
      return String(targetValue ?? '') === value;
    case 'not_equals':
      return String(targetValue ?? '') !== value;
    case 'contains':
      return String(targetValue ?? '').includes(value);
    case 'is_empty':
      return !targetValue || String(targetValue).trim() === '';
    case 'is_not_empty':
      return !!targetValue && String(targetValue).trim() !== '';
    default:
      return true;
  }
}

export function getVisibleFields(fields: FormField[], formValues: Record<string, any>): FormField[] {
  return fields.filter(f => evaluateVisibility(f, formValues));
}

export function validateField(field: FormField, value: any): string | null {
  if (value === undefined || value === null) {
    return field.required ? `${field.label} is required` : null;
  }

  const strVal = String(value).trim();

  if (strVal === '') {
    return field.required ? `${field.label} is required` : null;
  }

  if (field.type === 'email' && strVal !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(strVal)) {
      return `${field.label} must be a valid email`;
    }
  }

  if (field.type === 'number') {
    const num = Number(strVal);
    if (isNaN(num)) {
      return `${field.label} must be a valid number`;
    }
  }

  return null;
}

export function validateForm(fields: FormField[], formValues: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!evaluateVisibility(field, formValues)) continue;
    const error = validateField(field, formValues[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}

export function validatePreRules(rules: PreValidationRule[], formValues: Record<string, any>, files: Record<string, File[]>): string[] {
  if (!rules || rules.length === 0) return [];
  const errors: string[] = [];

  for (const rule of rules) {
    const val = formValues[rule.field];
    const fileArr = files[rule.field] || [];

    switch (rule.type) {
      case 'field_required': {
        if (!val || String(val).trim() === '') {
          errors.push(rule.message || `${rule.field} is required`);
        }
        break;
      }
      case 'field_min_length': {
        if (val && String(val).length < Number(rule.value)) {
          errors.push(rule.message || `${rule.field} must be at least ${rule.value} characters`);
        }
        break;
      }
      case 'field_pattern': {
        if (val) {
          try {
            const regex = new RegExp(String(rule.value));
            if (!regex.test(String(val))) {
              errors.push(rule.message || `${rule.field} format is invalid`);
            }
          } catch {
            // Invalid regex pattern — skip rule
          }
        }
        break;
      }
      case 'file_count_min': {
        if (fileArr.length < Number(rule.value)) {
          errors.push(rule.message || `${rule.field} requires at least ${rule.value} file(s)`);
        }
        break;
      }
      case 'file_count_max': {
        if (fileArr.length > Number(rule.value)) {
          errors.push(rule.message || `${rule.field} allows at most ${rule.value} file(s)`);
        }
        break;
      }
    }
  }

  return errors;
}

export function getFormDefaultValue(field: FormField): any {
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    if (field.type === 'number') return Number(field.defaultValue);
    return field.defaultValue;
  }
  if (field.type === 'number') return 0;
  if (field.type === 'file' || field.type === 'file-multiple') return null;
  return '';
}

export function getFileAcceptString(field: FormField): string {
  return field.accept || '.jpg,.jpeg,.png,.webp';
}

export function getMaxFileSizeBytes(field: FormField): number {
  const mb = field.maxFileSizeMb || 10;
  return mb * 1024 * 1024;
}
