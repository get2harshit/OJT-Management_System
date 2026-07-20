import { useRef, useState } from 'react';
import { FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import { parseCSV, isExcelBinaryFile, EXCEL_FILE_WARNING } from '../../../lib/csv';
import { TRACKS } from '../../../lib/constants';
import { apiCreateProjectsBulk } from '../../../lib/api';
import type { ProjectCsvRowInput, ProjectBulkImportResult } from '../../../lib/api';
import type { ProjectLevel } from '../../../lib/types';
import { useToast } from '../../../toast';

interface ProjectCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

// Fuzzy-matches free-text track values (e.g. "App Dev", "Product Development")
// to one of the canonical TRACKS labels the backend enum understands. Returns
// null when nothing matches so the row is sent through unmapped — the
// backend's enum validation then correctly reports it as invalid instead of
// mapFrontendTrackToBackend silently defaulting it to Product Development.
function normalizeTrack(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes('app')) return 'Application Development';
  if (lower.includes('data')) return 'Data Scientist';
  if (lower.includes('open')) return 'Open Source';
  if (lower.includes('gen')) return 'Gen AI';
  if (lower.includes('product')) return 'Product Development';
  return null;
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

// Column headers this template expects, each matched loosely (substring,
// case-insensitive) so minor header wording differences between CSV exports
// don't break the import.
const COLUMN_PATTERNS = {
  projectId: ['ojtid', 'project_id', 'project id'],
  batch: ['batch'],
  track: ['track'],
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
function parseRows(parsed: string[][]): { rowNumber: number; project: Record<string, unknown> }[] {
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
    const normalizedTrack = trackRaw ? normalizeTrack(trackRaw) : null;
    const levelRaw = cell(cols, col.level);

    const project: Record<string, unknown> = {
      projectId: cell(cols, col.projectId),
      batch: splitList(cell(cols, col.batch)),
      track: normalizedTrack ?? trackRaw,
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
    };

    return { rowNumber, project };
  });
}

export default function ProjectCsvImportModal({ open, onClose, onImportSuccess }: ProjectCsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ProjectBulkImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showSuccess, showError } = useToast();

  const handleClose = () => {
    setCsvText('');
    setResult(null);
    onClose();
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
    const missingColumns = REQUIRED_COLUMNS.filter(({ patterns }) => !headers.some(h => patterns.some(p => h.includes(p))));
    if (missingColumns.length > 0) {
      showError(`CSV is missing required column(s): ${missingColumns.map(c => c.label).join(', ')}`);
      return;
    }

    const rows = parseRows(parsed);
    setImporting(true);
    setResult(null);
    try {
      const importResult = await apiCreateProjectsBulk(rows.map(r => r.project) as ProjectCsvRowInput[]);
      setResult(importResult);
      if (importResult.added.length > 0 || importResult.updated.length > 0) {
        showSuccess(`${importResult.added.length} project template(s) imported, ${importResult.updated.length} updated.`);
        onImportSuccess();
      }
      // Only auto-close on a fully clean import — if anything was skipped,
      // leave the modal open so the admin can see exactly what needs fixing.
      if (importResult.duplicates.length === 0 && importResult.invalid.length === 0) {
        handleClose();
      } else {
        setCsvText('');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to import project templates');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Project templates via CSV">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Upload or paste the full project catalog CSV. Rows are imported independently — a row with a missing
          field or a duplicate title/problem statement/description is skipped and reported below; it won't block
          the rest of the file. If a row's Project ID (OJTID) already exists in the catalog, that project is
          overwritten with the row's data instead of being skipped as a duplicate.
        </p>

        <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
          <span className="text-gold">Expected Headers:</span>
          <div className="text-white">
            Batch, Project ID (OJTID), Track, Course Covered, Title, Problem Statement, Project Description,
            Description, End Users Defined, Tech Stack, Framework, Suggested Libraries / Tools,
            Core Learning Goals, Stretch Goal, Evaluation Metrics, Expected Output, First/Second/Third Month
            Milestones, Industry, Must Have Features, Good To Have Features, Level
          </div>
          <span className="text-gray-500 block pt-1">Valid tracks:</span>
          <div>{TRACKS.join(', ')}</div>
          <span className="text-gray-500 block pt-1">Level (1-5):</span>
          <div>1 = Beginner, 2-3 = Intermediate, 4-5 = Advanced</div>
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => setCsvText(ev.target?.result as string);
              reader.readAsText(file);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-gold border border-zinc-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Choose File
          </button>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Or paste CSV text below</label>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={5}
            placeholder="Batch,Project ID,Track,Course Covered,Title,Problem Statement..."
            className="w-full bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold font-mono"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!csvText || importing}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText size={18} />
          {importing ? 'Importing...' : 'Import Project Catalog'}
        </button>

        {result && (result.duplicates.length > 0 || result.invalid.length > 0 || result.added.length > 0 || result.updated.length > 0) && (
          <div className="space-y-2 border-t border-zinc-800 pt-3">
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
              <div className="text-sm text-amber-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {result.duplicates.length} duplicate(s) skipped
                </div>
                <ul className="mt-1 ml-6 list-disc text-xs text-amber-300/80 space-y-0.5">
                  {result.duplicates.map((d, i) => (
                    <li key={i}>{d.identifier}: {d.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.invalid.length > 0 && (
              <div className="text-sm text-red-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {result.invalid.length} invalid row(s) skipped
                </div>
                <ul className="mt-1 ml-6 list-disc text-xs text-red-300/80 space-y-0.5">
                  {result.invalid.map((d, i) => (
                    <li key={i}>{d.identifier}: {d.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
