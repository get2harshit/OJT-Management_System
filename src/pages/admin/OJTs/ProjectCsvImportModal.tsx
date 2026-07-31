import { useRef, useState } from 'react';
import { FileText, AlertTriangle, CheckCircle2, X, Upload, FileSpreadsheet, Trash2 } from 'lucide-react';
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

  const partial = tracks.find(t => t.name.toLowerCase().includes(lower) || lower.includes(t.name.toLowerCase()));
  return partial ? partial.slug : null;
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

function splitList(raw: string): string[] {
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
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
} as const;

// Every field the CSV row schema requires on the backend (adminProjectRowSchema)
// — if the header row is missing one of these columns entirely, every row
// would fail validation for the same reason, so that's surfaced once up
// front instead of as N identical per-row errors after the request.
const REQUIRED_COLUMNS: Array<{ label: string; patterns: readonly string[] }> = [
  { label: 'Title', patterns: ['title'] },
  { label: 'Track', patterns: COLUMN_PATTERNS.track },
  { label: 'Batch', patterns: COLUMN_PATTERNS.batch },
  { label: 'Project ID (OJTID)', patterns: COLUMN_PATTERNS.projectId },
  { label: 'Course Covered', patterns: COLUMN_PATTERNS.courseCovered },
  { label: 'Problem Statement', patterns: COLUMN_PATTERNS.problemStatement },
  { label: 'Description', patterns: ['description'] },
  { label: 'Tech Stack', patterns: COLUMN_PATTERNS.techStack },
  { label: 'Core Learning Goals', patterns: COLUMN_PATTERNS.coreLearningGoals },
  { label: 'Expected Output', patterns: COLUMN_PATTERNS.expectedOutput },
  { label: 'Industry', patterns: COLUMN_PATTERNS.industry },
  { label: 'Must Have Features', patterns: COLUMN_PATTERNS.mustHaveFeatures },
  { label: 'Good To Have Features', patterns: COLUMN_PATTERNS.goodToHaveFeatures },
  { label: 'Evaluation Metrics', patterns: COLUMN_PATTERNS.evaluationMetrics },
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
// forcedTrackSlug (set when importing from a single track's page) overrides
// every row's track with that slug, ignoring the CSV's own track column
// entirely — so a "Product Development" upload only ever produces
// product-development projects, regardless of what (if anything) each row's
// track cell says. This also sidesteps the empty-track-defaulting bug for
// this flow, since no row is ever left without an explicit track.
function parseRows(parsed: string[][], tracks: ApiTrack[], forcedTrackSlug?: string): { rowNumber: number; project: Record<string, unknown> }[] {
  const headers = parsed[0].map(h => h.toLowerCase().trim());
  const titleIdx = headers.findIndex(h => h.includes('title') && !h.includes('track'));
  const descriptionIdx = headers.findIndex(h => h.includes('description') && !h.includes('project'));
  const col = Object.fromEntries(
    Object.entries(COLUMN_PATTERNS).map(([key, patterns]) => [key, findColumn(headers, patterns)])
  ) as Record<keyof typeof COLUMN_PATTERNS, number>;

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
      track: forcedTrackSlug ?? normalizedTrack ?? trackRaw,
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
  // When set, this import is scoped to a single track: every row's track is
  // forced to this slug and the CSV no longer needs a Track column at all.
  forcedTrackSlug?: string;
}

export default function ProjectCsvImportModal({ open, onClose, onImportSuccess, cohortId, forcedTrackSlug }: ProjectCsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);
  const [parsedRowCount, setParsedRowCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ProjectBulkImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showSuccess, showError } = useToast();
  const { tracks } = useTracks();

  const handleClose = () => {
    setCsvText('');
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setParsedRowCount(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const handleRemoveFile = () => {
    setCsvText('');
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setParsedRowCount(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (isExcelBinaryFile(file.name)) {
      showError(EXCEL_FILE_WARNING);
      return;
    }
    setSelectedFileName(file.name);
    setSelectedFileSize((file.size / 1024).toFixed(1) + ' KB');
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      if (text) {
        if (isExcelBinaryFile(text)) {
          showError(EXCEL_FILE_WARNING);
          return;
        }
        const parsed = parseCSV(text);
        setParsedRowCount(Math.max(0, parsed.length - 1));
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!csvText) return;
    if (isExcelBinaryFile(csvText)) {
      showError(EXCEL_FILE_WARNING);
      return;
    }

    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return;

    const headers = parsed[0].map(h => h.toLowerCase().trim());
    // A track-scoped import forces the track, so the CSV's Track column is no
    // longer required — drop it from the required set in that case.
    const requiredColumns = forcedTrackSlug
      ? REQUIRED_COLUMNS.filter(c => c.label !== 'Track')
      : REQUIRED_COLUMNS;
    const missingColumns = requiredColumns.filter(({ patterns }) => !headers.some(h => patterns.some(p => h.includes(p))));
    if (missingColumns.length > 0) {
      showError(`CSV is missing required column(s): ${missingColumns.map(c => c.label).join(', ')}`);
      return;
    }

    const rows = parseRows(parsed, tracks, forcedTrackSlug);
    setImporting(true);
    setResult(null);
    setErrorMessage(null);
    try {
      const importResult = await apiCreateProjectsBulk(rows.map(r => r.project) as unknown as ProjectCsvRowInput[], cohortId);
      setResult(importResult);
      if (importResult.added.length > 0 || importResult.updated.length > 0) {
        showSuccess(`${importResult.added.length} project template(s) imported, ${importResult.updated.length} updated.`);
        onImportSuccess();
      }
      // Only auto-close on a fully clean import — if anything was skipped,
      // leave the modal open (and pop the result card) so the admin can see
      // exactly what needs fixing before trying again.
      if (importResult.duplicates.length === 0 && importResult.invalid.length === 0) {
        handleClose();
      } else {
        setCsvText('');
        setSelectedFileName(null);
        setSelectedFileSize(null);
        setParsedRowCount(null);
        if (fileRef.current) fileRef.current.value = '';
        setCardOpen(true);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import project templates');
      setCardOpen(true);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={handleClose} title="Import Project templates via CSV">
        <div className="space-y-4">
          {forcedTrackSlug && (
            <p className="text-sm text-gold bg-gold/10 border border-gold/20 rounded-lg px-3 py-2">
              All imported projects will be assigned to the{' '}
              <span className="font-semibold">{tracks.find(t => t.slug === forcedTrackSlug)?.name ?? forcedTrackSlug}</span>{' '}
              track — the CSV's own track column (if any) is ignored.
            </p>
          )}
          <p className="text-sm text-gray-400">
            Mandatory fields:{' '}
            <span className="text-white">
              {forcedTrackSlug ? REQUIRED_COLUMNS.filter(c => c.label !== 'Track').map(c => c.label).join(', ') : MANDATORY_FIELDS_HINT}
            </span>
          </p>

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
              <div className="bg-zinc-850 border border-green-500/30 rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-green-500/10 rounded-lg shrink-0">
                    <FileSpreadsheet className="text-green-400" size={24} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{selectedFileName}</p>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-750 text-gray-400 font-mono shrink-0">
                        {selectedFileSize}
                      </span>
                    </div>
                    {parsedRowCount !== null && (
                      <p className="text-xs text-green-400 font-medium flex items-center gap-1 mt-0.5">
                        <CheckCircle2 size={13} />
                        {parsedRowCount} project template{parsedRowCount === 1 ? '' : 's'} ready to import
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  title="Remove selected file"
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-2 shrink-0"
                >
                  <Trash2 size={18} />
                </button>
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
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-gold bg-gold/10'
                    : 'border-zinc-700 hover:border-gold/50 bg-zinc-850/50 hover:bg-zinc-850'
                }`}
              >
                <Upload size={28} className="mx-auto text-gold/80 mb-2" />
                <p className="text-sm font-semibold text-white">
                  Click to select CSV file <span className="text-gray-400 font-normal">or drag & drop</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">Supports .csv or .txt files</p>
              </div>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!csvText || importing}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FileText size={18} />
            {importing ? 'Importing...' : 'Import Project Catalog'}
          </button>
        </div>
      </Modal>

      {/* Result/error card — pinned to the right of the screen and only
          dismissed by the admin, not on a timer, since a list of skipped
          rows is easy to miss in an auto-fading toast. */}
      {cardOpen && (errorMessage || result) && (
        <div className="fixed top-20 right-5 z-[60] w-full max-w-sm bg-zinc-900 border border-zinc-750 rounded-xl shadow-2xl shadow-black/50 animate-in slide-in-from-right-4 fade-in duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <AlertTriangle size={16} className="text-amber-400" />
              CSV Import Result
            </div>
            <button onClick={() => setCardOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="px-4 py-3 space-y-2 max-h-[60vh] overflow-y-auto">
            {errorMessage ? (
              <p className="text-sm text-red-400">{errorMessage}</p>
            ) : result && (
              <>
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 size={16} />
                  {result.added.length} project(s) added
                </div>
                {result.updated.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-blue-400">
                    <CheckCircle2 size={16} />
                    {result.updated.length} existing project(s) updated
                  </div>
                )}
                {result.duplicates.length > 0 && (
                  <div className="text-sm text-amber-400 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={16} />
                      {result.duplicates.length} duplicate(s) skipped
                    </div>
                    <div className="rounded-md border border-amber-500/20 overflow-hidden">
                      <table className="w-full text-left text-xs text-white border-collapse">
                        <thead className="bg-amber-500/10 text-amber-400">
                          <tr>
                            <th className="px-3 py-2 border-b border-amber-500/20 font-medium whitespace-nowrap">ID</th>
                            <th className="px-3 py-2 border-b border-amber-500/20 font-medium">Error Message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-500/10">
                          {result.duplicates.map((d, i) => (
                            <tr key={i} className="hover:bg-amber-500/5 transition-colors">
                              <td className="px-3 py-2 font-mono whitespace-nowrap">{d.identifier}</td>
                              <td className="px-3 py-2">{d.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {result.invalid.length > 0 && (
                  <div className="text-sm text-red-400 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={16} />
                      {result.invalid.length} invalid row(s) skipped
                    </div>
                    <div className="rounded-md border border-red-500/20 overflow-hidden">
                      <table className="w-full text-left text-xs text-white border-collapse">
                        <thead className="bg-red-500/10 text-red-400">
                          <tr>
                            <th className="px-3 py-2 border-b border-red-500/20 font-medium whitespace-nowrap">ID</th>
                            <th className="px-3 py-2 border-b border-red-500/20 font-medium">Error Message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-500/10">
                          {result.invalid.map((d, i) => (
                            <tr key={i} className="hover:bg-red-500/5 transition-colors">
                              <td className="px-3 py-2 font-mono whitespace-nowrap">{d.identifier}</td>
                              <td className="px-3 py-2">{d.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
