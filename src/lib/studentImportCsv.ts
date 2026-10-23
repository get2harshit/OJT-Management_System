import type { StudentImportRow } from './api/members';

// Reading a student CSV into rows for the import. Headers are matched loosely
// (case-insensitive, substring) because registrar sheets arrive as "MSU Reg
// No", "Student MSU Email ID" and the like; only the columns are found here —
// whether each value is acceptable is the server's call, so every file is
// judged by the same rules.

type ImportField = keyof StudentImportRow;

interface ColumnSpec {
  field: ImportField;
  label: string;
  patterns: string[];
  required: boolean;
}

const COLUMNS: ColumnSpec[] = [
  { field: 'fullName', label: 'Name', patterns: ['name'], required: true },
  { field: 'email', label: 'Email', patterns: ['email', 'e-mail'], required: true },
  { field: 'batch', label: 'Batch', patterns: ['batch'], required: true },
  { field: 'registrationNumber', label: 'Registration number', patterns: ['registration', 'reg no', 'reg_no', 'regno', 'reg number'], required: true },
  { field: 'rollNumber', label: 'Roll number', patterns: ['roll'], required: true },
  { field: 'semester', label: 'Semester', patterns: ['semester', 'sem'], required: true },
  { field: 'tier', label: 'Tier', patterns: ['tier'], required: false },
  { field: 'phoneNumber', label: 'Phone', patterns: ['phone', 'mobile', 'contact'], required: false },
];

export const REQUIRED_COLUMN_LABELS = COLUMNS.filter((c) => c.required).map((c) => c.label);
export const OPTIONAL_COLUMN_LABELS = COLUMNS.filter((c) => !c.required).map((c) => c.label);

export interface ParsedStudentCsv {
  rows: StudentImportRow[];
  /** The file line each row came from (the header is line 1). */
  lineNumbers: number[];
  /** Required columns the header row does not have. */
  missingColumns: string[];
}

function findColumnIndexes(headers: string[]): Map<ImportField, number> {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const indexes = new Map<ImportField, number>();
  const used = new Set<number>();
  // Most specific first, so "Student Name" is not claimed by a later, looser
  // pattern, and no header serves two fields.
  for (const spec of COLUMNS) {
    const index = normalized.findIndex((h, i) => !used.has(i) && spec.patterns.some((p) => h.includes(p)));
    if (index !== -1) {
      indexes.set(spec.field, index);
      used.add(index);
    }
  }
  return indexes;
}

export function readStudentCsv(table: string[][]): ParsedStudentCsv {
  if (table.length === 0) return { rows: [], lineNumbers: [], missingColumns: REQUIRED_COLUMN_LABELS };
  const indexes = findColumnIndexes(table[0]);
  const missingColumns = COLUMNS.filter((c) => c.required && !indexes.has(c.field)).map((c) => c.label);

  const rows: StudentImportRow[] = [];
  const lineNumbers: number[] = [];
  table.slice(1).forEach((cells, i) => {
    const value = (field: ImportField) => {
      const index = indexes.get(field);
      return index === undefined ? '' : (cells[index] ?? '').trim();
    };
    const row: StudentImportRow = {
      fullName: value('fullName'),
      email: value('email'),
      batch: value('batch'),
      registrationNumber: value('registrationNumber'),
      rollNumber: value('rollNumber'),
      semester: value('semester'),
      tier: value('tier'),
      phoneNumber: value('phoneNumber'),
    };
    // Exported sheets routinely end in blank or comma-only lines.
    if (Object.values(row).every((v) => v === '')) return;
    rows.push(row);
    lineNumbers.push(i + 2);
  });
  return { rows, lineNumbers, missingColumns };
}

/** A ready-to-fill template with one example row. */
export function studentCsvTemplate(): string {
  return [
    'name,email,batch,registration_number,roll_number,semester,tier,phone',
    'Aryan Navik,aryannpstju26@medhaviskillsuniversity.edu.in,2026 A2,MSU-WI/2026-27/16181,PST-26-0001,SEM 1,B,9039983391',
  ].join('\n');
}
