/**
 * Utility function to convert data objects into a downloadable CSV file.
 */
export function exportToCSV<T extends Record<string, unknown>>(
  filename: string,
  data: T[],
  columns?: { key: string; header: string }[]
) {
  if (!data || data.length === 0) {
    alert('No data available to export.');
    return;
  }

  // Determine headers
  const headers = columns
    ? columns
    : Object.keys(data[0]).map(key => ({ key, header: key }));

  const csvRows: string[] = [];

  // Header Row
  csvRows.push(headers.map(h => `"${escapeCSV(h.header)}"`).join(','));

  // Data Rows
  for (const row of data) {
    const values = headers.map(h => {
      const val = row[h.key];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'object') {
        return `"${escapeCSV(JSON.stringify(val))}"`;
      }
      return `"${escapeCSV(String(val))}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(text: string): string {
  return text.replace(/"/g, '""').replace(/\n/g, ' ');
}
