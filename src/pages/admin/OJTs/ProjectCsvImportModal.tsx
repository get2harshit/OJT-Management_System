import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import Modal from '../../../components/Modal';
import { parseCSV } from '../../../lib/csv';
import { TRACKS } from '../../../lib/constants';
import { apiCreateProjectsBulk } from '../../../lib/api';
import type { ProjectCreateInput } from '../../../lib/api';
import { useToast } from '../../../toast';

interface ProjectCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

// Fuzzy-matches free-text track values (e.g. "App Dev", "Product Development")
// to one of the canonical TRACKS labels the backend enum understands. Returns
// null when nothing matches so the caller can reject that row instead of
// silently mis-tagging it.
function normalizeTrack(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes('app')) return 'Application Development';
  if (lower.includes('data')) return 'Data Scientist';
  if (lower.includes('open')) return 'Open Source';
  if (lower.includes('gen')) return 'Gen AI';
  if (lower.includes('product')) return 'Product Development';
  return null;
}

interface ParsedRow {
  rowNumber: number;
  project: ProjectCreateInput | null;
  error: string | null;
}

function parseRows(parsed: string[][]): ParsedRow[] {
  const headers = parsed[0].map(h => h.toLowerCase().trim());
  const titleIdx = headers.findIndex(h => h.includes('project title') || (h.includes('title') && !h.includes('track')));
  const trackIdx = headers.findIndex(h => h.includes('track'));
  const coreLearningIdx = headers.findIndex(h => h.includes('core learning'));
  const expectedOutputIdx = headers.findIndex(h => h.includes('expected output'));
  const featuresIdx = headers.findIndex(h => h.includes('must have') || h.includes('features and functionalities'));
  const techStackIdx = headers.findIndex(h => h.includes('tech stack') || h.includes('tech_stack') || h.includes('techstack'));

  return parsed.slice(1).map((cols, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const title = titleIdx !== -1 ? cols[titleIdx]?.trim() : '';
    const trackRaw = trackIdx !== -1 ? cols[trackIdx]?.trim() : '';

    if (!title) {
      return { rowNumber, project: null, error: `Row ${rowNumber}: Project Title is required` };
    }
    const track = trackRaw ? normalizeTrack(trackRaw) : null;
    if (!track) {
      return { rowNumber, project: null, error: `Row ${rowNumber}: Project Track "${trackRaw || '(blank)'}" is missing or unrecognized` };
    }

    const techStackRaw = techStackIdx !== -1 ? cols[techStackIdx]?.trim() : '';
    const techStack = techStackRaw ? techStackRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    return {
      rowNumber,
      error: null,
      project: {
        title,
        track,
        problemStatement: coreLearningIdx !== -1 ? cols[coreLearningIdx]?.trim() || undefined : undefined,
        endUsersDefined: expectedOutputIdx !== -1 ? cols[expectedOutputIdx]?.trim() || undefined : undefined,
        description: featuresIdx !== -1 ? cols[featuresIdx]?.trim() || undefined : undefined,
        techStack,
      },
    };
  });
}

export default function ProjectCsvImportModal({ open, onClose, onImportSuccess }: ProjectCsvImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showSuccess, showError } = useToast();

  const handleClose = () => {
    setCsvText('');
    onClose();
  };

  const handleUpload = async () => {
    if (!csvText) return;
    const parsed = parseCSV(csvText);
    if (parsed.length <= 1) return;

    const rows = parseRows(parsed);
    const firstError = rows.find(r => r.error);
    if (firstError) {
      showError(firstError.error!);
      return;
    }

    const projects = rows.map(r => r.project!) as ProjectCreateInput[];
    setImporting(true);
    try {
      await apiCreateProjectsBulk(projects);
      showSuccess(`Successfully imported ${projects.length} project templates!`);
      onImportSuccess();
      handleClose();
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
          Upload or paste a CSV of project catalog templates. Project Title and Project Track are required for every row —
          if any row is missing them or has an unrecognized track, nothing will be imported.
        </p>

        <div className="bg-zinc-800/40 p-3 rounded-lg text-xs font-mono text-gray-400 space-y-1">
          <span className="text-gold">Expected Headers:</span>
          <div className="text-white">Project Track, Project Title, Core learning, Expected output, Must Have Features and Functionalities, Tech Stack (optional)</div>
          <span className="text-gray-500 block pt-1">Valid tracks:</span>
          <div>{TRACKS.join(', ')}</div>
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
            placeholder="Project Track,Project Title,Core learning,Expected output,Must Have Features and Functionalities..."
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
      </div>
    </Modal>
  );
}
