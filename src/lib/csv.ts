// Quote-aware CSV parser — handles commas AND newlines embedded inside
// quoted fields (e.g. a multi-line bullet list pasted into one cell), plus
// "" as an escaped literal quote. Splitting on '\n' before parsing quotes
// (the previous approach) breaks as soon as any field spans multiple
// lines, since everything after that point in the file shifts columns.
// Returns one string[] per row (including the header row); callers decide
// how to map columns since that differs per import flow.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\r') {
      // swallow — the paired '\n' (or EOF) ends the row
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }
  // Final row, unless the file ended on a trailing newline
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// Detects an .xlsx file mistakenly uploaded where a plain .csv was expected
// (xlsx files are zip archives, so they start with the "PK" local-file-header
// signature and contain these characteristic internal paths).
export function isExcelBinaryFile(text: string): boolean {
  return text.startsWith('PK\x03\x04') || text.includes('xl/worksheets') || text.includes('[Content_Types].xml');
}

export const EXCEL_FILE_WARNING =
  'Error: Invalid file format. It looks like you uploaded an Excel (.xlsx) file instead of a plain CSV. Please save/export your spreadsheet as Comma Separated Values (.csv) and try again.';
