import { useRef, useState, useMemo } from 'react';
import { FileText, AlertTriangle, CheckCircle2, Upload, FileSpreadsheet, Trash2, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { parseCSV, isExcelBinaryFile, EXCEL_FILE_WARNING } from '../../lib/csv';
import { apiBulkMarkFeePending } from '../../lib/api';
import type { EligibilityBulkFeePendingResult, EligibilityBulkFeePendingRow } from '../../lib/api';
import { useToast } from '../../toast';

// Header patterns matched loosely (substring, case-insensitive) — the sheet
// only needs one of the two, since a row can be resolved by either.
const COLUMN_PATTERNS = {
  email: ['email'],
  registrationNumber: ['registration', 'reg no', 'reg_no', 'regno'],
} as const;

function findColumn(headers: string[], patterns: readonly string[]): number {
  return headers.findIndex(h => patterns.some(p => h.includes(p)));
}

function parseRows(parsed: string[][]): { rowNumber: number; row: EligibilityBulkFeePendingRow }[] {
  const headers = parsed[0].map(h => h.toLowerCase().trim());
  const emailIdx = findColumn(headers, COLUMN_PATTERNS.email);
  const regIdx = findColumn(headers, COLUMN_PATTERNS.registrationNumber);
  const cell = (cols: string[], i: number) => (i !== -1 ? (cols[i]?.trim() ?? '') : '');

  return parsed
    .slice(1)
    .map((cols, i) => ({
      rowNumber: i + 2,
      row: {
        msuEmail: cell(cols, emailIdx) || undefined,
        msuRegistrationNumber: cell(cols, regIdx) || undefined,
      },
    }))
    // Trailing blank lines are routinely left in exported sheets — they carry
    // neither field and would otherwise show up as an "unmatched" row for no
    // reason a reader could see in the file.
    .filter(r => r.row.msuEmail || r.row.msuRegistrationNumber);
}

interface EligibilityCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export default function EligibilityCsvImportModal({ open, onClose, onImportSuccess }: EligibilityCsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<EligibilityBulkFeePendingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showSuccess, showError } = useToast();

  const handleClose = () => {
    setCsvText('');
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setResult(null);
    setErrorMessage(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const handleRemoveFile = () => {
    setCsvText('');
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setResult(null);
    setErrorMessage(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (isExcelBinaryFile(file.name)) {
      showError(EXCEL_FILE_WARNING);
      return;
    }
    setResult(null);
    setErrorMessage(null);
    setSelectedFileName(file.name);
    setSelectedFileSize((file.size / 1024).toFixed(1) + ' KB');
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      if (text && isExcelBinaryFile(text)) {
        showError(EXCEL_FILE_WARNING);
      }
    };
    reader.readAsText(file);
  };

  const parsed = useMemo(() => {
    if (!csvText) return null;
    try {
      return parseCSV(csvText);
    } catch {
      return null;
    }
  }, [csvText]);

  const validation = useMemo(() => {
    if (!parsed || parsed.length === 0) return null;
    const headers = parsed[0].map(h => h.toLowerCase().trim());
    const hasEmailColumn = findColumn(headers, COLUMN_PATTERNS.email) !== -1;
    const hasRegColumn = findColumn(headers, COLUMN_PATTERNS.registrationNumber) !== -1;
    const rows = parseRows(parsed);

    return {
      hasRequiredColumn: hasEmailColumn || hasRegColumn,
      dataRowsCount: rows.length,
      sampleRows: rows.slice(0, 3).map(r => ({
        email: r.row.msuEmail || '—',
        registrationNumber: r.row.msuRegistrationNumber || '—',
      })),
      isValid: (hasEmailColumn || hasRegColumn) && rows.length > 0,
    };
  }, [parsed]);

  const handleUpload = async () => {
    if (!csvText || !parsed || !validation?.isValid) return;

    const rows = parseRows(parsed).map(r => r.row);
    setImporting(true);
    setResult(null);
    setErrorMessage(null);

    try {
      const importResult = await apiBulkMarkFeePending(rows);
      setResult(importResult);
      if (importResult.matched > 0) {
        showSuccess(
          `${importResult.matched} student(s) marked fee pending (${importResult.created} new, ${importResult.updated} updated).`
        );
        onImportSuccess();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process CSV');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Update Fee Pending via CSV">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div className="text-sm text-gold bg-gold/10 border border-gold/25 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5" />
          <p>
            Upload a CSV with an <span className="font-semibold text-white">Email</span> and/or{' '}
            <span className="font-semibold text-white">Registration Number</span> column. Every row is matched
            against the student roster — a match sets that student&apos;s Fee Status to Pending, which blocks
            their sign-in immediately. Rows that match nobody are reported, never created as a new row.
          </p>
        </div>

        {(result || errorMessage) ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-zinc-850 border border-zinc-750 rounded-xl space-y-4 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-750 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="text-gold" size={20} />
                  Import Execution Results
                </h3>
                <span className="text-xs text-gray-400 font-mono">{selectedFileName}</span>
              </div>

              {errorMessage ? (
                <div className="p-3.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-sm font-medium flex items-center gap-2">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : result && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">New Rows</span>
                      <span className="text-lg font-bold text-green-400 mt-0.5 block">{result.created}</span>
                    </div>
                    <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Updated</span>
                      <span className="text-lg font-bold text-blue-400 mt-0.5 block">{result.updated}</span>
                    </div>
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Unmatched</span>
                      <span className="text-lg font-bold text-red-400 mt-0.5 block">{result.unmatched.length}</span>
                    </div>
                  </div>

                  {result.unmatched.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        Unmatched Rows ({result.unmatched.length}):
                      </p>
                      <div className="rounded-xl border border-red-500/20 overflow-hidden max-h-40 overflow-y-auto bg-zinc-900">
                        <table className="w-full text-left text-xs text-white border-collapse">
                          <thead className="bg-red-500/10 text-red-400 uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="px-3 py-2 border-b border-red-500/20 font-semibold">Identifier</th>
                              <th className="px-3 py-2 border-b border-red-500/20 font-semibold">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-500/10">
                            {result.unmatched.map((d, i) => (
                              <tr key={i} className="hover:bg-red-500/5">
                                <td className="px-3 py-2 font-mono text-red-200">{d.identifier}</td>
                                <td className="px-3 py-2 text-gray-300">{d.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleRemoveFile}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-white font-semibold rounded-xl border border-zinc-700 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <RefreshCw size={16} />
                Upload Another File
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 bg-gold text-black font-semibold rounded-xl hover:bg-gold-hover transition-colors text-sm shadow-md"
              >
                Done / Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={e => {
                  const file = e.target.files?.[0];
                  handleFileSelect(file);
                }}
                className="hidden"
              />

              {selectedFileName ? (
                <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4 space-y-3 shadow-md animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-gold/10 rounded-xl shrink-0 border border-gold/25">
                        <FileSpreadsheet className="text-gold" size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white truncate">{selectedFileName}</p>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-gray-400 font-mono border border-zinc-700 shrink-0">
                            {selectedFileSize}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      title="Remove selected file"
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors ml-2 shrink-0 border border-transparent hover:border-red-500/20"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {validation && (
                    <div className="pt-3 border-t border-zinc-750 space-y-3">
                      {!validation.hasRequiredColumn ? (
                        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 space-y-1.5">
                          <p className="font-bold flex items-center gap-1.5 text-sm">
                            <AlertTriangle size={16} />
                            No Email or Registration Number column found
                          </p>
                          <p className="text-red-300 pl-5">At least one of the two columns is required.</p>
                        </div>
                      ) : validation.dataRowsCount === 0 ? (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-center gap-2">
                          <AlertTriangle size={16} />
                          No data rows detected below the header row in this CSV.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-3.5 py-2">
                            <p className="text-xs text-green-400 font-bold flex items-center gap-1.5">
                              <CheckCircle2 size={15} />
                              Validation passed!
                            </p>
                            <span className="text-xs text-green-300 font-semibold font-mono">
                              {validation.dataRowsCount} row{validation.dataRowsCount === 1 ? '' : 's'} ready
                            </span>
                          </div>

                          {validation.sampleRows.length > 0 && (
                            <div className="rounded-xl border border-zinc-750 overflow-hidden bg-zinc-900 shadow-inner">
                              <div className="px-3.5 py-2 bg-zinc-800/80 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-zinc-750 flex items-center justify-between">
                                <span>File Preview (First {validation.sampleRows.length} rows):</span>
                                <span className="text-gold font-mono">CSV Ready</span>
                              </div>
                              <table className="w-full text-left text-xs text-gray-300">
                                <thead>
                                  <tr className="border-b border-zinc-800 text-gray-400 uppercase text-[10px]">
                                    <th className="px-3.5 py-2 font-semibold">Email</th>
                                    <th className="px-3.5 py-2 font-semibold">Registration No.</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/60">
                                  {validation.sampleRows.map((r, i) => (
                                    <tr key={i} className="hover:bg-zinc-850/50">
                                      <td className="px-3.5 py-2 text-white font-medium">{r.email}</td>
                                      <td className="px-3.5 py-2 text-gray-400 font-mono">{r.registrationNumber}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    handleFileSelect(file);
                  }}
                  className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all duration-200 group ${
                    isDragging
                      ? 'border-gold bg-gold/10 scale-[1.01]'
                      : 'border-zinc-750 hover:border-gold/50 bg-zinc-850/40 hover:bg-zinc-850'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-3 text-gold group-hover:scale-110 group-hover:border-gold/40 transition-transform">
                    <Upload size={22} />
                  </div>
                  <p className="text-sm font-bold text-white">
                    Click to select CSV file <span className="text-gray-400 font-normal">or drag & drop</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Supports plain text .csv or .txt files</p>
                </div>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={!validation?.isValid || importing}
              className="w-full py-3 bg-gold text-black font-bold rounded-xl hover:bg-gold-hover transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:scale-100 hover:scale-[1.01] shadow-lg shadow-gold/10"
            >
              {importing ? (
                <>
                  <Loader2 size={18} className="animate-spin text-black" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <FileText size={18} />
                  <span>Mark Fee Pending</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
