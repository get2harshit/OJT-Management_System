// Is everything between `index` and the next delimiter just whitespace?
//
// This is what tells a real closing quote apart from one somebody typed in the
// middle of a cell. A closing quote is always followed by a comma, a line
// ending or the end of the file (allowing for stray spaces before it);
// anything else means there is more of this cell still to come.
function endsField(text: string, index: number): boolean {
  for (let i = index; i < text.length; i++) {
    const char = text[i];
    if (char === ',' || char === '\n' || char === '\r') return true;
    if (char === ' ' || char === '\t') continue;
    return false;
  }
  return true; // end of input closes the field too
}

// Quote-aware CSV parser — handles commas AND newlines embedded inside
// quoted fields (e.g. a multi-line bullet list pasted into one cell).
// Splitting on '\n' before parsing quotes (the previous approach) breaks as
// soon as any field spans multiple lines, since everything after that point in
// the file shifts columns. Returns one string[] per row (including the header
// row); callers decide how to map columns since that differs per import flow.
//
// Quotes inside a quoted cell do NOT have to be doubled. The spec says a
// literal quote is written "", and that still works — but whoever fills the
// sheet is writing prose, not CSV, and `He said "hi"` is what they will
// actually type. Treating that as a closing quote used to end the cell early,
// so the rest of the sentence fell out into the next column and every column
// after it shifted. A quote only closes the cell when a delimiter follows it;
// otherwise it is kept as the character it plainly is.
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
          // The spec's escape for a literal quote.
          field += '"';
          i++;
          // …unless the pair sat at the very end of the cell, in which case
          // the second one was the author's closing quote and the cell is
          // over. Without this a trailing `"` swallows the next comma.
          if (endsField(text, i + 1)) inQuotes = false;
        } else if (endsField(text, i + 1)) {
          inQuotes = false;
        } else {
          // Mid-sentence quote, undoubled — keep it, the cell continues.
          field += '"';
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
