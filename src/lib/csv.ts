// Quote-aware CSV row parser — handles commas embedded inside quoted fields.
// Returns one string[] per line (including the header row); callers decide
// how to map columns since that differs per import flow.
export function parseCSV(text: string): string[][] {
  const lines = text.trim().split('\n').filter(Boolean);
  return lines.map(line => {
    const cols: string[] = [];
    let inQuotes = false;
    let currentCol = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(currentCol.trim().replace(/^"|"$/g, ''));
        currentCol = '';
      } else {
        currentCol += char;
      }
    }
    cols.push(currentCol.trim().replace(/^"|"$/g, ''));
    return cols;
  });
}

// Detects an .xlsx file mistakenly uploaded where a plain .csv was expected
// (xlsx files are zip archives, so they start with the "PK" local-file-header
// signature and contain these characteristic internal paths).
export function isExcelBinaryFile(text: string): boolean {
  return text.startsWith('PK\x03\x04') || text.includes('xl/worksheets') || text.includes('[Content_Types].xml');
}

export const EXCEL_FILE_WARNING =
  'Error: Invalid file format. It looks like you uploaded an Excel (.xlsx) file instead of a plain CSV. Please save/export your spreadsheet as Comma Separated Values (.csv) and try again.';
