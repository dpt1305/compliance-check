export interface TypeMapping {
  submissionType: string;
  allowedImageTypes: string;
  description: string;
  exampleKeywords: string;
  validationRules?: string;
}

const DEFAULT_MAPPINGS: Record<string, TypeMapping> = {
  windows: {
    submissionType: 'windows',
    allowedImageTypes: 'jpg,jpeg,png,webp',
    description: 'Windows laptop or desktop',
    exampleKeywords: 'windows,laptop,dell,hp,lenovo,thinkpad',
    validationRules: 'clock:bottom-right,windows-update:yes,device-name:full,device-serial:full,dashboard:security',
  },
  mac: {
    submissionType: 'mac',
    allowedImageTypes: 'jpg,jpeg,png,webp',
    description: 'Apple Mac device',
    exampleKeywords: 'mac,macbook,macbook pro,macbook air,imac',
    validationRules: 'mac-info:visible,seed-dashboard:yes|trellix:ok,timestamp:top-right',
  },
  thin: {
    submissionType: 'thin',
    allowedImageTypes: 'jpg,jpeg,png,webp',
    description: 'Thin client device',
    exampleKeywords: 'thin client,wyse,igel,hp thin',
    validationRules: 'timestamp:visible,windows-update:yes|security-status:ok',
  },
};

let cache: Record<string, TypeMapping> | null = null;

async function loadMappings(): Promise<Record<string, TypeMapping>> {
  if (cache) return cache;

  const mappingPath = process.env.EXCEL_MAPPING_PATH;
  if (mappingPath) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const ExcelJS = (await import('exceljs')).default;

      const resolvedPath = path.isAbsolute(mappingPath)
        ? mappingPath
        : path.join(process.cwd(), mappingPath);

      if (fs.existsSync(resolvedPath)) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(resolvedPath);
        const sheet = workbook.worksheets[0];
        const loaded: Record<string, TypeMapping> = {};

        sheet.eachRow((row, rowNum) => {
          if (rowNum === 1) return; // skip header
          const type = String(row.getCell(1).value ?? '').toLowerCase().trim();
          if (!type) return;
          loaded[type] = {
            submissionType: String(row.getCell(1).value ?? type),
            allowedImageTypes: String(row.getCell(2).value ?? 'jpg,jpeg,png,webp'),
            description: String(row.getCell(3).value ?? ''),
            exampleKeywords: String(row.getCell(4).value ?? ''),
            validationRules: row.getCell(5).value ? String(row.getCell(5).value) : undefined,
          };
        });

        if (Object.keys(loaded).length > 0) {
          cache = loaded;
          return cache;
        }
      }
    } catch {
      // Fall through to defaults
    }
  }

  cache = DEFAULT_MAPPINGS;
  return cache;
}

// Synchronous wrapper using pre-loaded cache
function getMappings(): Record<string, TypeMapping> {
  return cache ?? DEFAULT_MAPPINGS;
}

// Initialize cache at module load time (server startup)
if (typeof process !== 'undefined') {
  loadMappings().catch(() => { cache = DEFAULT_MAPPINGS; });
}

export function getSupportedTypes(): string[] {
  return Object.keys(getMappings());
}

/** Async version — always waits for the mapping file to finish loading before returning. */
export async function loadSupportedTypes(): Promise<string[]> {
  const m = await loadMappings();
  return Object.keys(m);
}

export function getMapping(submissionType: string): TypeMapping | null {
  return getMappings()[submissionType?.toLowerCase()?.trim()] ?? null;
}

export function isTypeSupported(submissionType: string): boolean {
  return !!getMapping(submissionType);
}

export function getAllowedExtensions(submissionType: string): string[] {
  const m = getMapping(submissionType);
  return m ? m.allowedImageTypes.split(',').map(s => s.trim()) : [];
}
