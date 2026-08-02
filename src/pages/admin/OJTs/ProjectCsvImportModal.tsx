import { useRef, useState, useMemo } from 'react';
import { FileText, AlertTriangle, CheckCircle2, Upload, FileSpreadsheet, Trash2, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { parseCSV, isExcelBinaryFile, EXCEL_FILE_WARNING } from '../../../lib/csv';
import { apiCreateProjectsBulk } from '../../../lib/api';
import type { ProjectCsvRowInput, ProjectBulkImportResult } from '../../../lib/api';
import type { ProjectLevel } from '../../../lib/types';
import type { ApiTrack } from '../../../lib/api/tracks';
import { useTracks } from '../../../hooks/useTracks';
import { useToast } from '../../../toast';

// Fuzzy-matches a free-text CSV track value (e.g. "App Dev", "Product
// Development") against the real, admin-managed track list — by slug or by
// name, case-insensitive, substring-tolerant. Returns null when nothing
// matches (including an empty cell) so the row is sent through unmapped —
// the backend's validation then correctly reports it as invalid/missing
// instead of silently defaulting to some track (see memory: this used to
// silently default to product_development, which is exactly the bug this
// null-on-no-match behavior avoids).
function normalizeTrack(raw: string, tracks: ApiTrack[]): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  const exact = tracks.find(t => t.slug.toLowerCase() === lower || t.name.toLowerCase() === lower);
  if (exact) return exact.slug;

  // Only accept a partial match when exactly one track matches. A cell reading
  // just "dev" matches both "App Dev" and "Product Development", and picking
  // whichever came first would quietly file the project under the wrong track.
  const partials = tracks.filter(t => t.name.toLowerCase().includes(lower) || lower.includes(t.name.toLowerCase()));
  return partials.length === 1 ? partials[0].slug : null;
}

// The sheet's Level column is a 1-5 difficulty scale (1 = beginner,
// 2-3 = intermediate, 4-5 = advanced) — collapsed here into the backend's
// 3-value enum since the DB/validation layer still only knows
// beginner/intermediate/advanced. Falls back to fuzzy text matching for
// CSVs that still spell the level out instead of using the numeric scale.
function normalizeLevel(raw: string): ProjectLevel | undefined {
  const numeric = Number(raw.trim());
  if (Number.isInteger(numeric)) {
    if (numeric === 1) return 'beginner';
    if (numeric === 2 || numeric === 3) return 'intermediate';
    if (numeric === 4 || numeric === 5) return 'advanced';
  }
  const lower = raw.toLowerCase();
  if (lower.includes('beg')) return 'beginner';
  if (lower.includes('inter') || lower.includes('mod')) return 'intermediate';
  if (lower.includes('adv')) return 'advanced';
  return undefined;
}

// Quote characters left on the edges of a value, stripped. Whoever fills the
// sheet may write a list as react,next or as "react,next", and an export that
// double-encodes leaves the quotes in the parsed value either way. Only the
// leading and trailing ones go, so a value that legitimately contains a quote
// (5" pipe) keeps it.
function stripEdgeQuotes(value: string): string {
  return value.trim().replace(/^"+/, '').replace(/"+$/, '').trim();
}

function splitList(raw: string): string[] {
  return raw ? raw.split(',').map(stripEdgeQuotes).filter(Boolean) : [];
}

// The sheet only ever puts a plain number in this cell (weeks) — the
// leading-digit strip is just a safety net for a stray "weeks" suffix or
// surrounding whitespace, not an expected input shape.
function parseDurationWeeks(raw: string): number | undefined {
  const match = raw.match(/\d+/);
  if (!match) return undefined;
  return Number(match[0]);
}

// Column headers this template expects, each matched loosely (substring,
// case-insensitive) so minor header wording differences between CSV exports
// don't break the import.
const COLUMN_PATTERNS = {
  projectId: ['ojtid', 'project_id', 'project id'],
  batch: ['batch'],
  track: ['track'],
  // Free-text classification, separate from track eligibility config —
  // optional, so it's not in REQUIRED_COLUMNS.
  trackClassification: ['track_classification', 'track classification'],
  courseCovered: ['course_covered', 'course covered'],
  problemStatement: ['problem_statement', 'problem statement'],
  projectDescription: ['project description', 'project_description'],
  endUsersDefined: ['end_users_defined', 'end users defined'],
  techStack: ['tech_stack', 'tech stack', 'techstack'],
  framework: ['framework'],
  suggestedLibrariesTools: ['suggested librar'],
  coreLearningGoals: ['core_learning', 'core learning'],
  stretchGoal: ['stretch'],
  evaluationMetrics: ['evaluation'],
  expectedOutput: ['expected output', 'expected_output'],
  firstMonthMilestones: ['first_month', 'first month'],
  secondMonthMilestones: ['second_month', 'second month'],
  thirdMonthMilestones: ['third_month', 'third month'],
  industry: ['industry'],
  mustHaveFeatures: ['must_have', 'must have'],
  goodToHaveFeatures: ['good_to_have', 'good to have'],
  level: ['level'],
  theme: ['theme'],
  referenceDocs: ['reference doc', 'reference_docs'],
  estimatedDuration: ['estimated duration', 'estimated_duration'],
  sourceStartupSchool: ['startup school', 'source / startup', 'source_startup'],
  // Comma-separated mentor names — the backend resolves each one against a
  // real mentor and rejects the row if any name is unknown.
  recommendedMentor: ['recommended_mentor', 'recommended mentor', 'recommended mentors'],
  creditMapping: ['credit_mapping', 'credit mapping', 'credits'],
  // Comma-separated partner organisation names; logos come from the server.
  partners: ['partners', 'partner organization', 'partner organisation'],
} as const;

// Every field the CSV row schema requires on the backend (adminProjectRowSchema)
// — if the header row is missing one of these columns entirely, every row
// would fail validation for the same reason, so that's surfaced once up
// front instead of as N identical per-row errors after the request.
//
// An admin sheet describes a project completely, so this is every column
// except the three the backend marks optional: Recommended Mentor (a project
// can be catalogued before anyone is lined up to mentor it), Credit Mapping
// and Partners (not every project carries either). Keep this list in step with
// ADMIN_OPTIONAL_FIELDS in domain/projectFields.ts.
const REQUIRED_COLUMNS: Array<{ label: string; patterns: readonly string[] }> = [
  { label: 'Title', patterns: ['title'] },
  { label: 'Track', patterns: COLUMN_PATTERNS.track },
  { label: 'Track Classification', patterns: COLUMN_PATTERNS.trackClassification },
  { label: 'Batch', patterns: COLUMN_PATTERNS.batch },
  { label: 'Project ID (OJTID)', patterns: COLUMN_PATTERNS.projectId },
  { label: 'Course Covered', patterns: COLUMN_PATTERNS.courseCovered },
  { label: 'Problem Statement', patterns: COLUMN_PATTERNS.problemStatement },
  { label: 'Description', patterns: ['description'] },
  { label: 'Project Description', patterns: COLUMN_PATTERNS.projectDescription },
  { label: 'End Users Defined', patterns: COLUMN_PATTERNS.endUsersDefined },
  { label: 'Tech Stack', patterns: COLUMN_PATTERNS.techStack },
  { label: 'Framework', patterns: COLUMN_PATTERNS.framework },
  { label: 'Suggested Libraries / Tools', patterns: COLUMN_PATTERNS.suggestedLibrariesTools },
  { label: 'Core Learning Goals', patterns: COLUMN_PATTERNS.coreLearningGoals },
  { label: 'Stretch Goal', patterns: COLUMN_PATTERNS.stretchGoal },
  { label: 'Expected Output', patterns: COLUMN_PATTERNS.expectedOutput },
  { label: 'First Month Milestones', patterns: COLUMN_PATTERNS.firstMonthMilestones },
  { label: 'Second Month Milestones', patterns: COLUMN_PATTERNS.secondMonthMilestones },
  { label: 'Third Month Milestones', patterns: COLUMN_PATTERNS.thirdMonthMilestones },
  { label: 'Industry', patterns: COLUMN_PATTERNS.industry },
  { label: 'Must Have Features', patterns: COLUMN_PATTERNS.mustHaveFeatures },
  { label: 'Good To Have Features', patterns: COLUMN_PATTERNS.goodToHaveFeatures },
  { label: 'Evaluation Metrics', patterns: COLUMN_PATTERNS.evaluationMetrics },
  { label: 'Level', patterns: COLUMN_PATTERNS.level },
  { label: 'Theme', patterns: COLUMN_PATTERNS.theme },
  { label: 'Reference Docs', patterns: COLUMN_PATTERNS.referenceDocs },
  { label: 'Estimated Duration', patterns: COLUMN_PATTERNS.estimatedDuration },
  { label: 'Source / Startup School', patterns: COLUMN_PATTERNS.sourceStartupSchool },
];

function findColumn(headers: string[], patterns: readonly string[]): number {
  return headers.findIndex(h => patterns.some(p => h.includes(p)));
}

// Best-effort structural mapping only — required-field presence, char
// limits, enum validity and duplicate detection are NOT re-implemented here.
// The backend (adminProjectRowSchema + ProjectService.createProjectsBulk) is
// the single source of truth for those rules; a row this function produces
// may still come back invalid or duplicate, and that's expected — it's
// reported per-row in the import result instead of blocking the whole file.
//
// Every row carries the track its own cell names, on both import paths. A
// track-scoped import used to overwrite that with the page's track, which
// meant a sheet uploaded on the wrong track's page was silently refiled
// instead of refused; the backend now checks each row against the scope and
// rejects the ones that disagree.
function parseRows(parsed: string[][], tracks: ApiTrack[]): { rowNumber: number; project: Record<string, unknown> }[] {
  const headers = parsed[0].map(h => h.toLowerCase().trim());
  const titleIdx = headers.findIndex(h => h.includes('title') && !h.includes('track'));
  const descriptionIdx = headers.findIndex(h => h.includes('description') && !h.includes('project'));
  const col = Object.fromEntries(
    Object.entries(COLUMN_PATTERNS).map(([key, patterns]) => [key, findColumn(headers, patterns)])
  ) as Record<keyof typeof COLUMN_PATTERNS, number>;

  // "Track Classification" also contains "track", so a sheet listing it before
  // the Track column would otherwise bind col.track to the wrong column and
  // give every row that cell's free text as its track.
  col.track = headers.findIndex(h => h.includes('track') && !h.includes('classification'));

  const cell = (cols: string[], i: number) => (i !== -1 ? (cols[i]?.trim() ?? '') : '');

  return parsed.slice(1).map((cols, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const trackRaw = cell(cols, col.track);
    // An empty or unmatched cell is sent through as-is (never defaulted) so
    // the backend's required/enum validation rejects it explicitly — see
    // normalizeTrack's comment.
    const normalizedTrack = normalizeTrack(trackRaw, tracks);
    const levelRaw = cell(cols, col.level);

    const project: Record<string, unknown> = {
      projectId: cell(cols, col.projectId),
      batch: splitList(cell(cols, col.batch)),
      track: normalizedTrack ?? trackRaw,
      trackClassification: cell(cols, col.trackClassification) || undefined,
      courseCovered: splitList(cell(cols, col.courseCovered)),
      title: cell(cols, titleIdx),
      problemStatement: cell(cols, col.problemStatement),
      projectDescription: cell(cols, col.projectDescription) || undefined,
      description: cell(cols, descriptionIdx),
      endUsersDefined: cell(cols, col.endUsersDefined) || undefined,
      techStack: splitList(cell(cols, col.techStack)),
      framework: splitList(cell(cols, col.framework)),
      suggestedLibrariesTools: splitList(cell(cols, col.suggestedLibrariesTools)),
      coreLearningGoals: splitList(cell(cols, col.coreLearningGoals)),
      stretchGoal: splitList(cell(cols, col.stretchGoal)),
      evaluationMetrics: splitList(cell(cols, col.evaluationMetrics)),
      expectedOutput: splitList(cell(cols, col.expectedOutput)),
      firstMonthMilestones: splitList(cell(cols, col.firstMonthMilestones)),
      secondMonthMilestones: splitList(cell(cols, col.secondMonthMilestones)),
      thirdMonthMilestones: splitList(cell(cols, col.thirdMonthMilestones)),
      industry: cell(cols, col.industry),
      mustHaveFeatures: splitList(cell(cols, col.mustHaveFeatures)),
      goodToHaveFeatures: splitList(cell(cols, col.goodToHaveFeatures)),
      level: levelRaw ? normalizeLevel(levelRaw) : undefined,
      theme: cell(cols, col.theme) || undefined,
      referenceDocs: cell(cols, col.referenceDocs) || undefined,
      estimatedDuration: parseDurationWeeks(cell(cols, col.estimatedDuration)),
      sourceStartupSchool: cell(cols, col.sourceStartupSchool) || undefined,
      recommendedMentor: splitList(cell(cols, col.recommendedMentor)),
      creditMapping: splitList(cell(cols, col.creditMapping)),
      partners: splitList(cell(cols, col.partners)),
    };

    return { rowNumber, project };
  });
}

const MANDATORY_FIELDS_HINT = REQUIRED_COLUMNS.map(c => c.label).join(', ');

interface ProjectCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
  cohortId?: string;
  forcedTrackSlug?: string;
}

export default function ProjectCsvImportModal({ open, onClose, onImportSuccess, cohortId, forcedTrackSlug }: ProjectCsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ProjectBulkImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showSuccess, showError } = useToast();
  const { tracks } = useTracks();

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

  // Live CSV parsing & header validation
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
    // Track is required on every path, including a track-scoped import: that
    // import checks each row against the page's track rather than assuming it,
    // and a sheet with no Track column has nothing to check.
    const missingColumns = REQUIRED_COLUMNS.filter(({ patterns }) => !headers.some(h => patterns.some(p => h.includes(p))));
    const dataRowsCount = Math.max(0, parsed.length - 1);

    // More cells than the header means a comma inside an unquoted cell split
    // the row — a tech stack written as react,next rather than "react,next".
    // Everything past the split sits in the wrong column, so the row would
    // import as convincing nonsense rather than failing. Which cell split
    // can't be recovered (the commas are indistinguishable from the real
    // separators), so the row is named and the import stopped instead of
    // guessed at. Short rows are left alone — trailing empty cells are
    // routinely dropped on export and mean nothing is wrong.
    const raggedRows = parsed
      .slice(1)
      .map((cols, i) => ({ rowNumber: i + 2, cells: cols.length }))
      .filter(r => r.cells > headers.length);

    let sampleRows: Array<{ title: string; projectId: string; track: string }> = [];
    if (dataRowsCount > 0) {
      const rows = parseRows(parsed.slice(0, 4), tracks);
      sampleRows = rows.slice(0, 3).map(r => ({
        title: String(r.project.title || 'Untitled'),
        projectId: String(r.project.projectId || '-'),
        track: String(r.project.track || '-'),
      }));
    }

    return {
      headers,
      missingColumns,
      raggedRows,
      dataRowsCount,
      sampleRows,
      isValid: missingColumns.length === 0 && raggedRows.length === 0 && dataRowsCount > 0,
    };
  }, [parsed, tracks]);

  const handleUpload = async () => {
    if (!csvText || !parsed || !validation?.isValid) return;

    const rows = parseRows(parsed, tracks);
    setImporting(true);
    setResult(null);
    setErrorMessage(null);

    try {
      const importResult = await apiCreateProjectsBulk(
        rows.map(r => r.project) as unknown as ProjectCsvRowInput[],
        cohortId,
        forcedTrackSlug
      );
      setResult(importResult);
      if (importResult.added.length > 0 || importResult.updated.length > 0) {
        showSuccess(`${importResult.added.length} project template(s) imported, ${importResult.updated.length} updated.`);
        onImportSuccess();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import project templates');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Project templates via CSV">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {forcedTrackSlug && (
          <div className="text-sm text-gold bg-gold/10 border border-gold/25 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5" />
            <p>
              This import only accepts{' '}
              <span className="font-semibold text-white">{tracks.find(t => t.slug === forcedTrackSlug)?.name ?? forcedTrackSlug}</span>{' '}
              projects — every row's Track column must name that track, and rows on any other track are reported and skipped.
            </p>
          </div>
        )}

        {/* ── SHOW IMPORT RESULT DIRECTLY INSIDE MODAL WHEN AVAILABLE ── */}
        {(result || errorMessage) ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-zinc-850 border border-zinc-750 rounded-xl space-y-4 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-750 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="text-gold" size={20} />
                  Import Execution Results
                </h3>
                <span className="text-xs text-gray-400 font-mono">
                  {selectedFileName}
                </span>
              </div>

              {errorMessage ? (
                <div className="p-3.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-sm font-medium flex items-center gap-2">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : result && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Added</span>
                      <span className="text-lg font-bold text-green-400 mt-0.5 block">{result.added.length}</span>
                    </div>
                    <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Updated</span>
                      <span className="text-lg font-bold text-blue-400 mt-0.5 block">{result.updated.length}</span>
                    </div>
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Skipped</span>
                      <span className="text-lg font-bold text-amber-400 mt-0.5 block">{result.duplicates.length}</span>
                    </div>
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                      <span className="text-xs font-semibold text-gray-400 block uppercase tracking-wider">Invalid</span>
                      <span className="text-lg font-bold text-red-400 mt-0.5 block">{result.invalid.length}</span>
                    </div>
                  </div>

                  {/* Duplicate Rows Table */}
                  {result.duplicates.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        Skipped Duplicates ({result.duplicates.length}):
                      </p>
                      <div className="rounded-xl border border-amber-500/20 overflow-hidden max-h-40 overflow-y-auto bg-zinc-900">
                        <table className="w-full text-left text-xs text-white border-collapse">
                          <thead className="bg-amber-500/10 text-amber-400 uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="px-3 py-2 border-b border-amber-500/20 font-semibold">Identifier</th>
                              <th className="px-3 py-2 border-b border-amber-500/20 font-semibold">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-500/10">
                            {result.duplicates.map((d, i) => (
                              <tr key={i} className="hover:bg-amber-500/5">
                                <td className="px-3 py-2 font-mono text-amber-200">{d.identifier}</td>
                                <td className="px-3 py-2 text-gray-300">{d.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Invalid Rows Table */}
                  {result.invalid.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        Invalid Rows ({result.invalid.length}):
                      </p>
                      <div className="rounded-xl border border-red-500/20 overflow-hidden max-h-40 overflow-y-auto bg-zinc-900">
                        <table className="w-full text-left text-xs text-white border-collapse">
                          <thead className="bg-red-500/10 text-red-400 uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="px-3 py-2 border-b border-red-500/20 font-semibold">Row / Identifier</th>
                              <th className="px-3 py-2 border-b border-red-500/20 font-semibold">Error Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-500/10">
                            {result.invalid.map((d, i) => (
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
          /* ── NORMAL FILE UPLOAD & PREVIEW UI ── */
          <>
            <div className="p-3.5 bg-zinc-850 border border-zinc-750 rounded-xl space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Required Header Fields</p>
              <p className="text-xs text-gray-300 leading-relaxed font-mono">
                {MANDATORY_FIELDS_HINT}
              </p>
            </div>

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

                  {/* Live Validation & Mini Row Preview */}
                  {validation && (
                    <div className="pt-3 border-t border-zinc-750 space-y-3">
                      {validation.missingColumns.length > 0 ? (
                        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 space-y-1.5">
                          <p className="font-bold flex items-center gap-1.5 text-sm">
                            <AlertTriangle size={16} />
                            Missing required CSV column(s):
                          </p>
                          <p className="text-red-300 font-mono pl-5">{validation.missingColumns.map(c => c.label).join(', ')}</p>
                        </div>
                      ) : validation.raggedRows.length > 0 ? (
                        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 space-y-1.5">
                          <p className="font-bold flex items-center gap-1.5 text-sm">
                            <AlertTriangle size={16} />
                            {validation.raggedRows.length === 1 ? 'Row' : 'Rows'} with too many columns:
                          </p>
                          <p className="text-red-300 font-mono pl-5">
                            {validation.raggedRows.slice(0, 12).map(r => `Row ${r.rowNumber}`).join(', ')}
                            {validation.raggedRows.length > 12 && ` +${validation.raggedRows.length - 12} more`}
                          </p>
                          <p className="text-red-300/80 pl-5 leading-relaxed">
                            A cell containing a comma wasn&apos;t wrapped in quotes, so it split into
                            extra columns and shifted the rest of the row. Write it as{' '}
                            <span className="font-mono">&quot;react, next&quot;</span> rather than{' '}
                            <span className="font-mono">react, next</span>.
                          </p>
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
                              {validation.dataRowsCount} project template{validation.dataRowsCount === 1 ? '' : 's'} ready
                            </span>
                          </div>

                          {/* Mini Sample Preview Table */}
                          {validation.sampleRows.length > 0 && (
                            <div className="rounded-xl border border-zinc-750 overflow-hidden bg-zinc-900 shadow-inner">
                              <div className="px-3.5 py-2 bg-zinc-800/80 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-zinc-750 flex items-center justify-between">
                                <span>File Preview (First {validation.sampleRows.length} rows):</span>
                                <span className="text-gold font-mono">CSV Ready</span>
                              </div>
                              <table className="w-full text-left text-xs text-gray-300">
                                <thead>
                                  <tr className="border-b border-zinc-800 text-gray-400 uppercase text-[10px]">
                                    <th className="px-3.5 py-2 font-semibold">ID</th>
                                    <th className="px-3.5 py-2 font-semibold">Title</th>
                                    <th className="px-3.5 py-2 font-semibold">Track</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/60">
                                  {validation.sampleRows.map((r, i) => (
                                    <tr key={i} className="hover:bg-zinc-850/50">
                                      <td className="px-3.5 py-2 font-mono text-gold font-medium">{r.projectId}</td>
                                      <td className="px-3.5 py-2 truncate max-w-[170px] text-white font-medium">{r.title}</td>
                                      <td className="px-3.5 py-2 text-gray-400">{r.track}</td>
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
                  <span>Importing Projects...</span>
                </>
              ) : (
                <>
                  <FileText size={18} />
                  <span>Import Project Catalog</span>
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
