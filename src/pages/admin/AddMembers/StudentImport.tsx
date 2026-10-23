import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import Button from '../../../components/Button';
import {
  apiImportStudents,
  apiPreviewStudentImport,
  type StudentImportResult,
  type StudentImportRowResult,
  type StudentImportStatus,
} from '../../../lib/api';
import { parseCSV, isExcelBinaryFile, EXCEL_FILE_WARNING } from '../../../lib/csv';
import { exportToCSV } from '../../../lib/csvExport';
import {
  OPTIONAL_COLUMN_LABELS,
  REQUIRED_COLUMN_LABELS,
  readStudentCsv,
  studentCsvTemplate,
  type ParsedStudentCsv,
} from '../../../lib/studentImportCsv';
import { useToast } from '../../../toast';

const STATUS_STYLE: Record<StudentImportStatus, { label: string; className: string }> = {
  new: { label: 'Will be added', className: 'bg-green-500/10 text-green-400 border-green-500/25' },
  created: { label: 'Added', className: 'bg-green-500/10 text-green-400 border-green-500/25' },
  exists: { label: 'Already on the platform', className: 'bg-zinc-800 text-gray-300 border-zinc-700' },
  invalid: { label: 'Needs fixing', className: 'bg-red-500/10 text-red-400 border-red-500/25' },
  failed: { label: 'Not added', className: 'bg-red-500/10 text-red-400 border-red-500/25' },
};

// The order the filter offers statuses in — what to act on first.
const FILTER_ORDER: StudentImportStatus[] = ['invalid', 'failed', 'new', 'created', 'exists'];

function downloadTemplate() {
  const blob = new Blob([studentCsvTemplate()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'students-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function RowDetail({ row }: { row: StudentImportRowResult }) {
  if (row.status === 'new' || row.status === 'created') {
    if (row.ojts && row.ojts.length > 0) return <span className="text-gray-400">Joins {row.ojts.join(', ')}</span>;
    return <span className="text-amber-400">{row.reason}</span>;
  }
  return <span className={row.status === 'exists' ? 'text-gray-400' : 'text-red-300'}>{row.reason}</span>;
}

export default function StudentImport() {
  const { showSuccess, showError } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedStudentCsv | null>(null);
  const [plan, setPlan] = useState<StudentImportResult | null>(null);
  const [outcome, setOutcome] = useState<StudentImportResult | null>(null);
  const [filter, setFilter] = useState<StudentImportStatus | 'all'>('all');
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // What the table shows: the import's outcome once there is one, else the check.
  const shown = outcome ?? plan;
  const visibleRows = useMemo(
    () => (shown ? shown.rows.filter((row) => filter === 'all' || row.status === filter) : []),
    [shown, filter]
  );

  const reset = () => {
    setFileName(null);
    setParsed(null);
    setPlan(null);
    setOutcome(null);
    setFilter('all');
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (isExcelBinaryFile(file.name)) {
      showError(EXCEL_FILE_WARNING);
      return;
    }
    reset();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      if (isExcelBinaryFile(text)) {
        showError(EXCEL_FILE_WARNING);
        reset();
        return;
      }
      setParsed(readStudentCsv(parseCSV(text)));
    };
    reader.readAsText(file);
  };

  const handleCheck = async () => {
    if (!parsed) return;
    setChecking(true);
    try {
      setPlan(await apiPreviewStudentImport(parsed.rows));
      setFilter('all');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not check the file');
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const result = await apiImportStudents(parsed.rows);
      setOutcome(result);
      setFilter(result.summary.failed > 0 ? 'failed' : 'all');
      if (result.summary.created > 0) showSuccess(`${result.summary.created} student${result.summary.created === 1 ? '' : 's'} added`);
      if (result.summary.failed > 0) showError(`${result.summary.failed} student${result.summary.failed === 1 ? '' : 's'} could not be added`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not add the students');
    } finally {
      setImporting(false);
    }
  };

  const downloadProblems = () => {
    if (!shown || !parsed) return;
    const problemRows = shown.rows
      .filter((row) => row.status === 'invalid' || row.status === 'failed')
      .map((row) => ({ line: parsed.lineNumbers[row.index], ...parsed.rows[row.index], problem: row.reason ?? '' }));
    exportToCSV('students-to-fix.csv', problemRows, [
      { key: 'line', header: 'line' },
      { key: 'fullName', header: 'name' },
      { key: 'email', header: 'email' },
      { key: 'batch', header: 'batch' },
      { key: 'registrationNumber', header: 'registration_number' },
      { key: 'rollNumber', header: 'roll_number' },
      { key: 'semester', header: 'semester' },
      { key: 'tier', header: 'tier' },
      { key: 'phoneNumber', header: 'phone' },
      { key: 'problem', header: 'problem' },
    ]);
  };

  const toAdd = plan?.summary.new ?? 0;
  const problemCount = shown ? shown.summary.invalid + shown.summary.failed : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-gray-400 max-w-2xl space-y-1">
          <p>
            Columns: <span className="text-gray-200">{REQUIRED_COLUMN_LABELS.join(', ')}</span>, and optionally{' '}
            <span className="text-gray-200">{OPTIONAL_COLUMN_LABELS.join(' and ')}</span>. Each student's batch decides which OJT they join.
          </p>
          <p>Students already on the platform are left as they are. Nothing is added until you confirm.</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={downloadTemplate}>
          Download template
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!fileName ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`w-full max-w-2xl border-2 border-dashed rounded-2xl p-8 text-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60 ${
            isDragging ? 'border-gold bg-gold/10' : 'border-zinc-750 bg-zinc-850/40 hover:border-gold/50 hover:bg-zinc-850'
          }`}
        >
          <Upload size={22} className="mx-auto mb-2 text-gold" />
          <p className="text-sm font-semibold text-white">Choose a CSV file, or drop it here</p>
        </button>
      ) : (
        <div className="max-w-2xl flex items-center justify-between gap-3 rounded-xl border border-zinc-750 bg-zinc-850 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileSpreadsheet size={20} className="text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{fileName}</p>
              {parsed && <p className="text-xs text-gray-400">{parsed.rows.length} student row{parsed.rows.length === 1 ? '' : 's'}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={checking || importing}
            aria-label="Remove file"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {parsed && parsed.missingColumns.length > 0 && (
        <p className="max-w-2xl flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          This file has no {parsed.missingColumns.join(', ')} column. Add {parsed.missingColumns.length === 1 ? 'it' : 'them'} to the header row and choose the file again.
        </p>
      )}
      {parsed && parsed.missingColumns.length === 0 && parsed.rows.length === 0 && (
        <p className="max-w-2xl text-sm text-amber-400">This file has a header row but no students under it.</p>
      )}

      {parsed && parsed.missingColumns.length === 0 && parsed.rows.length > 0 && !plan && (
        <Button onClick={handleCheck} isLoading={checking}>
          Check {parsed.rows.length} student{parsed.rows.length === 1 ? '' : 's'}
        </Button>
      )}

      {shown && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Show rows">
            {(['all', ...FILTER_ORDER.filter((s) => shown.summary[s] > 0)] as const).map((status) => {
              const selected = filter === status;
              const count = status === 'all' ? shown.rows.length : shown.summary[status];
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFilter(status)}
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/60 ${
                    selected ? 'bg-gold text-black border-gold' : 'bg-zinc-900 border-zinc-750 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {status === 'all' ? 'All' : STATUS_STYLE[status].label} ({count})
                </button>
              );
            })}
            {problemCount > 0 && (
              <Button variant="ghost" size="sm" leftIcon={<Download size={14} />} onClick={downloadProblems} className="ml-auto">
                Download rows to fix
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-zinc-750 bg-zinc-900 overflow-auto max-h-[55vh] scrollbar-thin">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="sticky top-0 bg-zinc-850 text-xs text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Line</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {visibleRows.map((row) => (
                  <tr key={row.index} className="align-top">
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{parsed?.lineNumbers[row.index]}</td>
                    <td className="px-3 py-2 text-white">{row.fullName || '—'}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.email || '—'}</td>
                    <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.batch || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status].className}`}>
                        {STATUS_STYLE[row.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs min-w-[16rem]">
                      <RowDetail row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!outcome ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleImport} isLoading={importing} disabled={toAdd === 0}>
                {toAdd === 0 ? 'No new students to add' : `Add ${toAdd} student${toAdd === 1 ? '' : 's'}`}
              </Button>
              {importing && <p className="text-sm text-gray-400">Creating sign-in accounts — this can take a minute for a large file.</p>}
              {!importing && problemCount > 0 && toAdd > 0 && (
                <p className="text-sm text-gray-400">Rows that need fixing are skipped. Fix them and upload them again later.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-300">
                {outcome.summary.created} added
                {outcome.summary.failed > 0 ? `, ${outcome.summary.failed} not added` : ''}
                {outcome.summary.exists > 0 ? `, ${outcome.summary.exists} already on the platform` : ''}
                {outcome.summary.invalid > 0 ? `, ${outcome.summary.invalid} need fixing` : ''}.
                {' '}They sign in with Google using their university address.
              </p>
              <Button variant="secondary" size="sm" onClick={reset}>
                Import another file
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
